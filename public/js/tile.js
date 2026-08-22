/* part of the ronin-cowork client — see js/README.md */
/**
 * THE TILE — one cell of the coworkspace, and nothing more.
 *
 * A tile is a header (session picker, dials, chip, buttons), a mount point, and the
 * commons panel that overlays it when no session is showing. It COMPOSES one of two
 * views and never owns the machinery of either:
 *
 *   🔒 locked   `termview.js`  the untouched `tmux attach` mirror
 *   🔓 unlocked `tapeview.js`  RIREKI's client-side render, fed from the tape
 *
 * with the socket beside them both (`tilewire.js`) and the text entry its own module
 * (`composer.js`). Until 2026-08-13 all four lived in this class — 1,270 lines, and
 * the tape half of it was RIREKI's render squatting in the coworkspace (KOTOBA has
 * RIREKI covering "capture, storage, render and the consumers"). The owner's ruling:
 * the tile is a thin cell; even the render is separate from it.
 *
 * Construction order is load-bearing and always has been: `this.body` must exist
 * before anything mounts into it. One line breaking that rule — an appendChild
 * nineteen lines early — threw in this constructor and took the whole UI down on
 * 2026-08-08. Views mount in DOM order: tape, then the commons panel, then xterm.
 */
import { createSession, deleteSession, fetchSessions } from './api.js';
import { request } from './request.js';
import { toast } from './ui.js';
import { taskData, refreshHome } from './home.js';
import { IS_TOUCH, NEW, S, saveState, serviceMissing, tiles } from './state.js';
import { buildHome } from './commons.js';
import { installDesk } from './tiledesk.js';
import { guard } from './errors.js';
import { buildLadder } from './shingo.js';
import { buildTileHead, lockedTitle, syncTileHead } from './tilehead.js';
import { openJobMenu } from './widgets.js';
import { dvrStep } from './dvr.js';
import { TapeView } from './tapeview.js';
import { TermView } from './termview.js';
import { TileWire } from './tilewire.js';
import { buildComposer } from './composer.js';

