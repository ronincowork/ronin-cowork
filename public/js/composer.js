/* part of the ronin-cowork client — see js/README.md */
/**
 * THE COMPOSER — the unlocked tile's text entry, because it had none.
 *
 * Unlocked input has always gone through xterm's `onData` (typing parks in `pending`,
 * Enter sends the parcel). But a tape-fed tile hides xterm entirely — the transcript is
 * a div, not an emulator — so on the unlocked surface there was nothing on the page to
 * type INTO. Not a missing nicety: the missing input path.
 *
 * A real textarea, docked at the bottom, growing as you type. Enter sends; Shift+Enter
 * is a newline. The send reuses the parked-parcel rule exactly: one atomic send with the
 * carriage return glued on. Every send goes through Ronin, so every message is marked on
 * the tape and "since my last message" stays exact on this surface.
 *
 * Additive only: locked tiles never show it, and desktop unlocked previously had no
 * input at all, so nothing that worked before changes.
 */
import { IS_TOUCH, S } from './state.js';
import { CAN_RECORD, wireDictation } from './voice.js';
import { MENTION_MIME } from './tilementions.js';

/**
 * @param {HTMLElement} body
 * @param {{activate: () => void, clearOverlays: () => void, connected: () => boolean,
 *          send: (text: string) => boolean, scrollToBottom: () => void}} hooks
 * @returns {{el: HTMLElement, ta: HTMLTextAreaElement, show: (on: boolean) => void}}
 */
