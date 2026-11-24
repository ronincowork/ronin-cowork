/** Setup's scenes: selector doors that never reshape the workbench. Self-hosted: five steps, then Launch. */
export const SETUP_SCENES = Object.freeze([
  { id: 'provider', label: 'Harnesses', type: 'setup.providers', canvas: 'garden.setup.provider-welcome' },
  { id: 'register', label: 'Register (optional)', type: 'setup.register', canvas: 'garden.setup.register' },
  { id: 'workspace', label: 'Workspaces', type: 'setup.roots', canvas: 'garden.setup.workspace' },
  { id: 'installations', label: 'Installations', type: 'setup.installations', canvas: 'garden.setup.installations' },
  { id: 'password', label: 'Password', type: 'machine.password', canvas: 'garden.setup.password' },
  { id: 'launch', label: 'Launch', type: 'setup.launch-own', canvas: 'garden.setup.launch' },
].map((scene, index) => Object.freeze({ ...scene, number: index + 1 })));

/**
 * HOSTED SETUP (owner, 2026-11-24; w926; samurai_lab/wip/SETUP_SWEEP.md §7): the prototype's three
 * steps, Harness, Workspace and Team, in any order, each ticked from a fact; then three pages with no
 * tick, Understanding, Running and Help, whose text is the docs'. The same whether she runs or not.
 */
export const HOSTED_SCENES = Object.freeze([
  { id: 'harness', label: 'Harness', type: 'setup.harness', canvas: 'garden.hosted.harness' },
  { id: 'workspace', label: 'Workspace', type: 'setup.roots', canvas: 'garden.hosted.workspace' },
  { id: 'team', label: 'Team', type: 'setup.team', canvas: 'garden.hosted.team' },
  { id: 'understanding', label: 'Understanding', type: 'setup.understanding', canvas: 'garden.hosted.understanding', page: 'docs/getting-started/understanding.md' },
  { id: 'running', label: 'Running', type: 'setup.running', canvas: 'garden.hosted.running', page: 'docs/getting-started/running.md' },
  { id: 'help', label: 'Help', type: 'setup.help', canvas: 'garden.hosted.help', page: 'docs/getting-started/help.md' },
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
