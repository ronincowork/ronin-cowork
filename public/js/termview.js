/* part of the tmux-ronin client — see js/README.md */
/**
 * TERMVIEW — the 🔒 locked view: the untouched `tmux attach` mirror.
 *
 * tmux paints a fixed screen and the scrollback stays server-side (copy-mode is a
 * Faucet A painting, so scrolling round-trips). This is Locked, it works, and RIREKI
 * does not touch it — the scroll saga's settled boundary, and the reason this module
 * is deliberately thin: it wraps xterm and nothing else.
 *
 * The other view is `tapeview.js`, which reads the tape and never touches tmux at all.
 * The tile composes one or the other; neither knows the other exists.
 *
 * xterm itself stays a classic script (`window.Terminal`, `window.FitAddon`) — the
 * vendor files load before the module graph runs, so it is referenced, never imported.
 */
import { IS_TOUCH, THEME, WHEEL_DOWN, WHEEL_UP } from './state.js';

export class TermView {
  /**
   * @param {HTMLElement} body
   * @param {{onData: (d: string) => void, onResize: (size: {cols: number, rows: number}) => void,
   *          onSelection: (text: string) => void}} hooks
   */
  constructor(body, hooks) {
    this.body = body;
    this.term = new Terminal({
      fontSize: 13,
      fontFamily: 'Menlo, "DejaVu Sans Mono", Consolas, monospace',
      theme: THEME,
      cursorBlink: true,
      scrollback: 30000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      // Option+drag forces a native selection even when the running app (e.g. Claude
      // Code) holds mouse-reporting on and would otherwise eat the drag. Lets you copy
      // in-place out of a live TUI without a panel.
      macOptionClickForcesSelection: true,
    });
    this.fitAddon = new FitAddon.FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.open(body);
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

  focus() {
    this.term.focus();
  }

  scrollLines(n) {
    this.term.scrollLines(n);
  }

  scrollToBottom() {
    this.term.scrollToBottom();
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
   * TOUCH ONLY: one-finger drag over the terminal scrolls the tmux scrollback.
   *
   * Locked has no local buffer — the history lives on the server, so a gesture has to
   * be translated into wheel escapes and sent. That is what this does.
   *
   * Tape-fed tiles must NOT come through here. Their content is already in a plain
   * scrollable div, so iOS scrolls it natively with real momentum and rubber banding.
   * Hijacking the gesture to hand-roll `scrollLines` in 16px steps replaces that with a
   * discrete jump and a full re-render per step, which is exactly the "scrolls like
   * shit" — it was never latency, it was us doing the scrolling badly.
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
          // the mirror: inject wheel events, server scrolls, browser shows it
          while (accum >= STEP) {
            hooks.sendRaw(WHEEL_UP);
            accum -= STEP;
          }
          while (accum <= -STEP) {
            hooks.sendRaw(WHEEL_DOWN);
            accum += STEP;
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
