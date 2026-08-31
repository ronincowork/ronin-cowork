/* part of the ronin-cowork client — see js/README.md */
/**
 * LAUNCH — ONE workbench that makes either a Team or an Agent (owner, 2026-08-31:
 * "if we can reuse that as the single workbench but have it be for either a new team or
 * a new agent, that's fine by me… It's gonna come from the root page when you click on
 * #Launch. This is exactly what this is meant to do."). Not two workbench kinds: one,
 * with a Team | Agent toggle in the selector header.
 *
 * The drawings were already this — `concepts/new-agent-condensed.html` and
 * `concepts/new-team.html` both title their bar *Launch workbench* — so the two states
 * are one bench, and the toggle is the whole switch between them.
 *
 * WHAT IT MOUNTS: the drawn forms, `js/new-agent.js` and `js/new-team-form.js`. It no
 * longer mounts `buildLauncher` (the ＋ New board) or `createNewTeamView` (the
 * seven-field card): the owner ruled both obsolete and `js/launcher.js` killed. This
 * file was one of their two importers; `js/cowork-view.js` was the other.
 *
 * THE TOGGLE MOVES WHAT IS ON THE BENCH, not just what the selector offers. A workspace
 * holding the form you toggled away from gets the other one — otherwise "toggle" would
 * leave the old form sitting in the workspace, which is not what the word means.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createNewTeamFormView } from './new-team-form.js';
import { createNewAgentView } from './new-agent.js';
import { refreshTeams } from './team-controller.js';
import { t } from './lexicon.js';

const PROFILE = 'launch';
const TYPES = Object.freeze({ team: 'launch.team', agent: 'launch.agent' });
const MODE_OF = Object.freeze({ [TYPES.team]: 'team', [TYPES.agent]: 'agent' });
const TYPE_OF = Object.freeze({ team: TYPES.team, agent: TYPES.agent });
const node = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };

function registerLaunchSurfaces() {
  const { library, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!library.has(definition.type)) library.register(definition); };
  // `visible` is read on every refreshSelector, so the toggle governs the selector by
  // answering from the environment rather than by redefining the profile — a profile is
  // frozen once defined, and the mode is a view's state, not the profile's.
  add({
    type: TYPES.team,
    header: 'surface',
    label: () => t('launch.new_team', 'New Team'),
    summary: () => t('launch.new_team_summary', 'Define a Team, then launch its Agents.'),
    visible: (_tenant, environment) => environment.mode() === 'team',
    create: ({ environment, workspace }) => environment.team(workspace),
  });
  add({
    type: TYPES.agent,
    header: 'surface',
    label: () => t('launch.new_agent', 'New Agent'),
    summary: () => t('launch.new_agent_summary', 'Start an Agent in a Team or on its own.'),
    visible: (_tenant, environment) => environment.mode() === 'agent',
    create: ({ environment, workspace }) => environment.agent(workspace),
  });
  profiles.define(PROFILE, [TYPES.team, TYPES.agent]);
}

export function createLaunchView() {
  registerLaunchSurfaces();
  const { createSurface, createAction } = WorkspaceKit.primitives;
  let ctx = null;
  let bench = null;
  let mode = 'agent';
  const teamBySeat = {};
  const agentBySeat = {};

  const environment = {
    mode: () => mode,
    team: (workspace) => {
      if (!teamBySeat[workspace]) {
        teamBySeat[workspace] = createNewTeamFormView(WorkspaceKit, {
          created: async (name) => { await refreshTeams(); ctx?.navigate('team', { param: name }); },
        });
      }
      const view = teamBySeat[workspace];
      return { el: view.el, show: () => void view.enter() };
    },
    agent: (workspace) => {
      if (!agentBySeat[workspace]) agentBySeat[workspace] = createNewAgentView(WorkspaceKit, {});
      const view = agentBySeat[workspace];
      return { el: view.el, show: (detail) => void view.enter(detail) };
    },
  };

  const modeAction = (key, label) => createAction({
    label,
    kind: 'quiet',
    size: 'compact',
    selected: mode === key,
    action: () => setMode(key),
  });
  const teamButton = modeAction('team', t('launch.mode_team', 'Team'));
  const agentButton = modeAction('agent', t('launch.mode_agent', 'Agent'));
  const paintMode = () => {
    teamButton.el.setAttribute('aria-pressed', String(mode === 'team'));
    agentButton.el.setAttribute('aria-pressed', String(mode === 'agent'));
  };
  function setMode(next) {
    if (next === mode || !TYPE_OF[next]) return;
    const leaving = TYPE_OF[mode];
    mode = next;
    paintMode();
    // Every workspace showing the form we toggled away from shows the other one instead.
    for (const id of bench.locations(leaving)) bench.place(TYPE_OF[mode], id);
    bench.refreshSelector();
    save();
  }

  const blank = (id) => {
    const surface = createSurface({ label: id.replace('workspace', 'Workspace '), className: 'lv-blank' });
    surface.content.append(node('p', 'cv-blank-word', t('team.workspace_blank', 'Workspace')));
    return surface.el;
  };
  const save = () => ctx?.patchViewState('launch', { ...bench.snapshot(), mode });
  bench = WorkspaceKit.workbench.create({
    profile: PROFILE,
    tenant: { kind: 'launch' },
    environment,
    defaultNode: blank,
    label: t('campaign_home.launch', 'Launch'),
    title: () => t('campaign_home.launch', 'Launch'),
    actions: [teamButton, agentButton],
    shapeControl: document.getElementById('shapecycle'),
    onStateChange: save,
    onPlacement: save,
  });

  return {
    el: bench.host,
    glyph: '＋',
    arrangement: bench.arrangement,
    title: () => t('campaign_home.launch', 'Launch'),
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      ctx = context;
      const stored = context.viewState('launch') || {};
      if (stored.mode === 'team' || stored.mode === 'agent') mode = stored.mode;
      paintMode();
      bench.enter(stored);
      await refreshTeams();
      let placed = false;
      for (const [workspace, type] of Object.entries(stored.seats || {})) {
        if (!Object.values(TYPES).includes(type)) continue;
        // A remembered seat decides the mode: the bench comes back as it was left.
        mode = MODE_OF[type];
        bench.place(type, workspace);
        placed = true;
      }
      // ARRIVING FROM THE ROOT PAGE IS THE WHOLE POINT OF THIS ROUTE, so an empty bench
      // opens on the active form rather than on a blank workspace and a card to find.
      if (!placed) bench.place(TYPE_OF[mode], 'workspace1');
      paintMode();
      bench.refreshSelector();
      save();
    },
    leave: () => bench.leave(),
    destroy: () => { bench.leave(); ctx = null; },
  };
}
