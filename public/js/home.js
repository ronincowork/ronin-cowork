/* part of the ronin-cowork client — see js/README.md */
/**
 * HOME DATA — the client's one cache of what the server knows about sessions and
 * catalogs, and the one place that refreshes it.
 *
 * This module was always the de-facto repository (`homeData`, `projectData`,
 * `launchSpecData`, an inflight guard); it is now the declared one. Every reader —
 * the roster, the launcher, the tile pickers, the ⚡ menus — renders from these
 * caches, and every refresh path (boot, visibility, bfcache, the 8s poll, a
 * mutation's follow-up) lands here rather than fetching its own copy.
 *
 * A failed refresh keeps the LAST GOOD data and records the fault (`homeFault`)
 * instead of swallowing it: stale-and-labelled beats empty-and-silent, and the
 * roster draws the label (js/roster.js). The catalogs (macros, projects, presets,
 * saved launches) stay best-effort — they change when the owner changes them, and
 * the next successful load heals them without a banner.
 */
import { request } from './request.js';
import { fetchSessions } from './api.js';
import { tiles } from './state.js';
import { t } from './lexicon.js';

export let homeData = null; // session list enriched with status + ctx
// `instruction` is the AGENT's prose and `label`/`blurb` are the PERSON's copy — two
// readers, two fields, and no client surface may render the first (src/macros.ts).
export let macroData = null; // [{name, instruction, label, blurb, params:[{name, hint}]}]
export let homeInflight = false;
/** Why the roster might be stale: the last /api/home failure's message, or null. */
export let homeFault = null;

export async function refreshHome() {
  if (homeInflight) return;
  homeInflight = true;
  const r = await request('/api/home', { cache: 'no-store' });
  if (r.ok && Array.isArray(r.data)) {
    homeData = r.data;
    homeFault = null;
  } else if (!r.ok) {
    homeFault = r.message; // keep the last good list; say why it may be stale
  }
  homeInflight = false;
  tiles.forEach((tile) => tile.renderHome?.());
}

export let projectData = null; // /api/project-roots: [{name, dir, read[], provider, model, match[], remit, cmd}]
export let launchSpecData = null; // /api/session-launch-specs: [{provider, model, cmd}] — the launch table, in table order

export async function loadProjects() {
  const [pr, br] = await Promise.all([
    request('/api/project-roots'),
    request('/api/session-launch-specs'),
  ]);
  if (pr.ok && Array.isArray(pr.data)) projectData = pr.data;
  if (br.ok && Array.isArray(br.data)) launchSpecData = br.data;
  tiles.forEach((tile) => tile.renderHome?.());
}

/* ---------- the launcher board: session_role × team × project_root ----------
 * A `role_family` is PRESENTATION (R35, 2026-08-23): it groups the session_role buttons
 * into shelves and seeds a Build-Team template, and contributes nothing to the launch.
 * Both catalogs are read live — ronin_catalogs/role_families/ for the shelves,
 * ronin_catalogs/session_roles/ for the buttons — never hardcoded here.
 *
 * WHAT THE LAUNCH IS ACTUALLY BORN WITH IS NOT ON THESE ROWS. A dial, a permissions
 * mode, whether the brain is on — those come from the resolved profile
 * (`/api/launch-profile?session_role=…`), asked when the pick changes rather than
 * re-implemented here: one cascade, in one language, in src/launch-profile.ts.
 *
 * The user picks project_root, session_launch_spec and team; the server assembles the
 * brief and performs the spawn.
 */
export let familyData = null; // /api/role-families — the shelves
export let roleData = null; // /api/session-roles — the buttons

export async function loadPresets() {
  const [families, roles] = await Promise.all([request('/api/role-families'), request('/api/session-roles')]);
  if (families.ok && Array.isArray(families.data)) familyData = families.data;
  if (roles.ok && Array.isArray(roles.data)) roleData = roles.data;
  tiles.forEach((tile) => tile.renderHome?.());
}

/**
 * The mark a session wears wherever sessions are listed — the ⌂ Roster, the tile header's
 * picker, the ⚡ macro targets. This is what replaced the hand-set 人: it says what the
 * session is DOING rather than who outranks whom.
 *
 * **IT IS THE TASK, NEVER THE ROLE.** The two axes are drawn differently on purpose: the
 * task changes as the work moves, so it is the live mark; the role is stable context and
 * belongs in the session's details, where it does not compete with a mark that moves. A
 * session with a role and no task shows no mark, and that is correct — it has not said
 * what it is doing.
 *
 * **It comes off the LETTER, and it is on every session list.** `session_role` is a field
 * of the session's own TEGAMI, filled mechanically at birth with the button the owner
 * pressed and changed by the session itself with `write_tegami` — "a session that
 * finishes planning and starts building has changed task, not become a new session". The
 * server reads it back onto every list it serves (`src/tegami.ts`, `withAxes`), so the
 * roster, the tile header and the ⚡ targets cannot disagree, and no second copy exists
 * anywhere to drift from the file.
 *
 * The axis half of the letter is COWORK's — a session has a task whether or not it ever
 * puts a ladder up — so this works on a build with no michi, where `s.tegami` and the
 * SHINGO chip are absent entirely.
 *
 * '' whenever nobody has said, and callers draw nothing rather than guessing.
 */
export const taskIcon = (s) =>
  (s?.session_role && (roleData || []).find((k) => k.name === s.session_role)?.icon) || '';


export async function loadMacros() {
  const r = await request('/api/macros');
  if (r.ok && Array.isArray(r.data)) macroData = r.data;
  tiles.forEach((tile) => tile.renderHome?.());
}

/** /api/saved-launches — the launcher form, filled in ahead of time and named.
 *  USER SCOPE ONLY: nothing ships, so an empty list is the ordinary state. */
export let savedLaunchData = null;

export async function loadSavedLaunches() {
  const r = await request('/api/saved-launches');
  if (r.ok && Array.isArray(r.data)) savedLaunchData = r.data;
  tiles.forEach((tile) => tile.renderHome?.());
}

/** The status word for a row — a function, not a table, because the lexicon is loaded
 *  after this module is evaluated and a table would freeze the stock words. */
export function statusLabel(status) {
  return { ready: t('home.status_ready', 'ready'), thinking: t('home.status_thinking', 'thinking…'), 'awaiting-input': t('home.status_awaiting_input', 'awaiting input') }[status];
}
