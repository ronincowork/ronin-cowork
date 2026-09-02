/* part of the ronin-cowork client — see js/README.md */
/**
 * TERMVIEW — the 🔒 locked view: the untouched `tmux attach` mirror.
 *
 * tmux paints a fixed screen; scroll-back is LOCAL since viewer mouse went off
 * (2026-09-01) — xterm keeps a 30,000-line buffer of what streamed through, the wheel
 * scrolls it, and the ↓ latest pill (wireJumpPill) is the way home. tmux copy-mode is
 * no longer entered from a tile, and since 2026-09-02 THE WHEEL NEVER REACHES THE APP
 * either (owner: "I thought the scroll wheel was turned off"): xterm forwards a wheel
 * to any app holding mouse tracking, Claude Code holds it, and the owner kept landing
 * in the CLI's own scrollback view, stuck. The custom wheel handler below keeps every
 * wheel — physical, touch drag, keypad detent — on the local buffer. This is Locked,
 * it works, and RIREKI does not touch it — the scroll saga's settled boundary, and the
 * reason this module is deliberately thin: it wraps xterm and nothing else.
 *
 * The other view is `tapeview.js`, which reads the tape and never touches tmux at all.
 * The tile composes one or the other; neither knows the other exists.
 *
 * xterm itself stays a classic script (`window.Terminal`, `window.FitAddon`) — the
 * vendor files load before the module graph runs, so it is referenced, never imported.
 */
import { IS_TOUCH, SELECT_MOD, forcesSelection } from './state.js';
import { termFace, termTheme } from './theme.js';
import { t } from './lexicon.js';

export class TermView {
  /**
   * @param {HTMLElement} body
   * @param {{onData: (d: string) => void, onResize: (size: {cols: number, rows: number}) => void,
   *          onSelection: (text: string) => void}} hooks
   */
  constructor(body, hooks) {
    this.body = body;
    this.term = new Terminal({
      // Face AND palette both resolved from the stylesheet (js/theme.js) — spelled once,
      // in CSS, and xterm reads that spelling. The font used to be the one exception here
      // and is not any more: --font-term and --text-4.
      ...termFace(),
      theme: termTheme(),
      cursorBlink: true,
      scrollback: 30000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      // Option+drag forces a native selection even when the running app (e.g. Claude
      // Code) holds mouse-reporting on and would otherwise eat the drag. Lets you copy
      // in-place out of a live TUI without a panel.
      //
      // MAC ONLY, and that is xterm's option, not a choice of ours: its rule is
      // `isMac ? altKey && macOptionClickForcesSelection : shiftKey`, so off-Mac the key
      // is Shift and no flag gates it. `wireCopyHint` below names whichever applies.
      macOptionClickForcesSelection: true,
    });
    this.fitAddon = new FitAddon.FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.open(body);
    // THE WHEEL IS OURS. xterm's default hands a wheel to an app that holds mouse
    // tracking (Claude Code does) as SGR mouse reports, and the app scrolls ITSELF —
    // its own scrollback view, which the tile cannot see or leave. Returning false here
    // keeps xterm from forwarding and scrolls the local buffer instead, so the ↓ latest
    // pill is always the way home. An app without mouse tracking never got the wheel
    // anyway (xterm scrolls, or translates to arrows on the alternate screen).
    this.term.attachCustomWheelEventHandler((e) => {
      if (!this.mouseTracking()) return true;
      const lines = e.deltaMode === 1 ? e.deltaY : e.deltaY / 20;
      this.term.scrollLines(Math.trunc(lines) || Math.sign(lines));
      return false;
    });
    this.term.onData(hooks.onData);
    this.term.onResize(hooks.onResize);
    // Stash the selection as soon as it's made; a streaming TUI repaint can clear the
    // visible highlight before ⌘C fires, so we copy this captured text, not a stale read.
    this.term.onSelectionChange(() => {
      const s = this.term.getSelection ? this.term.getSelection() : '';
      if (s) hooks.onSelection(s);
    });
  }

  get cols() {
    return this.term.cols;
  }

  get rows() {
    return this.term.rows;
  }

  write(data) {
    this.term.write(data);
  }

