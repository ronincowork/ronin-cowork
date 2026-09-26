/* part of the ronin-cowork client — see js/README.md */
import { IS_TOUCH, S } from './state.js';
import { t } from './lexicon.js';
import { settleComposer } from './composer-rules.js';

/**
 * @param {HTMLElement} body
 * @param {{activate: () => void, clearOverlays: () => void, connected: () => boolean,
 *          send: (text: string) => boolean,
 *          sendMessage: (text: string) => Promise<{ok: boolean, why?: string}>,
 *          scrollToBottom: () => void}} hooks
 *   `send` is a command key, fire-and-forget. `sendMessage` is a message: it resolves to the
 *   host's answer, and the box clears on nothing else.
 * @returns {{el: HTMLElement, ta: HTMLTextAreaElement, show: (on: boolean) => void, dispose: () => void}}
 */
export function buildComposer(body, hooks) {
  const wrap = document.createElement('div');
  wrap.className = 'composer';
  const ta = document.createElement('textarea');
  ta.rows = 1;
  ta.placeholder = t('composer.placeholder', 'Message…');
  ta.title = t('composer.title', 'Enter sends · Shift+Enter or Option+Enter for a new line');
  ta.spellcheck = false;
  // NO 🎤 ON THE BOX. Dictation is withdrawn from the composer until Voice is rebuilt as
  // a whole — speech to text AND text to speech, with its own controls (owner,
  // 2026-09-24). It was offered on any touch surface the browser could record on, which
  // said nothing about whether this machine can transcribe: Koe is parked here
  // (`component_off`), and /api/health advertised `transcribe: true` off a default URL
  // string that is never empty, so the button was always drawn and always failed.
  // js/voice.js stays exactly where it is — the engine is not the thing that was wrong.
  const btn = document.createElement('button');
  btn.className = 'csend';
  btn.textContent = '↵';
  btn.title = t('composer.send', 'Send');
  // The one honest line: why the text is still here. Shown only while a send is held.
  const why = document.createElement('p');
  why.className = 'cwhy';
  why.setAttribute('role', 'status');
  wrap.append(why, ta, btn);
  body.appendChild(wrap);

  const state = { inflight: false };
  // The wire's own words for a send that did not get through, in the owner's language.
  const reasons = {
    'not connected': () => t('composer.why_not_connected', 'the tile is not connected'),
    refused: () => t('composer.why_refused', 'the session refused it'),
  };
  const hold = (reason) => {
    wrap.classList.toggle('held', !!reason);
    why.textContent = reason ? t('composer.held', 'Not sent — {why}. Your text is kept.', { why: (reasons[reason] || (() => reason))() }) : '';
  };
  const grow = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  };
  const clearBox = () => {
    ta.value = '';
    grow();
    hold(null);
    ta.focus();
  };
  const submit = () => {
    // One message in flight at a time: a second Enter while the host is still answering
    // would send the same text twice.
    if (state.inflight) return;
    const text = ta.value;
    if (!text.trim()) {
      // An empty box sends a command key directly to the terminal.
      if (!hooks.connected()) { hold('not connected'); return; }
      hooks.send('\r');
      return;
    }
    // The server owns text + Enter. The terminal socket is only for direct keys.
    state.inflight = true;
    wrap.classList.add('sending');
    hold(null);
    hooks.sendMessage(text).then((outcome) => {
      state.inflight = false;
      wrap.classList.remove('sending');
      const verdict = settleComposer(outcome, text, ta.value);
      if (verdict.clear) {
        ta.value = '';
        grow();
        hooks.scrollToBottom();
        return;
      }
      if (verdict.why) hold(verdict.why);
    });
  };
  /*
   * THE BOX DOES NOT CLIMB ANY MORE. It used to measure the keyboard and lift itself by
   * that many pixels, because the application was sized to the layout viewport and its
   * own bottom was therefore behind the keys. The application is now sized to what is
   * visible (js/appheight.js), so the bottom of the app is the bottom of the screen and
   * this box simply sits there. One measurement, in one place, instead of every pinned
   * thing compensating for the same lie.
   */
  // Reserve what the overlay covers, including a growing draft, so the view underneath
  // can end above it rather than behind it.
  const reserve = () => {
    body.style.setProperty('--composer-clearance', `${Math.round(wrap.getBoundingClientRect().height)}px`);
  };
  const size = new ResizeObserver(reserve);
  size.observe(wrap);
  if (IS_TOUCH) {
    ta.setAttribute('enterkeyhint', 'send');
    ta.setAttribute('autocorrect', 'on');
    // THE KEYS ROW STANDS DOWN IN TEXT ENTRY (owner, 2026-09-24). Two rows of controls
    // above an on-screen keyboard is the screen twice over, and the device's own keyboard
    // is the thing being typed on.
    //
    // The signal is the box having focus, not a measured keyboard height. Measuring looks
    // more precise and is not: it needs a pixel threshold to survive the stray offset iOS
    // reports while scrolling, and that guess was wrong on the owner's phone — the row
    // never went away. Focus is what "entering text entry" actually means, it needs no
    // number, and it is already the moment the keyboard opens on a touch device.
    ta.addEventListener('focus', () => wrap.classList.add('kb-open'));
    ta.addEventListener('blur', () => wrap.classList.remove('kb-open')); // back the moment the box is left
  }
  ta.addEventListener('input', () => {
    grow();
    if (wrap.classList.contains('held')) hold(null); // the person is editing: the old reason is stale
  });
  // Drops (an @mention, a doc reference) are the TILE's — js/tiledroptext.js listens on
  // the body, which this textarea sits in, and lands text here when the tile is unlocked.
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
  ta.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
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
    clear: clearBox,
    dispose() {
      size.disconnect();
    },
    show(on) {
      wrap.classList.toggle('show', !!on);
      reserve();
    },
  };
}
