/* part of the tmux-ronin client — see js/README.md */
import { fetchSessions } from './api.js';
import { tiles } from './state.js';

export let homeData = null; // session list enriched with status + ctx
export let macroData = null; // [{name, description, params:[{name, hint}]}]
export let homeInflight = false;

export async function refreshHome() {
  if (homeInflight || !tiles.some((t) => t.homeVisible())) return;
  homeInflight = true;
  try {
    const r = await fetch('/api/home', { cache: 'no-store' });
    const d = await r.json();
    if (r.ok && Array.isArray(d)) homeData = d;
  } catch (_) {
  } finally {
    homeInflight = false;
  }
  tiles.forEach((t) => t.renderHome());
}

export let projectData = null; // /api/project-roots: [{name, dir, read[], provider, model, match[], remit, cmd}]
export let launchSpecData = null; // /api/session-launch-specs: [{provider, model, cmd}] — the launch table, in table order

export async function loadProjects() {
  try {
    const [pr, br] = await Promise.all([fetch('/api/project-roots'), fetch('/api/session-launch-specs')]);
    const [pd, bd] = await Promise.all([pr.json(), br.json()]);
    if (pr.ok && Array.isArray(pd)) projectData = pd;
    if (br.ok && Array.isArray(bd)) launchSpecData = bd;
  } catch (_) {}
  tiles.forEach((t) => t.renderHome());
}

/* ---------- the launcher board: session_job x project_root ----------
 * The three universal axes — the same keys that scope a memory. The session_jobs
 * you can start (buildout / cutcode / review / audit / manage / fork / other) are
 * read live from ronin_catalogs/SESSION_JOBS.md, never hardcoded here. The session_job
 * fixes what a launch must not leave to chance (the dial the session is born on,
 * its lifecycle, whether it acknowledges before acting); the user picks
 * project_root, session_launch_spec and group; the server assembles the brief and
 * performs the spawn. Spec: co-working/user_repo/wip/buildouts/MACRO_LAUNCHER.md.
 */
export let presetData = null; // /api/session-jobs

export async function loadPresets() {
  try {
    const pr = await fetch('/api/session-jobs');
    const pd = await pr.json();
    if (pr.ok && Array.isArray(pd)) presetData = pd;
  } catch (_) {}
  tiles.forEach((t) => t.renderHome());
}

/**
 * The mark a session wears wherever sessions are listed — the ⌂ Roster, the tile header's
 * picker, the ⚡ macro targets. This is what replaced the hand-set 人: it says what the
 * session IS rather than who outranks whom, and the coordinator is simply the session
 * whose job is `QuarterBack` 🏈.
 *
 * **It comes off the LETTER, and it is on every session list.** `session_job` is a field
 * of the session's own TEGAMI, filled mechanically at birth with the button the owner
 * pressed and changed by the session itself with `write_tegami` — "a session that
 * finishes planning and starts building has changed job, not become a new session". The
 * server reads it back onto every list it serves (`src/tegami.ts`, `withRoles`), so the
 * roster, the tile header and the ⚡ targets cannot disagree, and no second copy exists
 * anywhere to drift from the file.
 *
 * The role half of the letter is COWORK's — a session has a role whether or not it ever
 * puts a ladder up — so this works on a build with no michi, where `s.tegami` and the
 * SHINGO chip are absent entirely.
 *
 * '' whenever nobody has said, and callers draw nothing rather than guessing: a session
 * Ronin never launched has no letter, and the gap is the honest answer.
 */
export const jobIcon = (s) =>
  (s?.session_job && (presetData || []).find((k) => k.name === s.session_job)?.icon) || '';

export async function loadMacros() {
  try {
    const r = await fetch('/api/macros');
    const d = await r.json();
    if (r.ok && Array.isArray(d)) macroData = d;
  } catch (_) {}
  tiles.forEach((t) => t.renderHome());
}

/** /api/saved-launches — the launcher form, filled in ahead of time and named.
 *  USER SCOPE ONLY: nothing ships, so an empty list is the ordinary state. */
export let savedLaunchData = null;

export async function loadSavedLaunches() {
  try {
    const r = await fetch('/api/saved-launches');
    const d = await r.json();
    if (r.ok && Array.isArray(d)) savedLaunchData = d;
  } catch (_) {}
  tiles.forEach((t) => t.renderHome());
}

export const STATUS_LABEL = { ready: 'ready', thinking: 'thinking…', 'awaiting-input': 'awaiting input' };

/**
 * Build one tile's home panel: the session list (status + gauge reading, tap =
 * open here), the new-session launcher, and fill-in forms for the macros —
 * parsed live from ronin_catalogs/MACROS.md via /api/macros, nothing hardcoded.
 */
export function showReceipt(name, receipt) {
  if (!receipt) return;
  document.querySelector('#kdashi')?.remove();
  const el = document.createElement('div');
  el.id = 'kdashi';
  const dialIcon = { user: '👤', read: '👁', write: '🤖' }[receipt.dial] || '';
  const bits = [
    receipt.mode === 'manual' ? 'manual' : 'assisted',
    receipt.session_job,
    receipt.project_root,
    // No cmd = an `agent: none` kind: say so, rather than leaving a gap the reader
    // has to interpret as "the session_launch_spec field failed to fill".
    receipt.cmd ? receipt.cmd.replace(/^claude --model /, '') : 'no agent',
    `${dialIcon} ${receipt.dial}`,
    receipt.lifecycle ? `⟳ ${receipt.lifecycle}` : '',
    ...(receipt.tags || []).map((g) => `🏷 ${g}`),
  ].filter(Boolean);
  const head = document.createElement('b');
  head.textContent = name;
  const body = document.createElement('small');
  body.textContent = bits.join(' · ');
  const kill = document.createElement('button');
  kill.textContent = 'kill';
  kill.title = 'Wrong? Remove the session now.';
  kill.addEventListener('click', async () => {
    kill.disabled = true;
    try {
      await fetch('/api/sessions/' + encodeURIComponent(name), { method: 'DELETE' });
    } catch (_) {}
    el.remove();
    fetchSessions();
    refreshHome();
  });
  const dismiss = document.createElement('button');
  dismiss.className = 'kd-x';
  dismiss.textContent = '✕';
  dismiss.addEventListener('click', () => el.remove());
  el.append(head, body, kill, dismiss);
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('fade'), 12000);
  setTimeout(() => el.remove(), 15000);
}