  writeln(text) {
    this.term.writeln(text);
  }

  reset() {
    this.term.reset();
  }

  /** A theme flip re-reads the tokens; xterm applies a theme object live. */
  setTheme(theme) {
    this.term.options.theme = theme;
  }

  focus() {
    this.term.focus();
  }

  scrollLines(n) {
    this.term.scrollLines(n);
  }

  scrollToBottom() {
    this.term.scrollToBottom();
  }

  /**
   * IS THE APP LISTENING FOR MOUSE? Only the wheel handler above asks, to know when
   * xterm would otherwise forward a wheel to the app. Nothing in the client sends a
   * wheel escape at the pane any more: under viewer mouse off (2026-09-01) one reached
   * the app as input — agents nobody had touched sat "scroll locked" on injected
   * wheels — and with the app listening it scrolled the app's own view instead of the
   * tile's, which is the trap the owner kept falling into (2026-09-02).
   */
  mouseTracking() {
    return (this.term.modes?.mouseTrackingMode ?? 'none') !== 'none';
  }

  /**
   * The way back from a local scroll-back (owner, 2026-09-01: a tile "still stuck in
   * scroll mode"). With viewer mouse off, the wheel scrolls xterm's OWN buffer — the
   * server never knows, so no server-side jump can end it, and a desktop owner types
   * into the composer, so xterm's scroll-on-input never fires either. The tape view's
   * ↓ latest pill, on the mirror: shown whenever the viewport has left the live end.
   */
  wireJumpPill(hooks) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'termjump';
    pill.title = t('tape.jump_title', 'Jump to the latest output — the deterministic way back to the bottom, whatever the scroll is doing.');
    pill.textContent = t('tape.jump', '↓ latest');
    pill.addEventListener('click', () => hooks.jump());
    this.body.appendChild(pill);
    const mark = () => {
      const b = this.term.buffer?.active;
      pill.classList.toggle('show', !!b && b.viewportY < b.baseY);
    };
    this.term.onScroll(mark);
    this.term.onWriteParsed?.(mark); // output arriving while scrolled up keeps the pill honest
  }

  /** The live selection, if xterm has one — `layout.js` feeds it to the clipboard on ⌘C. */
  getSelection() {
    return this.term.getSelection ? this.term.getSelection() : '';
  }

  fit(hidden) {
    if (hidden) return;
    try {
      this.fitAddon.fit();
    } catch (_) {}
  }

  /**
   * DESKTOP ONLY: catch the drag that was meant to be a copy, and say the key.
   *
   * The failure this exists for is silent and looks like success. When the app in a
   * locked tile holds mouse tracking (Claude Code's TUI does), a plain drag is forwarded
   * as mouse escapes the APP consumes: the browser never saw a selection and the
   * laptop's clipboard is untouched, but the user watched text respond under their
   * cursor, so they press ⌘C, get whatever was there before, and conclude that copying
   * is broken. Nothing on screen ever mentions the modifier. (tmux's own copy-mode grab
   * of the drag is gone with viewer mouse off, 2026-09-01; the app-side grab remains.)
   *
   * THE TEST IS "THEY TRIED AND GOT NOTHING", not "is mouse reporting on". A real drag
   * that leaves `getSelection()` empty is the honest condition: it fires for tmux mouse
   * mode, for an app holding the mouse itself, and for whatever the next cause turns out
   * to be. Asking xterm about its modes would be narrower AND more brittle.
   *
   * Held to ONCE PER TILE, re-arming after ten minutes (the owner's call, 2026-08-15). A
   * hint on every drag is a nag, and the second one teaches nothing the first did not.
   *
   * Locked only — the unlocked transcript is a plain div where selection already works —
   * and desktop only, because touch has no drag-to-select to rescue.
   *
   * @param {{isLocked: () => boolean, overHome: (el: EventTarget) => boolean}} hooks
   */
  wireCopyHint(hooks) {
    if (IS_TOUCH) return;
    const REARM_MS = 10 * 60 * 1000;
    const MOVED_PX = 8; // below this it is a click, not an attempt to select

    const hint = document.createElement('div');
    hint.className = 'copyhint';
    hint.textContent = t('term.copy_hint', 'Trying to copy? Hold {mod} while you drag, then ⌘C.', { mod: SELECT_MOD });
    this.body.appendChild(hint);

    let from = null;
    let shownAt = -Infinity;
    let timer = null;

    this.body.addEventListener('mousedown', (e) => {
      from = null;
      // Left button only, on the terminal, in a locked tile, WITHOUT the modifier —
      // someone already holding it knows the trick and must never be told.
      if (e.button !== 0 || !hooks.isLocked() || hooks.overHome(e.target)) return;
      if (forcesSelection(e)) return;
      from = { x: e.clientX, y: e.clientY };
    });

    // On WINDOW, not on the body: a drag routinely ends outside the tile it started in,
    // and a mouseup we never hear is an attempt we never counted.
    window.addEventListener('mouseup', (e) => {
      const start = from;
      from = null;
      if (!start) return;
      if (Math.abs(e.clientX - start.x) < MOVED_PX && Math.abs(e.clientY - start.y) < MOVED_PX) return;
      if (this.getSelection()) return; // they got a selection — nothing went wrong
      if (Date.now() - shownAt < REARM_MS) return;
      shownAt = Date.now();
      // TWO marks, because one in a corner is missable on a screen where something is
      // always moving: the pill says the words, and the tile's own edge flashes kaki
      // behind it so peripheral vision catches it even while you are reading elsewhere.
      hint.classList.add('show');
      this.body.classList.add('hinting');
      clearTimeout(timer);
      timer = setTimeout(() => {
        hint.classList.remove('show');
        this.body.classList.remove('hinting');
      }, 5000);
    });
  }

  /**
   * TOUCH ONLY: one-finger drag over the terminal scrolls the tmux scrollback.
   *
   * Locked scrolls xterm's local buffer — the finger is translated into local
   * `scrollLines`, never into wheel escapes sent at the pane (see the wheel handler).
   *
   * Tape-fed tiles must NOT come through here. Their content is already in a plain
   * scrollable div, so iOS scrolls it natively with real momentum and rubber banding.
   * Hijacking the gesture to hand-roll `scrollLines` in 16px steps replaces that with a
   * discrete jump and a full re-render per step, which is exactly the reported "scrolling
   * feels broken" — it was never latency, it was us doing the scrolling badly.
   *
   * @param {{isLocked: () => boolean, overHome: (el: EventTarget) => boolean,
   *          sendRaw: (d: string) => void, activate: () => void}} hooks
   */
  wireDragScroll(hooks) {
    if (!IS_TOUCH) return;
    let lastY = null;
    let accum = 0;
    const STEP = 16; // px of drag per wheel step
    this.body.addEventListener(
      'touchstart',
      (e) => {
        hooks.activate();
        if (!hooks.isLocked() || hooks.overHome(e.target)) {
          lastY = null; // tape-fed tile and the home panel both scroll natively
          return;
        }
        lastY = e.touches[0] ? e.touches[0].clientY : null;
        accum = 0;
        e.stopPropagation();
      },
      { passive: true, capture: true },
    );
    this.body.addEventListener(
      'touchmove',
      (e) => {
        if (lastY == null || !e.touches[0]) return;
        const y = e.touches[0].clientY;
        accum += y - lastY; // finger DOWN reveals older lines => wheel up
        lastY = y;
        if (hooks.isLocked()) {
          // the mirror: scroll xterm's local buffer, whatever the app is listening for
          const n = Math.trunc(accum / STEP);
          if (n) {
            accum -= n * STEP;
            this.scrollLines(-n);
          }
        } else {
          // Unreachable while touchstart parks lastY on unlocked tiles, and kept
          // deliberately: it is the fallback if that guard is ever loosened.
          const n = Math.trunc(accum / STEP);
          if (n) {
            accum -= n * STEP;
            this.scrollLines(-n);
          }
        }
        e.preventDefault(); // own the gesture: no page bounce, no xterm handling
        e.stopPropagation();
      },
      { passive: false, capture: true },
    );
    this.body.addEventListener(
      'touchend',
      () => {
        lastY = null;
      },
      { passive: true, capture: true },
    );
  }
}
