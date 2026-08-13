/* part of the tmux-ronin client — see js/README.md */
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
import { refreshHome } from './home.js';
import { IS_TOUCH, NEW, S, saveState, tiles } from './state.js';
import { buildHome } from './commons.js';
import { guard } from './errors.js';
import { buildLadder, buildLetter } from './shingo.js';
import { LOCKED_TITLE, buildTileHead } from './tilehead.js';
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
    const head = buildTileHead(this);
    this.el = head.el;
    this.select = head.select;
    this.body = head.body;
    this.dot = head.dot;
    this.dial = head.dial;
    this.gauge = head.gauge;
    this.torii = head.torii;
    this.chip = head.chip;
    this.lockEl = head.lockEl;
    this.noteBtn = head.noteBtn;
    this.tagBtn = head.tagBtn;

    // 🔓 THE UNLOCKED VIEW — mounted first, so the tape sits under the panel and the
    // terminal in the stack, exactly as before.
    this.tape = new TapeView(this.body, { onMore: () => this.wire.send({ t: 'more' }) });

    // Home panel (the default state of a sessionless tile — and where a tile lands
    // when its session dies). Overlays the terminal; hidden while connected.
    const home = buildHome(this);
    this.home = home.el;
    this.renderHome = home.render;
    this.showPane = home.showPane;
    this.body.appendChild(this.home);

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
    if (IS_TOUCH) this.lockEl.style.display = 'none'; // phone is fixed-unlocked
    // Wrapped: a throw from an event callback lands on the window handler, which can
    // REPORT it but cannot repair anything — the guards around construction and init
    // never see it. Without this, a bug in the flip costs the pane it was flipping.
    this.lockEl.addEventListener('click', () =>
      guard('lock flip', () => {
        this.activate();
        this.setLocked(!this.locked);
      }),
    );
    this.syncLock();
    this.noteBtn.addEventListener('click', () => {
      if (this.session && S.notePanel) S.notePanel.open(this.session);
    });
    this.tagBtn.addEventListener('click', () => {
      if (this.session && S.tagPanel) S.tagPanel.open(this.session);
    });
    // メ goes to commons — it is a way IN to the menu, not a close. The session keeps
    // streaming behind the panel and the ✕ on the tab strip brings you back to it.
    // (Stopping viewing is still the blank option in the session picker; killing is 🗑.)
    this.el.querySelector('.menu').addEventListener('click', () => this.showHome('sessions'));
    this.el.querySelector('.kill').addEventListener('click', () => this.kill());

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

  homeVisible() {
    return this.el.style.display !== 'none' && this.home.classList.contains('show');
  }

  refreshOptions() {
    const cur = this.session;
    this.select.innerHTML = '';
    this.select.add(new Option('— pick session —', ''));
    for (const s of S.sessions) {
      const label = `${(s.leads || []).length ? '人 ' : ''}${s.name}${s.attached ? ' •' : ''}`;
      this.select.add(new Option(label, s.name));
    }
    // keep a stale-but-connected session visible even if it left the list
    if (cur && !S.sessions.some((s) => s.name === cur)) {
      this.select.add(new Option(`${cur}  (gone?)`, cur));
    }
    this.select.add(new Option('➕ new session…', NEW));
    this.select.value = cur || '';
    this.updateNoteBtn();
    this.updateTagBtn();
    this.refreshControl();
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
    try {
      const r = await fetch('/api/sessions/' + encodeURIComponent(session) + '/ctx', { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (this.session !== session) return;
      this.gauge.set(r.ok ? d.ctx : null);
      this.setFooter(r.ok ? d.ctx : null, r.ok ? d.model : null);
    } catch (_) {}
  }

  /**
   * Re-read the session's letter. A mechanical read and nothing else: no check, no
   * proof, no disagreement with what the agent wrote. Null = no ladder up, chip hides.
   */
  async refreshTegami() {
    const session = this.session;
    if (!session) {
      this.chip.set(null);
      this.closeLadder();
      return;
    }
    try {
      const r = await fetch('/api/sessions/' + encodeURIComponent(session) + '/tegami', { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      if (this.session !== session) return;
      this.tegami = r.ok ? d : null;
      this.chip.set(this.tegami);
      if (this.ladderOpen) this.drawLadder();
      if (!this.tegami) this.closeLadder();
    } catch (_) {}
  }

  /**
   * The letter, verbatim — this tile's own session, opened from the ⛩ in its header.
   * Read-only, and never both panels at once.
   *
   * Deliberately NOT "show any session's letter": the board is a readout, and reading a
   * letter happens from the terminal tile. A torii on every board row marked nothing,
   * because everything had one.
   */
  async toggleLetter() {
    if (this.el.querySelector('.shingo-letter')) return this.closeLetter();
    const name = this.session;
    if (!name) return;
    this.closeLadder();
    let d = { file: '', text: null };
    try {
      const r = await fetch('/api/sessions/' + encodeURIComponent(name) + '/tegami/raw', {
        cache: 'no-store',
      });
      if (r.ok) d = await r.json();
    } catch (_) {}
    this.closeLetter();
    this.body.appendChild(buildLetter(d, () => this.closeLetter()));
    this.torii.classList.add('open');
  }

  closeLetter() {
    this.el.querySelector('.shingo-letter')?.remove();
    this.torii.classList.remove('open');
  }

  toggleLadder() {
    if (this.ladderOpen) this.closeLadder();
    else {
      this.closeLetter();
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
   * the page-level sheets (メ, ニ, ⚡, the Commons menu) which are not this tile's to
   * own but are in the way just the same.
   *
   * One method rather than a dismissal at each call site, because "what counts as
   * open" is the thing that will grow — the next sheet someone adds should be closed
   * by every caller automatically, not by remembering to add it in three places.
   */
  clearOverlays() {
    this.closeLadder();
    this.closeLetter();
    document
      .querySelectorAll('.tdrop.open, .tmac.open')
      .forEach((m) => m.classList.remove('open'));
    const menu = document.querySelector('.commons-menu');
    if (menu && !menu.hidden) {
      menu.hidden = true;
      document.getElementById('commonsbtn')?.setAttribute('aria-expanded', 'false');
    }
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
    if (!session) {
      this.dial.el.disabled = true;
      this.dial.set('write');
      return;
    }
    try {
      const r = await fetch('/api/sessions/' + encodeURIComponent(session) + '/control', { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (r.ok && this.session === session) {
        this.dial.el.disabled = false;
        this.dial.set(d.control || 'write', announce);
      }
    } catch (_) {}
  }

  /** Dial tapped: set the new position on the server, then re-read to reflect truth. */
  async pickControl(v) {
    const session = this.session;
    if (!session) return;
    try {
      const r = await fetch('/api/sessions/' + encodeURIComponent(session) + '/control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ control: v }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert('Could not set control:\n' + (d.error || `HTTP ${r.status}`));
      }
    } catch (_) {
      alert('Could not set control (network).');
    }
    this.refreshControl(true);
  }

  /** Reflect on the 📝 button whether this tile's session has a note (and disable when none). */
  updateNoteBtn() {
    const btn = this.noteBtn;
    if (!btn) return;
    const s = S.sessions.find((x) => x.name === this.session);
    const has = !!(s && s.hasNote);
    btn.classList.toggle('has-note', has);
    btn.disabled = !this.session;
    btn.title = !this.session ? 'Session note' : has ? 'Session note (has notes)' : 'Session note (empty)';
  }

  /** 🏷 shows how many groups this session is in — the label an agent can address it by. */
  updateTagBtn() {
    const btn = this.tagBtn;
    if (!btn) return;
    const s = S.sessions.find((x) => x.name === this.session);
    const tags = (s && s.tags) || [];
    btn.classList.toggle('has-tags', !!tags.length);
    btn.disabled = !this.session;
    btn.title = !this.session
      ? 'Groups'
      : tags.length
        ? 'Groups: ' + tags.join(', ')
        : 'Groups (none yet)';
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
        alert('Could not create session:\n' + e.message);
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
    this.locked = !!on;
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
      ? LOCKED_TITLE
      : '🔓 UNLOCKED — the session is still running in tmux; this view is not attached to it. You are reading what that terminal painted, captured byte by byte as it went, so the text can lag the live pane. Scrolling is instant and stays in your browser, typing still goes to the real terminal, and the text SELECTS AND COPIES like any web page.';
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
    this.updateNoteBtn();
    this.updateTagBtn();
    this.refreshControl();
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
      alert('Could not kill session:\n' + e.message);
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
    this.updateNoteBtn();
    this.updateTagBtn();
    this.refreshControl();
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
