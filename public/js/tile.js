/* part of the ronin-cowork client — see js/README.md */
import { fetchSessions, setSessionTitle } from './api.js';
import { request } from './request.js';
import { toast } from './ui.js';
import { retireSession } from './session-retire.js';
import { IS_TOUCH, S, saveState, serviceParked, tiles, WHEEL_DOWN } from './state.js';
import { guard } from './errors.js';
import { buildLadder } from './shingo.js';
import { buildTileHead, syncTileHead } from './tilehead.js';
import { installTextDrops } from './tiledroptext.js';
import { dvrStep } from './dvr.js';
import { TapeView } from './tapeview.js';
import { TermView } from './termview.js';
import { installTileControls, runTerminalAction, buildMobileControlButtons } from './terminal-controls.js';
import { TileWire } from './tilewire.js';
import { buildComposer } from './composer.js';
import { sendComposerMessage } from './composer-rules.js';
import { buildKeysRow } from './keysrow.js';
import { buildTileDocView } from './tile-doc-view.js';
import { isCoarse } from './tiledrop.js';
import { refreshKaki, setKakiPolicy } from './output.js';
import { desksOf } from './desks.js';
import { homeData } from './home.js';
import { get, subscribe } from './store.js';
import { t } from './lexicon.js';
import { makeTileTranscript } from './tile-transcript.js';
import { createSurfaceHost, TILE_SURFACES } from './surface-host.js';

const readableSession = (name) => {
  const live = S.sessions.find((row) => row.name === name);
  return live?.title || String(name || '').split(/[_-]+/).filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
};

let nextRetirementId = 0;