export class Tile {
  constructor(index) {
    this.index = index;
    this.session = null;
    this.pending = ''; // UNLOCKED: locally-parked typed text (sent as one parcel on Enter)
    this.strip = null; // the thin bar showing this.pending over the tile
    this.composer = null; // the unlocked tile's text entry (built on first use)
    this.tapeAt = null; // last tape offset seen — the resume point on reconnect
    // THIS TILE's transport. `S.locked` is only the default a new tile is born with.
    this.locked = S.locked;

    // The header — the picker, the dials, the chip, the buttons. Construction only;
    // every callback in it lands back here.
    // Every control the table declared, under the name the table gave it. Held as
    // references rather than re-queried: on touch these nodes are RELOCATED into the app
    // bar (js/tiledrop.js), and a later `querySelector` on the tile would find nothing.
    Object.assign(this, buildTileHead(this));

    // 🔓 THE UNLOCKED VIEW — mounted first, so the tape sits under the panel and the
    // terminal in the stack, exactly as before.
    this.tape = new TapeView(this.body, { onMore: () => this.wire.send({ t: 'more' }) });

    // Home panel (the default state of a sessionless tile — and where a tile lands
    // when its session dies). Overlays the terminal; hidden while connected.
    const home = buildHome(this);
    this.home = home.el;
    this.renderHome = home.render;
    this.showPane = home.showPane;
    // ▧ Docs on ONE file. Raw: it shows a pane, it does not raise the panel — `openDoc` is
    // the act. See js/tiledocs.js.
    this.showDoc = home.openDoc;
    this.body.appendChild(this.home);
    // THE ADMIN DESK — a sibling of the Commons, not a room in it (js/tiledesk.js).
    installDesk(this, home.askPersonalAssistant);

    // SHINGO 信号: this session's ladder, read off its TEGAMI. The chip (built with the
    // header) is the indicator; tapping it is ALWAYS the ladder, gate or not.
    // Read-only — nothing here can touch the session.
    this.tegami = null;
    this.ladderOpen = false;

    // 🔒 THE LOCKED VIEW — xterm, opened into the body after the panel, as before.
    this.term = new TermView(this.body, {
      // Locked: key-for-key to the host (the mirror, unchanged). Unlocked: DVR input rules.
      onData: (d) => (this.locked ? this.sendRaw(d) : this.dvrInput(d)),
      onResize: ({ cols, rows }) => this.wire.send({ t: 'r', c: cols, r: rows }),
      onSelection: (s) => {
        S.lastSelection = s;
      },
    });

    // THE SOCKET — beside both views, owned by neither.
    this.wire = new TileWire({
      onStatus: (state) => this.setDot(state),
      onOpen: () => {
        this.doFit();
        this.wire.send({ t: 'r', c: this.term.cols, r: this.term.rows });
      },
      onControl: (m) => this.onControl(m),
      onBytes: (b) => (this.tapeMode ? this.tape.appendBytes(b) : this.term.write(b)),
      onDrop: () => this.flashDrop(),
      reopen: (session) => this.connect(session),
    });

    if (IS_TOUCH) {
      // Touch (iPhone/iPad): tap only activates the tile. Typing is via the compose
      // bar at the bottom; drag the terminal to scroll.
      this.body.addEventListener('pointerdown', () => this.activate());
      this.term.wireDragScroll({
        isLocked: () => this.locked,
        overHome: (el) => this.home.contains(el),
        sendRaw: (d) => this.sendRaw(d),
        activate: () => this.activate(),
      });
    } else {
      // Desktop: click focuses the terminal. Works great — left untouched.
      // (Home-panel clicks must NOT steal focus into the terminal, though.)
      this.body.addEventListener('pointerdown', (e) => {
        if (this.home.contains(e.target)) {
          this.activate();
          return;
        }
        this.focusTerminal();
      });
      // A drag that was meant to be a copy and silently was not — say the key.
      this.term.wireCopyHint({
        isLocked: () => this.locked,
        overHome: (el) => this.home.contains(el),
      });
    }
    // The wheel is xterm's business in BOTH modes now.
    //
    // Locked: the event flows through to xterm, which turns it into mouse escapes for
    // tmux — exactly as the mirror always had it, untouched.
    // Tape-fed: the transcript is a plain scrollable div and the browser scrolls it.
    // Marking a tile active on header focus, without stealing keyboard focus —
    // otherwise iOS closes the <select> picker the instant it opens.
    this.el.addEventListener('focusin', (e) => {
      this.activate();
      if (!IS_TOUCH && this.body.contains(e.target) && !this.home.contains(e.target)) this.term.focus();
    });
    this.select.addEventListener('pointerdown', () => this.activate());
    this.select.addEventListener('change', () => this.onSelect());
    // The lock sits on the TILE, because a tile is what it acts on.
    if (S.streamOff) {
      // No record service on this install: the 🔓 view is off and the switch is
      // inert — visible but opaque, on every device, so it reads as "not plugged
      // in" rather than missing. Touch keeps the button (there is nothing to hide
      // it FOR: fixed-unlocked needs the tape, and there is no tape).
      this.lockEl.classList.add('off');
    } else if (IS_TOUCH) this.lockEl.style.display = 'none'; // phone is fixed-unlocked
    this.syncLock();

    this.ro = new ResizeObserver(() => this.doFit());
    this.ro.observe(this.body);

    this.refreshOptions();
    this.showHome();
  }

  /**
   * Show the admin panel over the terminal. `which` picks the pane — 'sessions'
   * (Home: the list + macro forms) or 'new' (put a session out). An empty tile
   * lands on Home; a connected tile keeps whatever you last looked at, so the
   * panel is a place you can come back to rather than a one-way screen.
   */
  showHome(which) {
    this.lowerDesk(); // one overlay at a time — js/tiledesk.js
    this.home.classList.add('show');
    // Home is where a tile lands — empty or not. New session is one tab away.
    if (which) this.showPane(which);
    else if (!this.session) this.showPane('sessions');
    this.renderHome();
    refreshHome(); // pull fresh status/gauge readings for the list
  }

