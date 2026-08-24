/* Runtime-checked workspace state and navigation values for Kit consumers. */
export const WORKSPACE_DESTINATIONS = Object.freeze([
  'sessions', 'league', 'team', 'customize', 'new-team', 'agent-config', 'commons', 'configuration',
]);

const destinationSet = new Set(WORKSPACE_DESTINATIONS);
const text = (value) => typeof value === 'string' ? value : '';
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function workspaceTarget(view, param = '') {
  if (!destinationSet.has(view)) throw new Error(`Unknown workspace destination: ${view}`);
  return Object.freeze({ view, param: text(param) });
}

export function navigateWorkspace(context, target, options = {}) {
  if (!target || !destinationSet.has(target.view)) throw new Error('Invalid workspace navigation target.');
  return context.navigate(target.view, { ...options, param: text(target.param) });
}

export function teamWorkspaceState(state = {}) {
  const surfaces = state.surfaces && typeof state.surfaces === 'object' ? state.surfaces : {};
  const widths = state.widths && typeof state.widths === 'object' ? state.widths : {};
  return Object.freeze({
    team: text(state.team),
    mode: state.teamMode === 'sessions' ? 'sessions' : 'team',
    focusedSession: text(state.focusedSession),
    surfaces: Object.freeze({ terminalTile: !!surfaces.terminalTile, kanban: !!surfaces.kanban, channels: !!surfaces.channels }),
    widths: Object.freeze({ left: finite(widths.left, 40), right: finite(widths.right, 40) }),
  });
}
