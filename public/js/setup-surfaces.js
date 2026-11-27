/* Selector-driven workspace-2 surfaces for the Ronin Setup workbench: Harness, Workspace, Team and
 * the Tour (docs/architecture/setup-workbench.md). There is no Register, Password, Launch your own or
 * Services surface (owner, 25–26 Nov). */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { createWorkspacesRead } from './workspaces-read.js';
import { createWorkspaceKickoff } from './setup-workspace-kickoff.js';
import { harnessSurfaceDefinition } from './setup-harness-surface.js';
import { createEmbeddedNewTeamFormView } from './new-team-form.js';
import { createTourSurface } from './setup-tour.js';

export const SETUP_SURFACE_TYPES = Object.freeze({ roots: 'setup.roots', team: 'setup.team' });

const surface = (label, className = '') => WorkspaceKit.primitives.createSurface({ label, className: `setup-surface ${className}`.trim() });

// Setup's Workspace step is the Workspaces themselves (KAN-728): each a stone opening its record, and
// New Workspace, so every folder Setup adds is a row of a Workspace. The kickoff
// questions sit over them (KAN-809).
function createRootsSurface(context) {
  const workspacesRead = createWorkspacesRead();
  // The step's own surface (owner, 25 Nov; KAN-809): the four doors, not the Workspaces page.
  const out = surface(t('setup_surface.roots', 'Workspace'), 'setup-workspace-surface');
  const step = createWorkspaceKickoff({ workspacesRead, environment: context.environment, intro: true });
  out.content.append(step.el);
  // A step card is its disc, its name and one line: no count (docs/architecture/setup-workbench.md).
  return { el: out.el, show: () => { void workspacesRead.read(); }, destroy: () => step.destroy() };
}

// STEP 3, TEAM (w926; docs/architecture/setup-workbench.md): the ordinary New Team form, started in a Workspace;
// the lead builds out the rest. Ticked when a Team has a live lead (teams_agents).
function createTeamSurface() {
  const out = surface(t('setup_surface.team', 'Start a Team'));
  const view = createEmbeddedNewTeamFormView(WorkspaceKit, {});
  out.content.append(view.el);
  void view.enter({});
  return { el: out.el, destroy: () => { view.destroy?.(); } };
}

export function setupSurfaceDefinitions() {
  const definition = (type, label, create, groupKey = '') => ({
    type, header: 'surface', label: () => label, create: (context) => create(context),
    ...(groupKey ? { groupKey } : {}),
  });
  return [
    harnessSurfaceDefinition(),
    definition(SETUP_SURFACE_TYPES.roots, t('setup_surface.roots', 'Workspace'), createRootsSurface),
    definition(SETUP_SURFACE_TYPES.team, t('setup_surface.team', 'Team'), createTeamSurface),
    definition('setup.tour', t('setup_surface.tour', 'Tour'), createTourSurface),
  ];
}

export function registerSetupSurfaces() {
  const surfaces = WorkspaceKit.workbench.surfaces;
  for (const definition of setupSurfaceDefinitions()) if (!surfaces.has(definition.type)) surfaces.register(definition);
  return SETUP_SURFACE_TYPES;
}
