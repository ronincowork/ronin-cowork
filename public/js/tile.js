/* part of the ronin-cowork client — see js/README.md */
/**
 * THE TILE — one cell of the coworkspace, and nothing more.
 *
 * A tile is a header (session name, dials, chip, buttons), a mount point, and the
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
import { fetchSessions, renameSession } from './api.js';
import { request } from './request.js';
import { toast } from './ui.js';
import { retireSession } from './session-retire.js';
import { IS_TOUCH, S, saveState, serviceMissing, tiles } from './state.js';
import { guard } from './errors.js';
import { buildLadder } from './shingo.js';
import { buildTileHead, syncTileHead } from './tilehead.js';
import { installTextDrops } from './tiledroptext.js';
import { dvrStep } from './dvr.js';
import { TapeView } from './tapeview.js';
import { TermView } from './termview.js';
import { TileWire } from './tilewire.js';
import { buildComposer } from './composer.js';
import { refreshKaki, setKakiPolicy } from './output.js';
import { refreshDesks } from './desks.js';
import { t } from './lexicon.js';

const readableSession = (name) => {
  const live = S.sessions.find((row) => row.name === name);
  return live?.title || String(name || '').split(/[_-]+/).filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
};

export class Tile {
  constructor(index) {
    this.index = index;
    this.session = null;
    this.pending = ''; // UNLOCKED: locally-parked typed text (sent as one parcel on Enter)
    this.strip = null; // the thin bar showing this.pending over the tile
    this.composer = null; // the unlocked tile's text entry (built on first use)
    this.tapeAt = null; // last tape offset seen — the resume point on reconnect
    this.kakiTimer = null;
    // THIS TILE's transport. `S.locked` is only the default a new tile is born with.
    this.output = S.streamOff ? 'locked' : (S.output || (S.locked ? 'locked' : 'terminal_mirror'));
    this.locked = this.output === 'locked';

    // The header — the session name, the dials, the chip, the buttons. Construction only;
    // every callback in it lands back here.
    // Every control the table declared, under the name the table gave it. Held as
    // references rather than re-queried: on touch these nodes are RELOCATED into the app
    // bar (js/tiledrop.js), and a later `querySelector` on the tile would find nothing.
    Object.assign(this, buildTileHead(this));
    // Text dropped on the tile — an @mention or a doc reference — lands like a macro's.
    installTextDrops(this);

    // 🔓 THE UNLOCKED VIEW — mounted first, so the tape sits under the panel and the
    // terminal in the stack, exactly as before.
    this.tape = new TapeView(this.body, {
      onMore: () => this.wire.send({ t: 'more' }),
      onSummaryNow: () => void this.refreshKaki(true, true),
      onSummaryPolicy: (policy) => void this.setKakiPolicy(policy),
    });


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
        overHome: () => false,
        sendRaw: (d) => this.sendRaw(d),
        activate: () => this.activate(),
      });
    } else {
      // Desktop: click focuses the terminal. Works great — left untouched.
      // (Home-panel clicks must NOT steal focus into the terminal, though.)
      this.body.addEventListener('pointerdown', (e) => {
        this.focusTerminal();
      });
      // A drag that was meant to be a copy and silently was not — say the key.
      this.term.wireCopyHint({
        isLocked: () => this.locked,
        overHome: () => false,
      });
    }
    // The wheel is xterm's business in BOTH modes now.
    //
    // Locked: the event flows through to xterm, which turns it into mouse escapes for
    // tmux — exactly as the mirror always had it, untouched.
    // Tape-fed: the transcript is a plain scrollable div and the browser scrolls it.
    // Marking a tile active on header focus, without stealing keyboard focus —
    // without stealing keyboard focus from controls in the head.
    this.el.addEventListener('focusin', (e) => {
      this.activate();
      // `this.home` (the tile commons) retired on 2026-08-28 with the grid page; a click in
      // the body threw on it for a few hours and took the terminal's focus with it.
      if (!IS_TOUCH && this.body.contains(e.target)) this.term.focus();
    });
    this.syncOutput();

    this.ro = new ResizeObserver(() => this.doFit());
    this.ro.observe(this.body);

    this.refreshSessionName();
  }

  async rename() {
    if (!this.session) return;
    const before = this.session;
    const wanted = window.prompt(t('head.rename_prompt', 'Rename session'), before);
    if (wanted == null || wanted.trim() === before) return;
    try {
      const next = await renameSession(before, wanted.trim());
      await fetchSessions();
      if (S.onSessionRenamed) S.onSessionRenamed(before, next);
      else this.connect(next);
    } catch (e) {
      toast(t('head.rename_failed', 'Could not rename session: {reason}', { reason: e.message }), false);
    }
  }

  refreshSessionName() {
    this.sessionName.textContent = readableSession(this.session);
    this.sessionName.title = this.session || '';
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
    // The desks ride the same clock as the letter and are cowork's own (`/api/desks`),
    // so the ⑂ reading is live on a box with no services at all.
    if (session) await refreshDesks().catch(() => {});
    if (this.session !== session) return;
    // The letter is MICHI's. No michi = no /tegami routes at all, so don't fetch into
    // a 404 — the chip simply never shows, same as a session with no letter.
    if (!session || serviceMissing('michi')) {
      this.closeLadder();
      syncTileHead(this);
      return;
    }
    const r = await request('/api/sessions/' + encodeURIComponent(session) + '/tegami', { cache: 'no-store' });
    if (this.session !== session) return;
    // A failed read keeps the last chip rather than blanking it — the poll heals it.
    if (r.kind === 'network') return;
    this.tegami = r.ok ? r.data : null;
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
    this.workRecordBtn.classList.remove('open');
    this.workRecordBtn.setAttribute('aria-expanded', 'false');
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
    this.workRecordBtn.classList.add('open');
    this.workRecordBtn.setAttribute('aria-expanded', 'true');
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
   * Set what this session is doing, by hand — `session_role` in its TEGAMI, the same
   * field the agent maintains with `write_tegami`. The owner is the other writer, for an
   * agent that has not re-marked itself; the dial and permissions are untouched.
   *
   * NOT JUST A RE-LABEL: the server hands it to the task observer, which delivers the
   * new task's reading into the session exactly once (src/role-watch.ts), whoever
   * authored it. THE SESSION_ROLE ONLY — teams have their own controls.
   *
   * The list is updated locally before the ws poll gets there, so the mark moves under
   * your finger; the poll then confirms it, and would correct it if the write lost a race.
   */
  openNote() {
    if (S.notePanel) S.notePanel.open(this.session);
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
      this.term.writeln('\r\n\x1b[33m[grid] ' + t('tile.session_ended', 'session ended.') + '\x1b[0m');
      this.setDot('off');
    } else if (m.t === 'ready') {
      // Honest UI: scrollback above the live screen of an alt-screen app is
      // RECONSTRUCTED from the tape by collapsing repaints, not a transcript of
      // what was on screen. Never present the second as the first.
      this.tapeAt = m.mode === 'tape' && m.seg != null ? { seg: m.seg, off: m.off } : null;
      this.tape.setAltNote(m.mode === 'tape' && m.provenance === 'derived', m.partial);
    } else if (m.t === 'lines') {
      if (this.output === 'agent_summary') return;
      this.tape.appendRecs(m.recs || [], !!m.reset);
    } else if (m.t === 'frame') {
      if (this.output === 'agent_summary') return;
      this.tape.setFrame(m.text || '');
    } else if (m.t === 'older') {
      this.tape.prepend(m.recs || [], m.atTop);
    } else if (m.t === 'mark') {
      // Resume point for a reconnect: a tape offset always moves, unlike tmux
      // history_size, which is permanently 0 on an alt-screen pane.
      if (m.seg != null) this.tapeAt = { seg: m.seg, off: m.off };
    }
  }

  /** Change this tile's Output and reopen its viewer against the named server projection. */
  setOutput(value) {
    const previous = this.output;
    const allowed = new Set(['locked', 'terminal_mirror', 'detailed', 'condensed', 'cherry_pick', 'agent_summary']);
    this.output = S.streamOff || !allowed.has(value) ? 'locked' : value;
    this.locked = this.output === 'locked';
    S.output = this.output;
    S.locked = this.locked;
    this.pending = '';
    this.renderPending();
    this.syncOutput();
    if (this.tape) this.tape.setMode(this.output);
    if (this.kakiTimer) clearInterval(this.kakiTimer);
    this.kakiTimer = this.output === 'agent_summary'
      ? setInterval(() => void this.refreshKaki(false), 5000)
      : null;
    if (this.session && this.wire.wantOpen && previous !== this.output) this.connect(this.session);
    saveState();
  }

  syncOutput() {
    // The widget comes back as {el} like every built control — resolve it the same way
    // syncTileHead does, so this works whichever shape landed on the key.
    const sel = this.outputEl?.el ?? this.outputEl;
    if (!sel || !sel.options) return;
    sel.value = this.output;
    for (const option of [...sel.options])
      if ((S.streamOff && option.value !== 'locked') || (option.value === 'agent_summary' && serviceMissing('koshi'))) option.remove();
    sel.title = S.streamOff
      ? t('output.title_locked', 'Output — Locked only. Ronin Services is not installed.')
      : t('output.title_choose', 'Output — choose the live terminal or a RIREKI view');
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
    // The dot left the head on 2026-08-28; the state still rides the tile for the stylesheet.
    this.el.dataset.link = state;
  }

  detach() {
    this.tape.setAltNote(false);
    this.wire.close();
    this.session = null;
    this.sessionName.textContent = '';
    this.syncHeader();
    this.gauge.set(null);
    this.tegami = null;
    this.closeLadder();
    this.setDot('off');
    this.term.reset();
    saveState();
  }

  /** Destroy the tmux session on the host (root + its grid_* viewers), then detach. */
  async kill() {
    const name = this.session;
    if (!name) return;
    retireSession(name, this.index, async () => {
      this.detach();
      await fetchSessions();
    });
  }

  connect(session) {
    this.session = session;
    this.sessionName.textContent = readableSession(session);
    this.sessionName.title = session;
    this.syncHeader();
    this.refreshCtx();
    this.refreshTegami();

    this.term.reset();
    this.tapeMode = !this.locked;
    this.tape.setMode(this.output);
    this.tape.reset(this.tapeMode);
    this.setComposer(this.tapeMode);
    this.el.classList.toggle('tape-on', this.tapeMode);
    this.setDot('wait');
    this.doFit();

    this.wire.open({
      session,
      locked: this.locked,
      output: this.output,
      cols: this.term.cols,
      rows: this.term.rows,
      tapeAt: this.tapeAt,
    });

    if (this.output === 'agent_summary') void this.refreshKaki(true);

    saveState();
  }

  async refreshKaki(create, force = false) {
    return refreshKaki(this, request, create, force);
  }

  async setKakiPolicy(policy) {
    const r = await setKakiPolicy(this, request, policy);
    if (r && !r.ok) toast('could not change summary production — ' + r.message, false);
  }

  doFit() {
    this.term.fit(this.el.style.display === 'none');
  }
}