  hideHome() {
    this.home.classList.remove('show');
  }

  /** Open one of this session's docs over this tile — 📄 on the header (2026-08-18; why it
   *  clobbers the terminal is the owner's own reasoning, in js/tiledocs.js). `showHome()`
   *  bare on purpose: it raises the panel and leaves the pane alone, because `showDoc` is
   *  about to name it — naming it twice redraws ▧ Docs' list before opening the file. */
  openDoc(path) {
    this.showHome();
    this.showDoc(path);
  }

  /**
   * ⛩ IS A TOGGLE — press it again and the Commons goes away (owner, 2026-08-17).
   *
   * It was a one-way door for a day: ⛩ called showHome() and pressing it a second time
   * did nothing at all, so the only way back to the pane was the ✕ on the tab strip. A
   * control that opens a thing and then goes dead is a control you press twice and
   * distrust. `#brandbtn` had carried the right logic since long before — this is that
   * logic, moved here so the bar's ⛩, the brand and the tile head's ⛩ cannot drift into
   * three answers to one question.
   *
   * THE `this.session` GUARD IS LOAD-BEARING and is the reason this is not a plain flip:
   * an empty tile has NOTHING behind the Commons, so hiding it would leave the owner
   * staring at a blank cell with no way back in. On a tile with no session ⛩ stays a
   * one-way door, on purpose.
   *
   * The pane check means ⛩ closes the Commons only when it is showing the room ⛩ opens.
   * Pressed while you are reading Docs it takes you to ⌂ Roster — the destination it
   * promises — rather than dismissing the panel out from under you.
   */
  toggleHome(which = 'sessions') {
    if (this.homeVisible() && this.home.dataset.pane === which && this.session) this.hideHome();
    else this.showHome(which);
  }

  homeVisible() {
    return this.el.style.display !== 'none' && this.home.classList.contains('show');
  }

  refreshOptions() {
    const cur = this.session;
    this.select.innerHTML = '';
    this.select.add(new Option('— pick session —', ''));
    for (const s of S.sessions) {
      // NO MARK IN THE PICKER. It was prefixed here too, and the collapsed <select> then
      // showed the current session's icon immediately beside the job button showing the
      // same icon — the same fact twice, an inch apart. The button is the one that keeps
      // it: it is pressable, it carries the name in its tooltip, and it says `?` when
      // nobody has said. Surveying every session's job is the ⌂ Roster's work, and the
      // roster draws them all.
      const label = `${s.name}${s.attached ? ' •' : ''}`;
      this.select.add(new Option(label, s.name));
    }
    // keep a stale-but-connected session visible even if it left the list
    if (cur && !S.sessions.some((s) => s.name === cur)) {
      this.select.add(new Option(`${cur}  (gone?)`, cur));
    }
    this.select.add(new Option('➕ new session…', NEW));
    this.select.value = cur || '';
    this.syncHeader();
    this.refreshCtx();
    this.refreshTegami();
  }

  /** Point the gauge at the session's context reading (null = no reading, gauge hides). */
  async refreshCtx() {
    const session = this.session;
    if (!session) {
      this.gauge.set(null);
      return;
    }
    const r = await request('/api/sessions/' + encodeURIComponent(session) + '/ctx', { cache: 'no-store' });
    if (this.session !== session) return;
    this.gauge.set(r.ok ? r.data.ctx : null);
    this.setFooter(r.ok ? r.data.ctx : null, r.ok ? r.data.model : null);
  }