export class Tile {
  constructor(index, options = {}) {
    this.index = index;
    // Hosted tiles commonly share the display index 0. Retirement identity belongs to
    // this Tile instance so one open sheet never suppresses another tile's boundary.
    this.retirementId = `tile-${++nextRetirementId}`;
    this.session = null;
    this.transcriptOn = false;
    this.transcriptLevel = -1; // index into the route's readings while transcriptOn; -1 is Terminal
    this.transcriptReadings = []; // what the route offers, in order — T1 is the first
    this.transcriptState = null; // the route's last word on this Agent: available, empty, reason
    this.transcriptWantFirst = false; // pressed before the readings were known: move to the first once they are
    this.transcriptWantChat = false; // touch: open on the reading once the route says this Agent has one
    this.pending = ''; // UNLOCKED: locally-parked typed text (sent as one parcel on Enter)
    this.strip = null; // the thin bar showing this.pending over the tile
    this.composer = null; // the unlocked tile's text entry (built on first use)
    this.tapeAt = null; // last tape offset seen — the resume point on reconnect
    // THIS TILE's transport. `S.locked` is only the default a new tile is born with.
    this.output = S.streamOff ? 'locked' : (S.output || (S.locked ? 'locked' : 'terminal_mirror'));
    this.locked = this.output === 'locked';

    // The header — the session name, readings, and buttons. Construction only;
    // every callback in it lands back here.
    // Every control the table declared, under the name the table gave it. Held as
    // references rather than re-queried: on touch these nodes are RELOCATED into the app
    // bar (js/tiledrop.js), and a later `querySelector` on the tile would find nothing.
    Object.assign(this, buildTileHead(this));
    this.surfaceHost = createSurfaceHost(this.body, TILE_SURFACES, 'term');
    this.onMinimize = typeof options.onMinimize === 'function' ? options.onMinimize : null;
    this.emptyMark = document.createElement('div');
    this.emptyMark.className = 'tile-empty-mark';
    this.emptyMark.setAttribute('aria-hidden', 'true');
    const emptyLogo = document.createElement('img');
    emptyLogo.src = 'brand/nin-mark.svg';
    emptyLogo.alt = '';
    this.emptyMark.append(emptyLogo);
    this.body.append(this.emptyMark);
    // Text dropped on the tile — an @mention or a document reference — lands here.
    installTextDrops(this);

    // 🔓 THE UNLOCKED VIEW — mounted first, so the tape sits under the panel and the
    // terminal in the stack, exactly as before.
    this.tape = new TapeView(this.body, {
      onMore: () => this.wire.send({ t: 'more' }),
      onSummaryNow: () => void this.refreshKaki(true, true),
      onSummaryPolicy: (policy) => void this.setKakiPolicy(policy),
    });
    this.transcriptView = makeTileTranscript({
      cache: options.transcriptCache,
      onState: (state) => this.onTranscriptState(state),
    });
    this.body.append(this.transcriptView.el);


    // SHINGO 信号: this session's ladder, read off its TEGAMI. The chip (built with the
    // header) is the indicator; tapping it is ALWAYS the ladder, gate or not.
    // Read-only — nothing here can touch the session.
    this.tegami = null;
    this.ladderOpen = false;

    // 🔒 THE LOCKED VIEW — xterm, opened into the body after the panel, as before.
    this.term = new TermView(this.body, {
      // Locked: key-for-key to the host (the mirror, unchanged). Unlocked: DVR input rules.
      onUserData: (d) => {
        if (this.transcriptOn) return;
        return this.locked ? this.sendRaw(d) : this.dvrInput(d);
      },
      onProtocolData: (d) => this.wire.sendTerminalReply(d),
      onResize: ({ cols, rows }) => this.wire.send({ t: 'r', c: cols, r: rows }),
      onSelection: (s) => {
        this.lastSelection = s;
      },
    });
    installTileControls(this);
    this.docView = buildTileDocView(this);
    this.body.append(this.docView.el);

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
        if (this.term.ownsTarget(e.target)) this.focusTerminal();
      });
      // A drag that was meant to be a copy and silently was not — say the key.
      this.term.wireCopyHint({
        isLocked: () => this.locked,
        overHome: () => false,
      });
    }
    // The mirror's own ↓ latest (both pointers): with viewer mouse off the wheel scrolls
    // xterm's local buffer, which no server-side jump can end — the pill is the way back.
    this.term.wireJumpPill({ jump: () => this.jumpLatest() });
    // The wheel is xterm's business in BOTH modes now.
    //
    // Locked: xterm keeps the wheel — it scrolls its own local buffer, unless the app
    // in the pane holds mouse tracking, in which case xterm forwards the wheel and the
    // Tape-fed: the transcript is a plain scrollable div and the browser scrolls it.
    // Marking a tile active on header focus, without stealing keyboard focus —
    // without stealing keyboard focus from controls in the head.
    this.el.addEventListener('focusin', (e) => {
      this.activate();
      // the body threw on it for a few hours and took the terminal's focus with it.
      // Docs replaced that body overlay with a real editor. It owns its own focus just
      // as header controls do; only the terminal body itself redirects into xterm.
      if (!IS_TOUCH && this.term.ownsTarget(e.target)
        && !(e.target instanceof Element && e.target.closest('.tile-doc-view'))) this.term.focus();
    });
    this.syncOutput();

    this.ro = new ResizeObserver(() => this.doFit());
    this.ro.observe(this.body);

    this.refreshSessionName();
    this.subscribeHome();
  }

  /**
   * OPEN: hear the home rows — the snapshot now, then each change the server pushes. The
   * gauge and the work record are this session's row; nothing here fetches or keeps a
   * clock for them. CLOSE is `unsubscribeHome`, called by whoever destroys the tile.
   */
  subscribeHome() {
    this.unsubscribeHome = subscribe('home', () => {
      this.refreshCtx();
      this.refreshTegami();
    });
  }

  /** This session's home row, as the store holds it; null when there is none. */
  homeRow() {
    return (this.session && get('home')?.find((row) => row.name === this.session)) || null;
  }

  async rename() {
    if (!this.session) return;
    const session = this.session;
    const current = S.sessions.find((row) => row.name === session)?.title || readableSession(session);
    const wanted = window.prompt(t('head.rename_prompt', 'Edit Agent title\n\nAgent ID: {id}', { id: session }), current);
    if (wanted == null || wanted.trim() === current) return;
    try {
      await setSessionTitle(session, wanted.trim());
      await fetchSessions();
      this.refreshSessionName();
    } catch (e) {
      toast(t('head.rename_failed', 'Could not rename session: {reason}', { reason: e.message }), false);
    }
  }

  refreshSessionName() {
    this.sessionName.textContent = readableSession(this.session);
    this.sessionName.title = this.session || '';
    this.syncOutput(); // the roster row carries this session's Services answer
    this.syncHeader();
    this.refreshCtx();
    this.refreshTegami();
  }

  /** Point the gauge at the session's context reading (null = no reading, gauge hides). */
  refreshCtx() {
    const row = this.servicesOff() ? null : this.homeRow();
    this.gauge.set(row?.ctx ?? null);
    this.setFooter(row?.ctx ?? null, row?.model ?? null);
  }

  /**
   * Read the session's letter off its row. A mechanical read and nothing else: no check, no
   * proof, no disagreement with what the agent wrote. Null = no ladder up, chip hides.
   * The ⑂ reading beside it is the store's `desks`, pushed on its own (js/desks.js).
   */
  refreshTegami() {
    this.tegami = this.homeRow()?.tegami || null;
    // Measured without this: switch a tile from a session with docs to one with none and
    // 📄 stayed lit, claiming the previous session's docs until the roster redrew.
    // `syncTileHead`, not `syncHeader` — the reading pass without another server fetch.
    syncTileHead(this);
    // An open Work Record is a reading snapshot. Replacing it on each push flashes the
    // panel and resets the owner's scroll position. Keep the value held; closing and
    // reopening the panel draws the latest one.
    if (!this.tegami) this.closeLadder();
  }

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

  clearOverlays() {
    this.closeLadder();
    document
      .querySelectorAll('.tdrop.open')
      .forEach((m) => m.classList.remove('open'));
  }

  /** Open one tracked document over this Agent; closing it reveals the live pane again. */
  openDoc(path) {
    this.clearOverlays();
    void this.docView.open(path);
  }

  /** Term, unlocked output, Chat and Docs are peers in one viewport, never overlays. */
  syncSurface(includeDocs = true) {
    const surface = includeDocs && this.docView?.isOpen()
      ? 'docs'
      : this.transcriptOn ? 'chat'
        : this.tapeMode ? 'tape' : 'term';
    this.surfaceHost.select(surface);
  }

  /** Unroll the ladder under the header — same data as the chip, at full zoom. */
  drawLadder() {
    this.el.querySelector('.shingo-ladder')?.remove();
    const box = buildLadder(this.tegami, desksOf(this.session));
    this.el.querySelector('.tile-head').after(box);
    this.workRecordBtn.classList.add('open');
    this.workRecordBtn.setAttribute('aria-expanded', 'true');
    // Open ON the rung you are standing on. A long ladder scrolls, and opening it at
    // rung 1 hides the one thing you opened it for — the band, and any gate near it.
    const now = box.querySelector('.sl-row.now');
    if (now) now.scrollIntoView({ block: 'center' });
  }

  /**
   * THE HEADER'S STATE, in one pass.
   *
   * Every control on the header that depends on a session is decided HERE, together.
   * They were decided in four places before, which is how three of them ended up never
   * being decided at all: some controls went inert with no session while ⛩ and Close
   * stayed lit, though a letter and a kill are every bit as
   * meaningless without one. The rule is now visible in one list instead of implied by
   * which functions happened to exist.
   *
   * `setInert` is the only way any of them is dimmed — never `disabled`, which would take
   * the hover help with it (see widgets.js), and never a bare class, which would leave
   * the reason unsaid.
   */
  syncHeader() {
    syncTileHead(this);
  }

  transcriptAvailable() {
    return Array.isArray(S.services) && S.services.includes('rireki');
  }

  /**
   * The readings THIS surface walks, taken from the list the route published for this
   * Agent. A desk walks all of them. A thumb does not want five detents: the phone is
   * Terminal or Chat and nothing else, and a tablet is Terminal, Chat and Work — what the
   * Agent said, and the record of what it did. Notes and the full record are a desk's
   * business (owner, 2026-09-23).
   *
   * Named, never sliced by length: a reading added on the server joins the desk's cycle
   * and leaves the thumb surfaces exactly as they were.
   */
  transcriptCycle() {
    const readings = Array.isArray(this.transcriptReadings) ? this.transcriptReadings : [];
    // A thumb gets the terminal or the conversation and nothing else, on a tablet exactly
    // as on a phone — there is no third press (owner, 2026-09-26). The tablet briefly had
    // Work as well; one rule for every touch screen is both what was asked for and one
    // fewer thing to keep in step, so the phone no longer needs a case of its own.
    if (isCoarse()) return readings.slice(0, 1);
    return readings;
  }

  /**
   * One button, one direction, ending back at the terminal. The tile keeps no list of its
   * own; the levels index the cycle above.
   * (Owner, 2026-09-22: the full record shows the docs the Agent read, useless to him;
   * the lower levels are the point.)
   */
  toggleTranscript() {
    if (!this.session || !this.transcriptAvailable()) return;
    const readings = this.transcriptCycle();
    const was = this.transcriptOn;
    const next = was ? this.transcriptLevel + 1 : 0;
    const on = !was || next < readings.length;
    this.transcriptOn = on;
    this.transcriptLevel = on ? next : -1;
    this.el.classList.toggle('transcript-on', on);
    this.syncSurface();
    if (on) {
      if (this.body.contains(document.activeElement)) document.activeElement.blur();
      const view = readings[next]?.name || '';
      // Pressed before the route has named its readings: enter on whatever it defaults to,
      // then move to its first reading as soon as the list arrives — the way in is Chat.
      this.transcriptWantFirst = !was && !view;
      if (was) this.transcriptView.setReading(view);
      else this.transcriptView.show(this.session, view);
    }
    else { this.transcriptWantFirst = false; this.transcriptView.hide(); }
    // Reading is not a reason to lose the way to answer (owner, 2026-09-23). The record
    // is read-only; the entry box beside it still talks to the live Agent, and it is the
    // same box the phone has always used.
    this.setComposer(on || this.tapeMode || isCoarse());
    this.syncHeader();
    if (!on) this.doFit();
  }

  /**
   * The roster answered. Its row already carries what this Agent is doing, so the reading
   * takes its end-of-conversation indicator from there — no second poll, and no opinion of
   * its own (owner, 2026-09-23: the backend sends it, the front renders it).
   */
  renderHome() {
    const row = this.session && Array.isArray(homeData) ? homeData.find((r) => r.name === this.session) : null;
    this.transcriptView.setStance(row?.stance || '');
  }

  /** The route's word on this Agent's transcript arrived; the header reads it from here. */
  onTranscriptState(state) {
    this.transcriptState = state;
    if (Array.isArray(state.readings) && state.readings.length) this.transcriptReadings = state.readings;
    // The intention from connect(), spent once. 'Available' means what it means everywhere
    // else in this tile — the button would be live, not opaque (see transcriptQuiet): an
    // Agent whose record is unavailable or still empty is better met at its terminal than
    // at a reading with nothing in it. Pressing the button before the answer lands turns
    // the transcript on and the intention is dropped rather than fighting the press.
    if (this.transcriptWantChat) {
      this.transcriptWantChat = false;
      if (!this.transcriptOn && state.available && !state.empty && this.transcriptCycle().length) {
        this.toggleTranscript();
        return;
      }
    }
    const cycle = this.transcriptCycle();
    if (this.transcriptOn && this.transcriptWantFirst && cycle.length) {
      this.transcriptWantFirst = false;
      const first = cycle[0].name;
      this.transcriptLevel = 0;
      if (state.view !== first) this.transcriptView.setReading(first);
    } else if (this.transcriptOn && state.view) {
      const at = cycle.findIndex((r) => r.name === state.view);
      if (at >= 0) this.transcriptLevel = at;
    }
    this.syncHeader();
  }

  /** What the button says: where you are now — Terminal, or the reading on screen. */
  transcriptLabel() {
    if (!this.transcriptOn) return t('transcript.terminal', 'Term');
    const reading = this.transcriptCycle()[this.transcriptLevel];
    // The route's own word for the reading — Chat, Notes, Work, All — is the label (owner,
    // 2026-09-22: the names beat T1…T4).
    return reading ? (reading.label || reading.name) : t('transcript.toggle', 'Transcript');
  }

  /**
   * Why the button is opaque, or '' when it is live. Decided by what the route last said
   * for THIS Agent — unavailable for any reason, or nothing to show yet — never by which
   * CLI it runs. Pressing still opens the view, which says the same reason in full.
   */
  transcriptQuiet() {
    if (!this.session || !this.transcriptAvailable() || this.transcriptOn) return '';
    const state = this.transcriptState;
    if (!state) return '';
    if (!state.available) return state.reason || t('transcript.unavailable', 'Transcript unavailable for this Agent.');
    if (state.empty) return t('transcript.empty', 'No transcript output yet.');
    return '';
  }

  /** Mark this tile active (visual highlight + keystroke target) without grabbing keyboard focus. */
  activate() {
    if (S.active === this) return;
    S.active = this;
    tiles.forEach((t) => t.el.classList.toggle('active', t === this));
  }

  /**
   * Activate and pull keyboard focus into the terminal.
   *
   * Still refused while a reading is open, and this is the line the owner's ruling did
   * NOT move: the record is read-only and the terminal is behind it, so there is nothing
   * on screen to focus. What the ruling restored is the composer — a deliberate send to a
   * live Agent, which never needed the terminal to be visible.
   */
  focusTerminal() {
    if (this.transcriptOn || this.docView?.isOpen()) return;
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

  /** Ronin's box uses the same message sender in Locked and Unlocked views. */
  sendMessage(text) {
    return sendComposerMessage(this.session, text);
  }

  /** Housekeeping down the same socket (the ⤓ key's `{t:'bottom'}`). Quiet by design. */
  send(msg) {
    return this.wire.send(msg);
  }

  /**
   * Jump this tile's view to the live end, whatever feeds it — the same three-way rule
   * the header's ⤓ applies to the active tile (layout.js), owned here so the composer
   * and the keys row can ask their OWN tile for it.
   */
  jumpLatest() {
    if (this.transcriptOn) {
      this.transcriptView.el.scrollTop = this.transcriptView.el.scrollHeight;
      return;
    }
    if (!this.locked) {
      if (this.tapeMode) this.tape.scrollToBottom();
      else this.term.scrollToBottom();
      return;
    }
    // Mirror: every scrolled-back end gets its own jump, and only its own. xterm's
    // local viewport answers scrollToBottom; a pane in tmux copy mode (a raw-attach
    // owner, a leftover) answers {t:'bottom'}'s cancel; an app scrolled inside ITSELF
    // answers the wheel burst — but ONLY when it is listening for mouse. Sent blind,
    // owner watched untouched agents sit "scroll locked" on injected wheels — every
    // composer send fired 150 of these).
    this.term.scrollToBottom();
    this.send({ t: 'bottom' });
    if (this.term.mouseTracking()) for (let i = 0; i < 150; i++) this.sendRaw(WHEEL_DOWN);
  }

  /** The composer's box — null until the composer exists. */
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

  /** Change this tile's Output and reopen its viewer against the named server projection. */
  setOutput(value) {
    const previous = this.output;
    // What can actually be produced. The tape projections are gone from the offer, not
    // from the source (owner, 2026-09-23); a stored choice naming one lands on Locked.
    const allowed = new Set(['locked', 'terminal_mirror']);
    this.output = this.servicesOff() || !allowed.has(value) ? 'locked' : value;
    this.locked = this.output === 'locked';
    S.output = this.output;
    S.locked = this.locked;
    this.renderPending();
    this.syncOutput();
    if (this.tape) this.tape.setMode(this.output);
    if (this.session && this.wire.wantOpen && previous !== this.output) this.connect(this.session);
    saveState();
  }

  /**
   * Ronin Services, for THIS session: the answer it was born with, carried on its roster
   * row as RIREKI's dial. Off means the recorder never ran on it — no tape, no unlocked
   * view — so the tile treats it exactly as a box with no record part (owner, 2026-09-04).
   * Unknown (no row yet, a session made by hand) reads as on, like an operator that
   * predates the field.
   */
  servicesOff() {
    if (S.streamOff) return true;
    const row = this.session ? S.sessions.find((r) => r.name === this.session) : null;
    return row?.rireki === false;
  }

  syncOutput() {
    // The widget comes back as {el} like every built control — resolve it the same way
    // syncTileHead does, so this works whichever shape landed on the key.
    const sel = this.outputEl?.el ?? this.outputEl;
    if (!sel || !sel.options) return;
    const off = this.servicesOff();
    if (off && this.output !== 'locked') { this.setOutput('locked'); return; }
    sel.value = this.output;
    // Without Services there is nothing to choose — every unlocked source is RIREKI's,
    // so a one-option dropdown is noise and the control disappears whole (owner,
    sel.hidden = off;
    for (const option of [...sel.options])
      if (S.streamOff && option.value !== 'locked') option.remove();
    const transcriptPark = serviceParked('rireki');
    sel.title = S.streamOff
      ? transcriptPark
        ? t('output.title_campaign_off', 'Output — Locked only. Ronin Services is off for this Campaign.')
        : t('output.title_locked', 'Output — Locked only. Ronin Services is not installed.')
      : off ? t('output.title_off', 'Output — Locked only. Ronin Services is off for this Agent.')
      : t('output.title_choose', 'Output — choose the live terminal or a RIREKI view');
  }

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
        sendMessage: (text) => this.sendMessage(text),
        scrollToBottom: () => this.jumpLatest(),
      });
      // Coarse pointer: the software keyboard has no Esc, Ctrl, Tab or arrows, so the
      // keys row rides the composer — always visible with it, lifting with it, and
      // acting on THIS tile's session rather than "the active tile" (keysrow.js).
      if (isCoarse()) {
        this.composer.el.prepend(buildKeysRow({
          // Clear and Stop belong to every touch composer, including the wide iPad
          // workbench. Copy remains Term-only through the shared transcript CSS rule.
          controls: buildMobileControlButtons(this),
          sendRaw: (d) => this.sendRaw(d),
          latest: () => this.jumpLatest(),
        }).el);
        this.el.classList.add('keys-on');
      }
    }
    this.composer.show(on);
  }

  controlAction(action, target) { return runTerminalAction(this, action, target); }

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
    this.el.dataset.link = state;
  }

  detach() {
    this.transcriptView.hide();
    this.transcriptOn = false;
    this.transcriptLevel = -1;
    this.transcriptWantChat = false;
    this.el.classList.remove('transcript-on');
    this.syncSurface();
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
    this.syncEmpty();
    saveState();
  }

  /** Stop viewing without touching the Agent. A managed workbench empties its whole
   *  seat; an ordinary tile simply detaches its transport. */
  minimize() {
    if (!this.session) return;
    if (this.onMinimize) this.onMinimize(this);
    else this.detach();
  }

  syncEmpty() {
    if (this.emptyMark) this.emptyMark.hidden = !!this.session;
  }

  /** Destroy the tmux session on the host (root + its grid_* viewers), then detach. */
  async kill() {
    const name = this.session;
    if (!name) return;
    // ^C raises this too, and a held ^C repeats: the sheet takes focus as it opens, but
    // a repeat already queued can still reach xterm first. Dismissal removes the node
    // (session-retire.js), so finding one means this tile's sheet is up — never a stack.
    if (document.getElementById(`endsession-${this.retirementId}`)) return;
    retireSession(name, this.retirementId, async () => {
      this.detach();
      await fetchSessions();
    });
  }

  connect(session) {
    const changed = this.session !== session;
    // A document belongs to the session that opened it. Switching the seat first asks
    // that editor to leave; unsaved typing can refuse, keeping both session and surface.
    if (changed && this.docView?.isOpen() && !this.docView.close()) return false;
    if (changed) {
      this.transcriptView.hide();
      this.transcriptOn = false;
      this.transcriptLevel = -1;
      this.transcriptReadings = [];
      this.transcriptState = null;
      this.el.classList.remove('transcript-on');
      this.syncSurface();
    }
    if (changed) { this.lastSelection = ''; this.pending = ''; this.renderPending(); }
    this.session = session;
    // Ask the route once, so the button is opaque or live before anyone presses it.
    if (changed && this.transcriptAvailable()) void this.transcriptView.probe(session);
    // A FINGER OPENS ON THE READING, NOT THE TERMINAL (owner, 2026-09-24). Someone coming
    // to an Agent on a phone or a tablet wants to see what it said; the terminal is a
    // desk's way in. Held as an intention rather than acted on here, because only the
    // route can say whether THIS Agent has a record — the probe above is already on its
    // way, and onTranscriptState spends the intention when the answer lands.
    if (changed) this.transcriptWantChat = isCoarse() && this.transcriptAvailable();
    this.sessionKey = S.sessions.find((row) => row.name === session)?.key;
    this.syncEmpty();
    // The Services answer is per session. A tile that held an unlocked view for one Agent
    // and now shows one born with Services off comes down to Locked before the wire opens
    // — set directly, not through setOutput, which would reopen the wire mid-connect.
    if (this.servicesOff() && this.output !== 'locked') {
      this.output = 'locked'; this.locked = true; S.output = 'locked'; S.locked = true;
      if (this.tape) this.tape.setMode('locked');
    }
    this.syncOutput();
    this.sessionName.textContent = readableSession(session);
    this.sessionName.title = session;
    this.syncHeader();
    this.refreshCtx();
    this.refreshTegami();

    this.term.reset();
    this.tapeMode = !this.locked;
    this.tape.setMode(this.output);
    this.tape.reset(this.tapeMode);
    // Coarse pointer: the composer (and its keys row) is the ONLY input path — a tap
    // never focuses xterm on touch, so a locked mirror without it cannot be typed into
    // at all. Both views reserve the composer's measured height and keyboard lift
    // so the CLI's own input line and the transcript's last message stay visible. Desktop keeps the old rule: tape mode only.
    this.setComposer(this.tapeMode || isCoarse() || this.transcriptOn);
    this.el.classList.toggle('tape-on', this.tapeMode);
    this.syncSurface();
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

    saveState();
    return true;
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
