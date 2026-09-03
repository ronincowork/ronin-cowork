/* part of the ronin-cowork client — see js/README.md */
/**
 * DESK PROFILE — the owner's standing defaults, read once at boot (R38, 2026-08-27).
 *
 * One request, `GET /api/desk-profiles`, answers both what exists and which is active;
 * the active one is settei's leaf, not this device's — a choice that has to hold across
 * browsers is not a browser's to keep. `active: ''` is the ordinary answer of every
 * install older than the catalog and means "as stock" everywhere below.
 *
 * WHAT THIS MODULE APPLIES, and what it deliberately does not:
 *   - the lexicon: `loadLexicon(profile.lexicon)` — every `t()` reads it from then on;
 *   - a NEW tile's Output: `S.output` is the default a tile is born with (state.js) and
 *     nothing more — a tile's own choice is per tile and is never overwritten here;
 *   - the skin is NOT applied here. `restoreSkin(profile.skin)` in main.js does it, in
 *     the order the theme requires (theme, then skin), and keeps the device's own pick
 *     if it made one since — see skins.js for that rule.
 * The Team page reads `team_arrangement` itself when a tab has nothing of its own.
 */
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
  // THE CAMPAIGN'S THEME lands here (owner, 2026-09-01): the served `desk` is the
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
  const r = await request('/api/machine-settings/desk', { method: 'PUT', json: { profile: String(name || '') } });
  if (!r.ok) return r;
  await loadDeskProfile();
  return r;
}