  /**
   * Re-read the session's letter. A mechanical read and nothing else: no check, no
   * proof, no disagreement with what the agent wrote. Null = no ladder up, chip hides.
   */
  async refreshTegami() {
    const session = this.session;
    // The letter is MICHI's. No michi = no /tegami routes at all, so don't fetch into
    // a 404 — the chip simply never shows, same as a session with no letter.
    if (!session || serviceMissing('michi')) {
      this.chip.set(null);
      this.closeLadder();
      return;
    }
    const r = await request('/api/sessions/' + encodeURIComponent(session) + '/tegami', { cache: 'no-store' });
    if (this.session !== session) return;
    // A failed read keeps the last chip rather than blanking it — the poll heals it.
    if (r.kind === 'network') return;
    this.tegami = r.ok ? r.data : null;
    this.chip.set(this.tegami);
    // 📄 reads its count off the letter (2026-08-18) and this is the only place the letter
    // changes. Measured without it: switch a tile from a session with docs to one with none
    // and 📄 stayed lit, claiming the previous session's docs until the roster poll redrew.
    // `syncTileHead`, not `syncHeader` — the reading pass, without re-fetching the dial.
    syncTileHead(this);
    if (this.ladderOpen) this.drawLadder();
    if (!this.tegami) this.closeLadder();
  }

  /*
   * `toggleLetter` / `closeLetter` were here until 2026-08-17. They drew the TEGAMI file
   * verbatim over the pane, opened from a ⛩ in this tile's header, and they were the only
   * client reader of `/api/sessions/:name/tegami/raw`. The owner removed that button — the
   * torii now means "the Commons" everywhere — so the panel, its opener and `buildLetter`
   * all went with it rather than lingering as an unreachable surface.
   *
   * The server route is MICHI's and is untouched: a service owns its own endpoints, and
   * this client no longer being a consumer is not a reason to take one away.
   */

  toggleLadder() {
    if (this.ladderOpen) this.closeLadder();
    else {
      this.ladderOpen = true;
      this.drawLadder();
    }
  }

  closeLadder() {
    this.ladderOpen = false;
    this.el.querySelector('.shingo-ladder')?.remove();
    this.chip.el.classList.remove('open');
  }

  /**
   * Put everything away that is covering the pane: this tile's ladder and letter, and
   * the page-level sheets (メ, ニ, ⚡) which are not this tile's to own but are in the
   * way just the same.
   *
   * One method rather than a dismissal at each call site, because "what counts as
   * open" is the thing that will grow — the next sheet someone adds should be closed
   * by every caller automatically, not by remembering to add it in three places.
   *
   * The き Commons menu used to be dismissed here too. It is gone (2026-08-17): ⛩
   * Commons goes straight to ⌂ Roster and drops nothing, so there is no fourth surface
   * left to put away. If a bar control ever drops a menu again, it is closed HERE.
   */
  clearOverlays() {
    this.closeLadder();
    document
      .querySelectorAll('.tdrop.open, .tmac.open')
      .forEach((m) => m.classList.remove('open'));
  }

  /** Unroll the ladder under the header — same data as the chip, at full zoom. */
  drawLadder() {
    this.el.querySelector('.shingo-ladder')?.remove();
    const box = buildLadder(this.tegami);
    this.el.querySelector('.tile-head').after(box);
    this.chip.el.classList.add('open');
    // Open ON the rung you are standing on. A long ladder scrolls, and opening it at
    // rung 1 hides the one thing you opened it for — the band, and any gate near it.
    const now = box.querySelector('.sl-row.now');
    if (now) now.scrollIntoView({ block: 'center' });
  }

  /** Point the dial at the session's current @ronin-control (truth lives on tmux). */
  async refreshControl(announce = false) {
    const session = this.session;
    if (!session) return this.dial.set('write');
    const r = await request('/api/sessions/' + encodeURIComponent(session) + '/control', { cache: 'no-store' });
    if (r.ok && this.session === session) this.dial.set(r.data.control || 'write', announce);
  }

  /** Dial tapped: set the new position on the server, then re-read to reflect truth. */
  async pickControl(v) {
    const session = this.session;
    if (!session) return;
    const r = await request('/api/sessions/' + encodeURIComponent(session) + '/control', {
      method: 'POST',
      json: { control: v },
    });
    // The toast, not an alert: a browser alert over a live terminal steals the
    // keyboard, and the dial's own re-read below already shows the true position.
    if (!r.ok) toast(`could not set control — ${r.message}`, false);
    this.refreshControl(true);
  }

