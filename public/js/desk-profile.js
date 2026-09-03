/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { loadLexicon } from './lexicon.js';
import { IS_TOUCH, S } from './state.js';
import { applyTheme, setCampaignTheme } from './theme.js';

/** `{ active, profiles }` as served; `active` is the resolved profile object or null. */
let desk = { active: null, profiles: [] };

export const activeProfile = () => desk.active;
export const deskProfiles = () => desk.profiles;

const OUTPUTS = new Set(['locked', 'terminal_mirror', 'detailed', 'condensed', 'cherry_pick']);

/** Read the list and the active profile; put its lexicon up; seed the new-tile default. */
export async function loadDeskProfile() {
  const r = await request('/api/desk-profiles');
  const profiles = r.ok && Array.isArray(r.data?.profiles) ? r.data.profiles : [];
  const name = r.ok ? String(r.data?.active || '') : '';
  const active = profiles.find((p) => p.name === name) || null;
  desk = { active, profiles };
  // Campaign's own record — the Machine Settings control — and it was never applied
  // at boot before, so a configured dark painted light until the Campaign page was
  // opened. The device's pin still outranks it (theme.js). Repaint immediately: a
  // stock-skin install skips restoreSkin's own applyTheme.
  if (r.ok) {
    setCampaignTheme(r.data?.desk || null);
    applyTheme();
  }
  await loadLexicon(active?.lexicon || '');
  // A phone keeps its mirror (state.js: a locked tile is unusable at 402px); the
  // profile's view is the desktop default only, and only when it names a real view.
  if (active && !IS_TOUCH && OUTPUTS.has(active.rireki_view)) {
    S.output = active.rireki_view;
    S.locked = S.output === 'locked';
  }
  return active;
}

/** Choose one (or '' for stock): settei's door, then re-read so every reader agrees. */
export async function setDeskProfile(name) {
  const r = await request('/api/machine-settings', { method: 'PATCH', json: { family: 'desk', value: { profile: String(name || '') } } });
  if (!r.ok) return r;
  await loadDeskProfile();
  return r;
}
