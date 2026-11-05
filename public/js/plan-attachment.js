/* part of the ronin-cowork client — see js/README.md */
/**
 * AN EPIC'S PLAN (KAN-256): an attachment `plan:<workspace>/<name>` names a plan on its Workspace
 * (src/plans.ts), never a path. Each reader shows it by that name and opens it through the plan read
 * (/api/plans/resolve: where the file is now); one that no longer resolves says gone.
 */
import { request } from './request.js';
import { t } from './lexicon.js';

export const isPlanRef = (doc) => /^plan:/.test(String(doc || ''));
export const planName = (doc) => String(doc || '').replace(/^plan:/, '');

/** Where the plan is now, or null when it is gone. */
export async function resolvePlan(ref, campaignId = '') {
  const query = new URLSearchParams({ ref: planName(ref), ...(campaignId ? { campaign_id: campaignId } : {}) });
  const answer = await request(`/api/plans/resolve?${query}`, { cache: 'no-store' });
  return answer.ok ? answer.data.path : null;
}

/** The plan's row in a reader: its name, a press that opens it where `open` takes a path, or
 * "<name> · gone" once the read says it no longer resolves. */
export function planAttachment(ref, { className = '', campaignId = '', open = null } = {}) {
  const row = document.createElement(open ? 'button' : 'span');
  row.className = className;
  if (open) row.type = 'button';
  row.textContent = t('plans.attachment', 'Plan {name}', { name: planName(ref) });
  row.title = ref;
  void resolvePlan(ref, campaignId).then((at) => {
    if (at) { if (open) row.addEventListener('click', () => open(at)); return; }
    row.textContent = t('plans.gone', '{name} · gone', { name: planName(ref) });
    row.dataset.gone = 'true';
    if (open) row.disabled = true;
  });
  return row;
}
