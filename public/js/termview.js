/* part of the ronin-cowork client — see js/README.md */
import { IS_TOUCH, SELECT_MOD, WHEEL_DOWN, WHEEL_UP, forcesSelection } from './state.js';
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

  mouseTracking() {
    return (this.term.modes?.mouseTrackingMode ?? 'none') !== 'none';
  }

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
   * Locked has no local buffer — the history lives on the server, so a gesture has to
   * be translated into wheel escapes and sent. That is what this does.
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
        if (hooks.isLocked() && this.mouseTracking()) {
          // the mirror, app listening: inject wheel events — the APP scrolls its view
          while (accum >= STEP) {
            hooks.sendRaw(WHEEL_UP);
            accum -= STEP;
          }
          while (accum <= -STEP) {
            hooks.sendRaw(WHEEL_DOWN);
            accum += STEP;
          }
        } else if (hooks.isLocked()) {
          // the mirror, nobody listening: scroll xterm's local buffer — a wheel escape
          // here would land as typed input in the pane (see mouseTracking above)
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
