/* The one reachable Gate A hand-off. Eyes consume contracts from this namespace. */
import { WorkspacePrimitives } from './workspace-primitives.js';
import { WorkspaceLayouts } from './workspace-layouts.js';
import { WorkspaceAdapters } from './workspace-adapters.js';
import { DISMISSED_WORKSPACE, WORKSPACE_DESTINATIONS, navigateWorkspace, normalizeWorkbenchState, workspaceMaySeedDefault, workspaceTarget } from './workspace-contract.js';
import { WorkbenchLibrary, WorkbenchProfiles, createWorkbench } from './workbench.js';

const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = 'workspace-kit.css';
style.dataset.workspaceKit = '';
if (!document.querySelector('link[data-workspace-kit]')) document.head.append(style);

export const WorkspaceKit = Object.freeze({
  primitives: WorkspacePrimitives,
  layouts: WorkspaceLayouts,
  adapters: WorkspaceAdapters,
  workbench: Object.freeze({ library: WorkbenchLibrary, profiles: WorkbenchProfiles, create: createWorkbench }),
  contract: Object.freeze({ DISMISSED_WORKSPACE, destinations: WORKSPACE_DESTINATIONS, navigateWorkspace, normalizeWorkbenchState, workspaceMaySeedDefault, workspaceTarget }),
});