  /** 🏷 shows how many groups this session is in — the label an agent can address it by. */
  /**
   * Set what this session is doing, by hand — `session_task` in its TEGAMI, the same
   * field the agent maintains with `write_tegami`. The owner is the other writer, for an
   * agent that has not re-marked itself; the dial and permissions are untouched.
   *
   * NOT JUST A RE-LABEL: the server hands it to the task observer, which delivers the
   * new task's reading into the session exactly once (src/task-watch.ts), whoever
   * authored it. THE TASK ONLY — `job_role` is birth-fixed and has no menu.
   *
   * The list is updated locally before the ws poll gets there, so the mark moves under
   * your finger; the poll then confirms it, and would correct it if the write lost a race.
   */
  async pickJob(anchor) {
    if (!this.session) return;
    const session = this.session;
    const cur = S.sessions.find((x) => x.name === session);
    openJobMenu(anchor, taskData || [], (cur && cur.session_task) || '', async (job) => {
      const r = await request('/api/sessions/' + encodeURIComponent(session) + '/session_task', {
        method: 'POST',
        json: { session_task: job },
      });
      if (!r.ok) {
        toast(`could not set the task — ${r.message}`, false);
        return;
      }
      const live = S.sessions.find((x) => x.name === session);
      if (live) live.session_task = r.data.session_task ?? job;
      tiles.forEach((t) => {
        t.syncHeader();
        t.refreshOptions();
      });
      refreshHome();
    });
  }

  /** 🔒 — wrapped, because a throw from a click lands on the window handler, which can
   *  REPORT it but not repair anything; a bug in the flip would cost the pane it flips. */
  flipLock() {
    guard('lock flip', () => {
      if (S.streamOff) return; // no record service: the switch is decoration
      this.activate();
      this.setLocked(!this.locked);
    });
  }

  openNote() {
    if (S.notePanel) S.notePanel.open(this.session);
  }

  openTags() {
    if (S.tagPanel) S.tagPanel.open(this.session);
  }

  /**
   * THE HEADER'S STATE, in one pass.
   *
   * Every control on the header that depends on a session is decided HERE, together.
   * They were decided in four places before, which is how three of them ended up never
   * being decided at all: 🏷 📝 the mark and the dial went inert with no session while ⛩
   * ⚡ 🗑 stayed lit, though a letter, a macro drop and a kill are every bit as
   * meaningless without one. The rule is now visible in one list instead of implied by
   * which functions happened to exist.
   *
   * `setInert` is the only way any of them is dimmed — never `disabled`, which would take
   * the hover help with it (see widgets.js), and never a bare class, which would leave
   * the reason unsaid.
   */
  syncHeader() {
    this.refreshControl(); // async: the dial's position is the server's truth
    syncTileHead(this);
  }

  async onSelect() {
    const v = this.select.value;
    if (v === NEW) {
      const name = (prompt('New tmux session name (letters, digits, _ or -):') || '').trim();
      this.select.value = this.session || '';
      if (!name) return;
      try {
        await createSession(name);
        await fetchSessions();
        this.connect(name);
      } catch (e) {
        toast('could not create the session — ' + e.message, false);
      }
      return;
    }
    if (!v) {
      this.detach();
      return;
    }
    this.connect(v);
  }

  /** Mark this tile active (visual highlight + keystroke target) without grabbing keyboard focus. */
  activate() {
    if (S.active === this) return;
    S.active = this;
    tiles.forEach((t) => t.el.classList.toggle('active', t === this));
  }

  /** Activate and pull keyboard focus into the terminal. */
  focusTerminal() {
    this.activate();
    this.term.focus();
  }

  /**
   * Write a person's keystrokes to the pane. Returns whether they were delivered —
   * a closed socket DROPS them, loudly (see tilewire.js).
   */
  sendRaw(d) {
    return this.wire.sendInput(d);
  }

  /** Housekeeping down the same socket (the ⤓ key's `{t:'bottom'}`). Quiet by design. */
  send(msg) {
    return this.wire.send(msg);
  }

  /** The composer's box, for the ⚡ macro prefill — null until the composer exists. */
  get composerTa() {
    return this.composer ? this.composer.ta : null;
  }

