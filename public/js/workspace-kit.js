/* The one reachable Gate A hand-off. Eyes consume contracts from this namespace. */
import { WorkspacePrimitives } from './workspace-primitives.js';
import { WorkspaceLayouts } from './workspace-layouts.js';
import { WorkspaceAdapters } from './workspace-adapters.js';

export const WorkspaceKit = Object.freeze({
  primitives: WorkspacePrimitives,
  layouts: WorkspaceLayouts,
  adapters: WorkspaceAdapters,
});
