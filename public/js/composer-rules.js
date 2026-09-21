/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
/**
 * The composer's send and settlement rules.
 *
 * The box clears when the server accepts the message, and only if
 * it still holds what was sent (an edit made while the answer was in flight is kept). Any
 * other answer keeps the text and names the reason. Nothing here retries.
 */

/**
 * @param {{ok: boolean, why?: string|null}} outcome  the host's answer to one message
 * @param {string} sent    the text the message carried
 * @param {string} boxNow  what the box holds when the answer arrives
 * @returns {{clear: boolean, why: string|null}}
 */
export function settleComposer(outcome, sent, boxNow) {
  if (outcome && outcome.ok) return { clear: boxNow === sent, why: null };
  return { clear: false, why: (outcome && outcome.why) || 'refused' };
}

/** Every complete message enters the same queue. Never append a terminal Enter here. */
export async function sendComposerMessage(target, text) {
  const result = await request('/api/messages', { method: 'POST', json: { target, text } });
  if (!result.ok) return { ok: false, why: result.message };
  // Once accepted, the queue owns the only copy.
  return { ok: result.data.ok === true, why: 'refused' };
}
