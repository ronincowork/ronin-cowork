import { request } from './request.js';

let inFlight = null;

/** The one client readiness controller shared by Help and first-run Setup. */
export function readyMika(intent = 'help') {
  if (inFlight) return inFlight;
  inFlight = request('/api/mika/ready', { method: 'POST', json: { intent } })
    .finally(() => { inFlight = null; });
  return inFlight;
}
