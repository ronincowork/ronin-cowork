/* part of the ronin-cowork client — see js/README.md */
/**
 * THE UNLOCKED INPUT RULE, as a pure function — no DOM, no socket.
 *
 * Printable text parks locally (shown in the strip) until Enter sends the whole
 * parcel; command keys — anything starting with a control char (^C, Esc/arrow/mouse
 * sequences, Tab) — go straight through immediately.
 *
 * Pure so it can be tested under node: this is the router every keystroke on the
 * unlocked surface passes through, and its Enter rule is a measured fix (see below),
 * not a preference.
 */

/**
 * One keystroke against the parked text.
 *
 * @param {string} pending  text parked so far
 * @param {string} d        the chunk xterm handed us (a key, a paste, an escape sequence)
 * @returns {{pending: string, send: string|null}} the new parked text, and what to
 *          put on the wire right now (null = nothing leaves the browser)
 */
export function dvrStep(pending, d) {
  if (d === '\r' || d === '\n') {
    // One atomic send, Enter glued on — measured to submit correctly through
    // send-keys on a real Claude pane. Same fix as the composer: a delayed \r on
    // a timer is a message iOS can lose halfway.
    // A bare Enter (nothing parked) is a command key and goes as itself.
    return { pending: '', send: pending ? pending + '\r' : '\r' };
  }
  if (d === '\x7f' || d === '\b') {
    // Backspace eats parked text first; with nothing parked it is a command key.
    if (pending) return { pending: pending.slice(0, -1), send: null };
    return { pending, send: d };
  }
  if (d.charCodeAt(0) < 0x20) return { pending, send: d }; // control char / escape sequence
  return { pending: pending + d, send: null }; // printable (typed or pasted) — park it
}
