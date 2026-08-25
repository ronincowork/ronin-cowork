/* Runtime-checked workspace state and navigation values for Kit consumers. */
import { migrateWorkbenchState } from './workspace-arrangement.js';
export const WORKSPACE_DESTINATIONS = Object.freeze([
  'sessions', 'league', 'team', 'customize', 'new-team', 'agent-config', 'commons', 'configuration',
]);

const destinationSet = new Set(WORKSPACE_DESTINATIONS);
const text = (value) => typeof value === 'string' ? value : '';

export function workspaceTarget(view, param = '') {
  if (!destinationSet.has(view)) throw new Error(`Unknown workspace destination: ${view}`);
  return Object.freeze({ view, param: text(param) });
}

export function navigateWorkspace(context, target, options = {}) {
  if (!target || !destinationSet.has(target.view)) throw new Error('Invalid workspace navigation target.');
  return context.navigate(target.view, { ...options, param: text(target.param) });
}

/**
 * The Team destination's typed state. `arrangement` is the workbench's slot arrangement
 * (workspace-arrangement.js) as the view persisted it — normalized against the
 * declaration the view passes — or, once, migrated from the pre-arrangement shape the
 * shell's top-level state used to carry (`widths: {left, right}`, `surfaces: {...}`).
 * Per destination now; leg 2 keys it per team.
 */
export function teamWorkspaceState(state = {}, viewState = null, declaration = null) {
  const stored = viewState && typeof viewState === 'object' && viewState.arrangement ? viewState.arrangement : null;
  const legacy = (state.widths || state.surfaces) ? { widths: state.widths, surfaces: state.surfaces } : null;
  return Object.freeze({
    team: text(state.team),
    mode: state.teamMode === 'sessions' ? 'sessions' : 'team',
    focusedSession: text(state.focusedSession),
    arrangement: declaration ? migrateWorkbenchState(stored || legacy, declaration) : null,
  });
}
