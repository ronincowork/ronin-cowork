/* The one reachable Gate A hand-off. Eyes consume contracts from this namespace. */
import { WorkspacePrimitives } from './workspace-primitives.js';
import { WorkspaceLayouts } from './workspace-layouts.js';
import { WorkspaceAdapters } from './workspace-adapters.js';
import { WORKSPACE_DESTINATIONS, navigateWorkspace, teamWorkspaceState, workspaceTarget } from './workspace-contract.js';

const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = 'workspace-kit.css';
style.dataset.workspaceKit = '';
if (!document.querySelector('link[data-workspace-kit]')) document.head.append(style);

export const WorkspaceKit = Object.freeze({
  primitives: WorkspacePrimitives,
  layouts: WorkspaceLayouts,
  adapters: WorkspaceAdapters,
  contract: Object.freeze({ destinations: WORKSPACE_DESTINATIONS, navigateWorkspace, teamWorkspaceState, workspaceTarget }),
});
