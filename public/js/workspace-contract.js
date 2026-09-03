/* Runtime-checked workspace state and navigation values for Kit consumers. */
import { migrateWorkbenchState } from './workspace-arrangement.js';
export const WORKSPACE_DESTINATIONS = Object.freeze([
  'campaign', 'cowork', 'team', 'customize', 'commons', 'configuration',
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

export function teamWorkspaceState(state = {}, viewState = null, declaration = null) {
  const view = viewState && typeof viewState === 'object' ? viewState : {};
  const stored = view.arrangement || null;
  const legacy = (state.widths || state.surfaces) ? { widths: state.widths, surfaces: state.surfaces } : null;
  // SEATS: which member is up in which workspace slot, by slot name. The one-seat
  // `focusedSession` of the shell's top-level state is read once, into the first seat.
  const seats = {};
  for (const [slot, value] of Object.entries(view.seats && typeof view.seats === 'object' ? view.seats : {})) {
    if (text(value)) seats[slot] = value;
    else if (value && typeof value === 'object' && text(value.type)) seats[slot] = Object.freeze({ type: value.type, key: text(value.key) });
  }
  return Object.freeze({
    team: text(state.team),
    mode: state.teamMode === 'sessions' ? 'sessions' : 'team',
    focusedSession: text(state.focusedSession),
    seats: Object.freeze(seats),
    arrangement: declaration ? migrateWorkbenchState(stored || legacy, declaration) : null,
  });
}
