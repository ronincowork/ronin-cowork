/* part of the ronin-cowork client — see js/README.md */
/**
 * The workspace-folder catalog and the words for an Agent's stance. The home rows
 * themselves are the store's (js/store.js).
 *
 * The catalog stays best-effort — it changes when the owner changes it, and the next
 * successful load heals it without a banner.
 */
import { request } from './request.js';
import { t } from './lexicon.js';
import { subscribe } from './store.js';
import { hearWorkspaces } from './workspaces-read.js';

// The restored roster (js/roster.js) reads the pushed rows here. The store reconnects on
// its own and says so, so the roster's stale line has no fault to show.
export let homeData = null;
export const homeFault = null;
subscribe('home', (rows) => { homeData = rows; });

export let projectData = null; // every Workspace's folder rows, once by name: [{name, dir, note, title}]
// The provider catalog is not cached here: form-steps.js reads it for the one picker and
// Settings' harness pages, fresh on every surface entry.

const projectListeners = new Set();
/** Hear the folders change: a Workspace saved reads them again. */
export function onProjects(listener) { projectListeners.add(listener); return () => projectListeners.delete(listener); }

let hearing = false;
export async function loadProjects() {
  if (!hearing) { hearing = true; hearWorkspaces(() => void loadProjects()); }
  const r = await request('/api/workspaces');
  if (r.ok) {
    const rows = new Map();
    for (const w of r.data.workspaces || []) for (const row of [...w.repos, ...w.folders]) if (!rows.has(row.name)) rows.set(row.name, { ...row, title: row.name });
    projectData = [...rows.values()];
  }
  for (const listener of projectListeners) { try { listener(projectData); } catch (error) { console.error(error); } }
}

/**
 * What an Agent is doing now, in the owner's words — a function, not a table, because the
 * lexicon is loaded after this module is evaluated and a table would freeze the stock words. The backend decides which of these it
 * is — from the journal, except `asking`, which is the one thing only the screen shows —
 * and nothing here infers anything from anything.
 */
// AN AGENT PILL'S ONE SITUATION (owner, 2026-11-18, KAN-665), read from its card alone:
// flagged (its work record's `flags` is not empty, KAN-776: a flagged item, or the Agent asking,
// without progress or stopped) > stopped (its pane died, with no record to carry the flag) >
// working > ready (its turn ended under READY_MS ago, by the card's `at`) > '' (idle: the plain
// pill is the calm state).
export const READY_MS = 10 * 60_000;
export const agentSituation = (card = {}, now = Date.now()) => (card.tegami?.flags?.length ? 'flagged'
  : card.stance === 'stopped' ? 'stopped'
    : card.stance === 'working' ? 'working'
      : ['awaiting_you', 'interrupted'].includes(card.stance) && now - Date.parse(card.at) < READY_MS ? 'ready' : '');
// ONE LOCAL CLOCK FOR EVERY PILL LIST: Ready ages into idle with no push, so the open lists
// look again each half minute. The tick carries no data and asks nothing (owner's no-polling
// rule is about data); each list's keyed rows redraw only the pills whose look moved.
const agers = new Set();
let ageClock = null;
export const onAgeTick = (fn) => {
  agers.add(fn);
  ageClock ??= setInterval(() => { for (const one of [...agers]) one(); }, 30_000);
  return () => { agers.delete(fn); if (!agers.size) { clearInterval(ageClock); ageClock = null; } };
};
// The situation in words, for the tip and the accessible name (tips.js moves a title into both,
// so it carries the Agent's name too).
export const situationTitle = (label, situation) => `${label} · ${{
  working: () => t('team.situation_working', 'Working'),
  ready: () => t('team.situation_ready', 'Ready: just finished'),
  flagged: () => t('team.situation_flagged', 'Needs you'),
  stopped: () => t('team.situation_stopped', 'Stopped'),
}[situation]?.() || t('team.situation_idle', 'Idle')}`;
export function stanceLabel(stance) {
  return {
    working: t('home.stance_working', 'working…'),
    awaiting_you: t('home.stance_awaiting_you', 'awaiting you'),
    asking: t('home.stance_asking', 'asking you'),
    no_progress: t('home.stance_no_progress', 'no progress for 12 min'),
    stopped: t('home.stance_stopped', 'stopped'),
    // Unknown has no words: t() with an empty fallback answers its key (w452).
    unknown: '',
  }[stance];
}
