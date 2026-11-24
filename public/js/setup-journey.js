/**
 * SETUP'S SCENES, ON EVERY OFFICE (owner, 2026-11-24; w926; samurai_lab/wip/SETUP_SWEEP.md §7): selector
 * doors that never reshape the workbench. The prototype's three steps, Harness, Workspace and Team, in any
 * order, each ticked from a fact; then the Ronin Tour, a page with no tick whose text is the docs'
 * (docs/getting-started/tour.md: how Agents begin, how the work runs, then Questions). The same
 * whether she runs or not; Ask Ronin heads the selector.
 */
export const SETUP_SCENES = Object.freeze([
  { id: 'harness', label: 'Harness', type: 'setup.harness', canvas: 'garden.setup.harness' },
  { id: 'workspace', label: 'Workspace', type: 'setup.roots', canvas: 'garden.setup.workspace' },
  { id: 'team', label: 'Team', type: 'setup.team', canvas: 'garden.setup.team' },
  { id: 'tour', label: 'Tour', type: 'setup.tour', canvas: 'garden.setup.tour', page: 'docs/getting-started/tour.md' },
].map((scene, index) => Object.freeze({ ...scene, number: index + 1 })));

/* IRASSHAI (setup-irasshai.js): the Helpful Assistant, Setup's Ask Ronin panel. */
export const IRASSHAI = 'irasshai';
/** The name people see (owner, 2026-11-19; KAN-691): "irasshai is cute but not legible". Code, route and session stay irasshai. */
export const IRASSHAI_NAME = 'Helpful Assistant';

/** Whether her session is in a session list (setup-irasshai.js reads the pushed one). */
export const irasshaiIn = (sessions) => (sessions || []).some((session) => session?.name === IRASSHAI);

/** Irasshai's chat (KAN-617): a record as her chat draws it, or null. See setup-irasshai.js. The
 *  person's own message reaches here already without its head (tile-transcript.js, KAN-758); a
 *  record still under a head is another delivery. */
const HEAD = /^From [^\n]*\[[^\]\n]+\]:\n/;
export function irasshaiShown(rec) {
  if (rec?.role !== 'user') return rec;
  const text = String(rec.text || '');
  if (HEAD.test(text)) return null;
  return /^\s*Read first: \S*AGENT_BIRTH_BRIEF\.md\b/.test(text) ? null : rec;
}
