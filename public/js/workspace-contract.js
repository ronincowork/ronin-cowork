/* Runtime-checked workspace state and navigation values for Kit consumers. */
import { migrateWorkbenchState } from './workspace-arrangement.js';
export const WORKSPACE_DESTINATIONS = Object.freeze([
  'campaign', 'cowork', 'team', 'agent', 'customize', 'commons', 'configuration',
]);

/** Shared header capabilities for a movable workbench. Static views opt into only
 * what they own; undeclared capabilities stay absent. */
export const WORKBENCH_HEADER = Object.freeze({
  shape: true,
  ram: true,
  services: true,
  feedback: true,
});
export const WORKBENCH_APPEARANCES = Object.freeze(['campaign', 'setup', 'launch', 'cowork', 'team', 'agent']);

/** Apply the declared Workbench appearance at the document boundary. Desktop and phone
 * routers share this writer; surfaces only consume the resulting chrome tokens. */
export function applyWorkbenchAppearance(appearance, root = document.documentElement) {
  if (WORKBENCH_APPEARANCES.includes(appearance)) root.dataset.workbench = appearance;
  else delete root.dataset.workbench;
}

/** One declaration for every managed Workbench's application chrome. Feature views
 * provide content and, when useful, an island reading; the base owns capabilities and
 * appearance identity. */
export function workbenchView(appearance, options = {}) {
  if (!WORKBENCH_APPEARANCES.includes(appearance)) throw new Error(`unknown Workbench appearance: ${appearance}`);
  return Object.freeze({
    appearance,
    header: Object.freeze({ ...WORKBENCH_HEADER, ...(options.header || {}) }),
    ...(options.island ? { island: options.island } : {}),
  });
}
export const UTILITY_HEADER = Object.freeze({
  ram: true,
  services: true,
  feedback: true,
});

const destinationSet = new Set(WORKSPACE_DESTINATIONS);
const text = (value) => typeof value === 'string' ? value : '';

// Persisted seat value for an intentional blank. Absence still means an uninitialized
// workspace whose owning view may seed a default on first entry.
export const DISMISSED_WORKSPACE = '@empty';
export const workspaceMaySeedDefault = (remembered) => remembered !== DISMISSED_WORKSPACE;

export function workspaceTarget(view, param = '') {
  if (!destinationSet.has(view)) throw new Error(`Unknown workspace destination: ${view}`);
  return Object.freeze({ view, param: text(param) });
}

export function navigateWorkspace(context, target, options = {}) {
  if (!target || !destinationSet.has(target.view)) throw new Error('Invalid workspace navigation target.');
  return context.navigate(target.view, { ...options, param: text(target.param) });
}

export function normalizeWorkbenchState(viewState = null, declaration = null) {
  const view = viewState && typeof viewState === 'object' ? viewState : {};
  const seats = {};
  for (const [slot, value] of Object.entries(view.seats && typeof view.seats === 'object' ? view.seats : {})) {
    if (text(value)) seats[slot] = value;
    else if (value && typeof value === 'object' && text(value.type)) seats[slot] = Object.freeze({
      type: value.type, key: text(value.key),
      ...(text(value.root) ? { root: value.root } : {}),
      ...(text(value.path) ? { path: value.path } : {}),
      ...(text(value.tab) ? { tab: value.tab } : {}),
      ...(text(value.doc) ? { doc: value.doc } : {}),
    });
  }
  return Object.freeze({
    seats: Object.freeze(seats),
    arrangement: declaration ? migrateWorkbenchState(view.arrangement, declaration) : null,
  });
}
