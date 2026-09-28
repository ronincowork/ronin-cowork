import { request } from './request.js';
import { store } from './store.js';
import { mikaTab } from './mika.js';
import { t } from './lexicon.js';

let inFlight = null;

// The route's own statuses, so an answer that arrives by push reads exactly like the POST's.
const answered = ({ t: _type, ...ready }) => ({
  ok: ready.ok === true, status: ready.ok === true ? 200 : ready.state === 'starting' ? 202 : 409, data: ready,
});
const settled = (result) => !(result.status === 202 && result.data?.state === 'starting');

/**
 * One POST asks Ronin to make Mika ready. The server's pane classifier is the only
 * authority on when she is, and it says so by push ({t:'mika', …}, the POST's body): ready
 * or action_required settles it, starting keeps waiting. The listener is up before the
 * POST, so an answer that beats the POST's own is not missed. A socket that closes settles
 * it with request()'s own unreachable answer, which every caller reads as not ready.
 */
function observeUntilSettled(intent) {
  return new Promise((resolve) => {
    const stops = [];
    const settle = (result) => { for (const stop of stops) stop(); resolve(result); };
    stops.push(store.listen('mika', (message) => {
      const result = answered(message);
      if (settled(result)) settle(result);
    }));
    stops.push(store.onClose(() => settle({
      ok: false, status: 0, kind: 'network', retryable: true,
      message: t('request.unreachable', 'could not reach Ronin — network or server down'),
    })));
    void request('/api/mika/ready', { method: 'POST', json: { intent, tab: mikaTab() } })
      .then((result) => { if (settled(result)) settle(result); });
  });
}

/** The one client readiness controller shared by Help and first-run Setup. */
export function readyMika(intent = 'help') {
  if (inFlight) return inFlight;
  inFlight = observeUntilSettled(intent)
    .finally(() => { inFlight = null; });
  return inFlight;
}