  /**
   * The socket was down and typed input went nowhere. Say so on the tile itself:
   * silent loss is the defect this replaces, and the composer's own `noconn` flash
   * only ever covered the unlocked box.
   */
  flashDrop() {
    this.el.classList.add('dropped');
    clearTimeout(this.dropTimer);
    this.dropTimer = setTimeout(() => this.el.classList.remove('dropped'), 1200);
  }

  /** UNLOCKED input: the parked-parcel rule lives in dvr.js; this applies its answer. */
  dvrInput(d) {
    const { pending, send } = dvrStep(this.pending, d);
    this.pending = pending;
    if (send !== null) this.sendRaw(send);
    this.renderPending();
  }

  /** Control messages off the socket — the protocol, in one place. */
  onControl(m) {
    if (m.t === 'error') {
      this.term.writeln('\r\n\x1b[31m[grid] ' + m.m + '\x1b[0m');
      this.setDot('off');
    } else if (m.t === 'exit') {
      this.term.writeln('\r\n\x1b[33m[grid] session ended.\x1b[0m');
      this.setDot('off');
    } else if (m.t === 'ready') {
      // Honest UI: scrollback above the live screen of an alt-screen app is
      // RECONSTRUCTED from the tape by collapsing repaints, not a transcript of
      // what was on screen. Never present the second as the first.
      this.tapeAt = m.mode === 'tape' && m.seg != null ? { seg: m.seg, off: m.off } : null;
      this.tape.setAltNote(m.mode === 'tape' && m.provenance === 'derived', m.partial);
    } else if (m.t === 'lines') {
      this.tape.appendRecs(m.recs || [], !!m.reset);
    } else if (m.t === 'frame') {
      this.tape.setFrame(m.text || '');
    } else if (m.t === 'older') {
      this.tape.prepend(m.recs || [], m.atTop);
    } else if (m.t === 'mark') {
      // Resume point for a reconnect: a tape offset always moves, unlike tmux
      // history_size, which is permanently 0 on an alt-screen pane.
      if (m.seg != null) this.tapeAt = { seg: m.seg, off: m.off };
    }
  }

  /**
   * Flip THIS tile's transport and reconnect only this tile.
   *
   * Locked reconnects the attach mirror; unlocked reconnects the tape-fed transcript.
   * Parked text is discarded on a flip — it is visible in the strip, so nothing vanishes
   * silently. `S.locked` follows as the default the NEXT tile is born with, so the switch
   * still feels like it remembers what you prefer without acting on panes you did not
   * touch.
   */
  setLocked(on) {
    // With no record service there is nothing behind 🔓 — the tile stays locked no
    // matter who asks (the inert button, a saved default, a future caller).
    this.locked = S.streamOff ? true : !!on;
    S.locked = this.locked;
    this.pending = '';
    this.renderPending();
    this.syncLock();
    if (this.session && this.wire.wantOpen) this.connect(this.session);
    saveState();
  }

  /** The switch shows this tile's own state, in this tile's own head. */
  syncLock() {
    if (!this.lockEl) return;
    this.lockEl.textContent = this.locked ? '🔒' : '🔓';
    this.lockEl.classList.toggle('armed', !this.locked);
    /**
     * Say what the two modes ARE, not what they are called.
     *
     * "Locked/Unlocked" tells you nothing on its own, and the two obvious glosses are
     * both wrong. "Unlocked streams the terminal" is wrong because nothing streams from
     * tmux — the bytes come off a recording. "Unlocked has no tmux connection" is worse:
     * it reads as though the terminal is not running, when the session is live either
     * way. What actually differs is whether THIS VIEW is attached, and the consequence
     * a reader needs is the LAG that follows from not being.
     *
     * The other thing people assume about a recording and should not is that it is
     * read-only, so it says plainly that typing still reaches the terminal. No "click
     * to lock" — the button is a button, and they can try it.
     */
    this.lockEl.title = this.locked
      ? lockedTitle()
      : '🔓 UNLOCKED — the session is still running in tmux; this view is not attached to it. You are reading what that terminal painted, captured byte by byte as it went, so the text can lag the live pane. Scrolling is instant and stays in your browser, typing still goes to the real terminal, and the text SELECTS AND COPIES like any web page.';
    if (S.streamOff) this.lockEl.title = 'The unlocked view is off — no record service is installed.';
  }

