/* part of the ronin-cowork client — see js/README.md */
/**
 * THE COMPOSER'S SEND RULE, as a pure function — no DOM, no socket.
 *
 * The box clears only on the host's word that the parcel reached the terminal, and only if
 * it still holds what was sent (an edit made while the answer was in flight is kept). Any
 * other answer keeps the text and names the reason. Nothing here retries.
 */

/**
 * @param {{ok: boolean, why?: string|null}} outcome  the host's answer to one parcel
 * @param {string} sent    the text the parcel carried (without its Enter)
 * @param {string} boxNow  what the box holds when the answer arrives
 * @returns {{clear: boolean, why: string|null}}
 */
export function settleComposer(outcome, sent, boxNow) {
  if (outcome && outcome.ok) return { clear: boxNow === sent, why: null };
  return { clear: false, why: (outcome && outcome.why) || 'refused' };
}
