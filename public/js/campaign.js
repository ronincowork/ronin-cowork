import { request } from './request.js';

/** One observer for Campaign identity; every surface reads the same SETTEI leaf. */
export function createCampaignIdentity(onChange) {
  let name = '';
  const accept = (value) => { name = String(value || '').trim(); onChange(name); };
  const changed = (event) => accept(event.detail?.name);
  window.addEventListener('ronin:campaign-change', changed);
  return {
    name: () => name,
    load: async () => { const r = await request('/api/settei'); if (r.ok) accept(r.data?.set?.campaign?.name); },
    destroy: () => window.removeEventListener('ronin:campaign-change', changed),
  };
}
