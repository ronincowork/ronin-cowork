/* The one reachable Gate A hand-off. Eyes consume contracts from this namespace. */
import { WorkspacePrimitives } from './workspace-primitives.js';
import { createTabbedSurface } from './workspace-tabs.js';
import { WorkspaceLayouts } from './workspace-layouts.js';
import { WorkspaceAdapters } from './workspace-adapters.js';
import { DISMISSED_WORKSPACE, normalizeWorkbenchState, workspaceMaySeedDefault } from './workspace-contract.js';
import { WorkbenchLibrary, WorkbenchProfiles, createWorkbench } from './workbench.js';

// The kit's stylesheet rides the same fingerprinted asset path as this module (lead, 2026-10-24):
// a bare 'workspace-kit.css' sat outside the version, so a restart could leave a browser on the old kit.
const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = new URL('../workspace-kit.css', import.meta.url).href;
style.dataset.workspaceKit = '';
if (!document.querySelector('link[data-workspace-kit]')) document.head.append(style);

export const WorkspaceKit = Object.freeze({
  // THE ONE TAB STRIP. Any work surface reaches it here; nothing builds a second one.
  primitives: Object.freeze({ ...WorkspacePrimitives, createTabbedSurface }),
  layouts: WorkspaceLayouts,
  adapters: WorkspaceAdapters,
  workbench: Object.freeze({ library: WorkbenchLibrary, profiles: WorkbenchProfiles, create: createWorkbench }),
  contract: Object.freeze({ DISMISSED_WORKSPACE, normalizeWorkbenchState, workspaceMaySeedDefault }),
});
