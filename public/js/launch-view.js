/* part of the ronin-cowork client — see js/README.md */
/** Launch is a Workbench tenant for the two ways work starts: a Team or an Agent. */
import { WorkspaceKit } from './workspace-kit.js';
import { createNewTeamView } from './new-team.js';
import { buildLauncher } from './launcher.js';
import { loadPresets, loadSavedLaunches } from './home.js';
import { refreshTeams, teamsFromState } from './team-controller.js';
import { t } from './lexicon.js';

const PROFILE = 'launch';
const TYPES = Object.freeze({ team: 'launch.team', agent: 'launch.agent' });
const node = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };

function registerLaunchSurfaces() {
  const { library, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!library.has(definition.type)) library.register(definition); };
  add({ type: TYPES.team, header: 'surface', label: () => t('launch.new_team', 'New Team'), summary: () => t('launch.new_team_summary', 'Define a Team, then launch its Agents.'), create: ({ environment, workspace }) => environment.team(workspace) });
  add({ type: TYPES.agent, header: 'surface', label: () => t('launch.new_agent', 'New Agent'), summary: () => t('launch.new_agent_summary', 'Start an Agent in a Team or on its own.'), create: ({ environment, workspace }) => environment.agent(workspace) });
  profiles.define(PROFILE, [TYPES.team, TYPES.agent]);
}

export function createLaunchView() {
  registerLaunchSurfaces();
  const { createSurface } = WorkspaceKit.primitives;
  let ctx = null;
  let bench = null;
  const environment = {
    team: () => {
      const view = createNewTeamView(WorkspaceKit, { created: async (name) => { await refreshTeams(); ctx?.navigate('team', { param: name }); } });
      const surface = createSurface({ label: t('launch.new_team', 'New Team'), className: 'lv-surface' });
      surface.content.append(view.el);
      return { el: surface.el, show: () => view.enter(ctx) };
    },
    agent: (workspace) => {
      const surface = createSurface({ label: t('launch.new_agent', 'New Agent'), className: 'lv-surface' });
      const host = node('div', 'home-null');
      surface.content.append(host);
      const launcher = buildLauncher({
        index: `launch-${workspace}`,
        connect: () => {},
        teams: () => teamsFromState().filter((team) => !team.holding),
        team: () => '',
      }, host);
      return { el: surface.el, show: () => { launcher.render(); void loadPresets().then(() => launcher.render()); void loadSavedLaunches().then(() => launcher.render()); } };
    },
  };
  const blank = (id) => { const surface = createSurface({ label: id.replace('workspace', 'Workspace '), className: 'lv-blank' }); surface.content.append(node('p', 'cv-blank-word', t('team.workspace_blank', 'Workspace'))); return surface.el; };
  const save = () => ctx?.patchViewState('launch', bench.snapshot());
  bench = WorkspaceKit.workbench.create({ profile: PROFILE, tenant: { kind: 'launch' }, environment, defaultNode: blank, label: t('campaign_home.launch', 'Launch'), title: () => t('campaign_home.launch', 'Launch'), shapeControl: document.getElementById('shapecycle'), onStateChange: save, onPlacement: save });

  return {
    el: bench.host,
    glyph: '＋',
    arrangement: bench.arrangement,
    title: () => t('campaign_home.launch', 'Launch'),
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      ctx = context;
      const stored = context.viewState('launch') || {};
      bench.enter(stored);
      await refreshTeams();
      for (const [workspace, type] of Object.entries(stored.seats || {})) if (Object.values(TYPES).includes(type)) bench.place(type, workspace);
      bench.refreshSelector();
      save();
    },
    leave: () => bench.leave(),
    destroy: () => { bench.leave(); ctx = null; },
  };
}