  /**
   * How full the context is and which model is answering. Both are scraped from
   * ORDINARY PANE TEXT (src/ctx.ts) — the same status line the CLI already prints —
   * never from agent internals. A pane with no status line (a plain shell) reports
   * null for both, and the reading collapses rather than showing a placeholder.
   *
   * WHERE IT SHOWS. On touch, the Status row of the tile's ⋯ drop, beside the ladder.
   * It used to be a strip above the text entry — a touch-only element, never once
   * visible on desktop — and the bottom of a phone is the keyboard and the box you
   * type in. There is no room down there, so nothing lives there any more.
   * On desktop the gauge in the header carries the percent, as it always has.
   */
  setFooter(pct, model) {
    this.ctxPct = pct;
    this.ctxModel = model;
    if (!this.dropStatus) return;
    const bits = [];
    if (pct != null) bits.push(`ctx ${pct}%`);
    if (model) bits.push(model);
    // The ⛽ is the gauge sitting next to it in the row, so the words don't repeat it.
    this.dropStatus.textContent = bits.join(' · ') || 'Status';
  }

  setComposer(on) {
    if (!this.composer) {
      if (!on) return;
      this.composer = buildComposer(this.body, {
        activate: () => this.activate(),
        clearOverlays: () => this.clearOverlays(),
        connected: () => this.wire.connected(),
        send: (text) => this.sendRaw(text),
        scrollToBottom: () => this.tape.scrollToBottom(),
      });
    }
    this.composer.show(on);
  }

  /** The thin bar showing parked text (visible only when something is parked). */
  renderPending() {
    if (!this.strip) {
      const s = document.createElement('div');
      s.className = 'dvr-strip';
      this.body.appendChild(s);
      this.strip = s;
    }
    this.strip.textContent = this.pending;
    this.strip.classList.toggle('show', !!this.pending);
  }

  setDot(state) {
    this.dot.className = 'dot ' + state;
    this.dot.title = state === 'on' ? 'connected' : state === 'wait' ? 'connecting…' : 'disconnected';
  }

  detach() {
    this.tape.setAltNote(false);
    this.wire.close();
    this.session = null;
    this.select.value = '';
    this.syncHeader();
    this.gauge.set(null);
    this.tegami = null;
    this.chip.set(null);
    this.closeLadder();
    this.setDot('off');
    this.term.reset();
    this.showHome();
    saveState();
  }

  /** Destroy the tmux session on the host (root + its grid_* viewers), then detach. */
  async kill() {
    const name = this.session;
    if (!name) return;
    if (!confirm(`Kill tmux session "${name}"? This ends the session and everything running in it.`)) return;
    try {
      await deleteSession(name);
    } catch (e) {
      toast('could not kill it — ' + e.message, false);
      return;
    }
    this.detach();
    fetchSessions();
  }

  connect(session) {
    this.hideHome();
    this.session = session;
    // make sure the option exists & is selected
    if (![...this.select.options].some((o) => o.value === session)) {
      this.select.add(new Option(session, session), this.select.options.length - 1);
    }
    this.select.value = session;
    this.syncHeader();
    this.refreshCtx();
    this.refreshTegami();

    this.term.reset();
    this.tapeMode = !this.locked;
    this.tape.reset(this.tapeMode);
    this.setComposer(this.tapeMode);
    this.el.classList.toggle('tape-on', this.tapeMode);
    this.setDot('wait');
    this.doFit();

    this.wire.open({
      session,
      locked: this.locked,
      cols: this.term.cols,
      rows: this.term.rows,
      tapeAt: this.tapeAt,
    });

    saveState();
  }

  doFit() {
    this.term.fit(this.el.style.display === 'none');
  }
}
