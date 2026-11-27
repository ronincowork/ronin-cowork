/* Runtime-checked workspace state values for Kit consumers. */
import { migrateWorkbenchState } from './workspace-arrangement.js';

/** Shared header capabilities for a movable workbench. Static views opt into only
 * what they own; undeclared capabilities stay absent. */
export const WORKBENCH_HEADER = Object.freeze({
  shape: true,
  ram: true,
  feedback: true,
});
export const WORKBENCH_APPEARANCES = Object.freeze(['campaign', 'setup', 'launch', 'cowork', 'team', 'agent', 'workspaces', 'epics', 'help', 'settings2']);
// A workbench from a folder (KAN-954) adds its name at boot (folder-workbenches.js): one more
// Workbench destination, with a tab instance of its own like the built-in ones.
const appearances = new Set(WORKBENCH_APPEARANCES);
export const isWorkbenchAppearance = (name) => appearances.has(name);
export const addWorkbenchAppearance = (name) => { appearances.add(name); };

/** One declaration for every managed Workbench's application chrome. Feature views
 * provide content and, when useful, an island reading; the base owns capabilities and
 * appearance identity. */
export function workbenchView(appearance, options = {}) {
  if (!isWorkbenchAppearance(appearance)) throw new Error(`unknown Workbench appearance: ${appearance}`);
  return Object.freeze({
    appearance,
    header: Object.freeze({ ...WORKBENCH_HEADER, ...(options.header || {}) }),
    ...(options.island ? { island: options.island } : {}),
  });
}
export const UTILITY_HEADER = Object.freeze({
  ram: true,
  feedback: true,
});

const text = (value) => typeof value === 'string' ? value : '';

// Persisted seat value for an intentional blank. Absence still means an uninitialized
// workspace whose owning view may seed a default on first entry.
export const DISMISSED_WORKSPACE = '@empty';
export const workspaceMaySeedDefault = (remembered) => remembered !== DISMISSED_WORKSPACE;

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
      // A canvas card's Workspace (KAN-634), kept with the placement so a restore reads it at once.
      ...(text(value.workspace) ? { workspace: value.workspace } : {}),
    });
  }
  return Object.freeze({
    seats: Object.freeze(seats),
    arrangement: declaration ? migrateWorkbenchState(view.arrangement, declaration) : null,
  });
}
