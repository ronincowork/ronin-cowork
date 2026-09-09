import { request } from './request.js';

let inFlight = null;

const pause = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function observeUntilSettled(intent) {
  let unavailable = 0;
  for (;;) {
    const result = await request('/api/mika/ready', { method: 'POST', json: { intent } });
    if (result.status === 0 && result.retryable && unavailable++ < 11) {
      await pause(350);
      continue;
    }
    if (result.status !== 202 || result.data?.state !== 'starting') return result;
    // The server's pane classifier is the only readiness authority. Keep the quick
    // surface in its owned loading state and observe it again; never mount early.
    await pause(350);
  }
}

/** The one client readiness controller shared by Help and first-run Setup. */
export function readyMika(intent = 'help') {
  if (inFlight) return inFlight;
  inFlight = observeUntilSettled(intent)
    .finally(() => { inFlight = null; });
  return inFlight;
}