export function buildComposer(body, hooks) {
  const wrap = document.createElement('div');
  wrap.className = 'composer';
  const ta = document.createElement('textarea');
  ta.rows = 1;
  ta.placeholder = 'Message…';
  ta.title = 'Enter sends · Shift+Enter or Option+Enter for a new line';
  ta.spellcheck = false;
  // 🎤 sits ON the box, not floating over the terminal, and records to the host
  // rather than to Apple — same engine the Mac's ⌥ mic uses, so it knows the words
  // in ronin_catalogs/HOTWORDS.md. Built only where the browser can actually record; a
  // dead button is worse than none. (Recording needs a secure context, so over the
  // tailnet that means the https URL, not the bare IP.)
  const mic = CAN_RECORD && IS_TOUCH ? document.createElement('button') : null;
  if (mic) {
    mic.className = 'cmic';
    mic.type = 'button';
    mic.textContent = '🎤';
    mic.title = 'Dictate into this box — tap again to stop, then ↵ to send';
  }
  const btn = document.createElement('button');
  btn.className = 'csend';
  btn.textContent = '↵';
  btn.title = 'Send';
  wrap.append(...[ta, mic, btn].filter(Boolean));
  body.appendChild(wrap);

  const state = { dictation: null, queued: false };
  if (mic) state.dictation = wireDictation(ta, mic);
  if (state.dictation)
    state.dictation.afterText = () => {
      if (!state.queued) return;
      state.queued = false;
      wrap.classList.remove('queued');
      submit();
    };

  const grow = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  };
  const submit = () => {
    // Stop listening BEFORE reading the box: iOS keeps the recognizer running a
    // beat after you stop talking, and a trailing result would refill a box we
    // are about to clear.
    if (S.dictation) S.dictation.stop();
    // Enter while the clip is still TRANSCRIBING: the box is empty but a message
    // is on its way. Queue the send; `afterText` above fires it when it lands.
    if (state.dictation && state.dictation.busy && !ta.value.trim()) {
      state.queued = true;
      wrap.classList.add('queued');
      return;
    }
    // A send into a closed socket vanishes. Losing the message AND clearing the box
    // made a dictated message silently disappear. Keep the text, say so, and let the
    // auto-reconnect bring the socket back.
    if (!hooks.connected()) {
      wrap.classList.add('noconn');
      setTimeout(() => wrap.classList.remove('noconn'), 1200);
      return;
    }
    const text = ta.value;
    if (!text.trim()) {
      // Bare Enter with an empty box is a COMMAND key, exactly as the dvr rule has it.
      // It is also the recovery path: if a previous send's Enter was swallowed by
      // the TUI's paste handling, the text is sitting in the pane's own box and
      // THIS is the keypress that submits it. An empty-box Enter must never be a
      // no-op.
      hooks.send('\r');
      return;
    }
    // ONE atomic send, Enter glued on. The old shape — text now, \r on a 40ms
    // timer — left a gap iOS could fall into: the text landed in the pane's box
    // and the timer's \r never followed, so a dictated message sat there sent but
    // never submitted. Measured on a real Claude pane: text+\r in a single
    // send-keys burst submits correctly, single-line and multi-line both, so the
    // split buys nothing on this path and the timer was pure fragility.
    if (!hooks.send(text + '\r')) {
      // Raced the socket between the check above and here — keep the text.
      wrap.classList.add('noconn');
      setTimeout(() => wrap.classList.remove('noconn'), 1200);
      return;
    }
    ta.value = '';
    grow();
    hooks.scrollToBottom();
  };
  /**
   * Lift above the on-screen keyboard.
   *
   * iOS does not resize the window when the keyboard appears — it shrinks the
   * VISUAL viewport and leaves the layout viewport alone, so a box pinned to the
   * bottom ends up underneath the keyboard, which is where the ⌨ overlay this
   * replaces learned the same lesson. `visualViewport` is the only thing that knows
   * how much is covered.
   */
  const lift = () => {
    const vv = window.visualViewport;
    const kb = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    wrap.style.bottom = kb + 'px';
  };
  if (IS_TOUCH) {
    ta.setAttribute('enterkeyhint', 'send');
    ta.setAttribute('autocorrect', 'on');
    ta.addEventListener('focus', lift);
    ta.addEventListener('blur', () => {
      wrap.style.bottom = '0px';
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', lift);
      window.visualViewport.addEventListener('scroll', lift);
    }
  }
  ta.addEventListener('input', grow);
  ta.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes(MENTION_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    wrap.classList.add('mention-ready');
  });
  ta.addEventListener('dragleave', () => wrap.classList.remove('mention-ready'));
  ta.addEventListener('drop', (e) => {
    const name = e.dataTransfer.getData(MENTION_MIME);
    if (!name) return;
    e.preventDefault();
    wrap.classList.remove('mention-ready');
    const start = ta.selectionStart;
    const lead = start > 0 && !/\s/.test(ta.value[start - 1]) ? ' ' : '';
    ta.setRangeText(`${lead}@${name} `, start, ta.selectionEnd, 'end');
    grow();
    ta.focus();
  });
  ta.addEventListener('focus', () => {
    hooks.activate();
    // TOUCH: typing is the way back to the pane. The ladder and the letter cover
    // the transcript and are scrollable, so on a phone — where the keyboard then
    // takes the bottom half too — reaching for the text box with one of them open
    // left almost nothing of the session visible, and dismissing it meant finding
    // the right ✕ under the keyboard. Tapping into the box IS the dismissal.
    //
    // Desktop keeps them: there is room for a ladder and an input at once, and
    // reading the ladder while writing a reply to its gate is the normal case.
    if (IS_TOUCH) hooks.clearOverlays();
  });
  /**
   * Enter sends. Shift+Enter and OPTION+Enter both insert a line.
   *
   * Option+Enter is the muscle memory on a Mac — it is what the agent's own box in
   * the pane takes — and it used to send, which loses the thought you were halfway
   * through writing. A textarea has no default action for Alt+Enter, so the newline
   * is inserted by hand at the caret; `setRangeText` is used rather than rebuilding
   * `value` so the browser's own undo stack survives.
   */
  ta.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.shiftKey) return; // the browser inserts this one itself
    if (e.altKey || e.metaKey || e.ctrlKey) {
      e.preventDefault();
      ta.setRangeText('\n', ta.selectionStart, ta.selectionEnd, 'end');
      grow();
      return;
    }
    e.preventDefault();
    submit();
  });
  btn.addEventListener('click', submit);

  return {
    el: wrap,
    ta,
    show(on) {
      wrap.classList.toggle('show', !!on);
    },
  };
}
