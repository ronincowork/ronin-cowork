/* part of the ronin-cowork client — see js/README.md */
import { WorkspaceKit } from './workspace-kit.js';
import { createNewTeamFormView } from './new-team-form.js';
import { createNewAgentView } from './new-agent.js';
import { createLaunchHelpView } from './launch-help.js';
import { refreshTeams } from './team-controller.js';
import { t } from './lexicon.js';
import { createFeedbackSurface, FEEDBACK_TYPE, registerFeedbackSurface } from './feedback.js';

const PROFILE = 'launch';
const TYPES = Object.freeze({ team: 'launch.team', agent: 'launch.agent', help: 'launch.help' });
const node = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };

/** Pure entry decision: Customize wins; a generic preload is one-shot behind it. */
export function launchEntryPlan(stored = {}) {
  const customize = stored.customize && typeof stored.customize === 'object' ? stored.customize : null;
  if (customize?.template?.name && ['teams', 'agents'].includes(customize.template.shelf)) {
    return { kind: 'customize', placements: [{
      workspace: 'workspace1', type: customize.template.shelf === 'agents' ? TYPES.agent : TYPES.team,
      detail: { template: customize.template.name, prompt: String(customize.user_message || '') },
    }], clear: ['customize'] };
  }
  const preload = stored.preload && typeof stored.preload === 'object' ? stored.preload : null;
  const seed = preload?.seed && typeof preload.seed === 'object' ? preload.seed : {};
  if (preload?.kind === 'template') return { kind: 'template', placements: [
    { workspace: 'workspace1', type: TYPES.agent, detail: seed },
    { workspace: 'workspace2', type: TYPES.team, detail: seed },
  ], clear: ['preload'] };
  if (preload && ['agent', 'team'].includes(preload.kind)) return {
    kind: preload.kind, placements: [{ workspace: 'workspace1', type: TYPES[preload.kind], detail: seed }], clear: ['preload'],
  };
  return { kind: '', placements: [], clear: preload ? ['preload'] : [] };
}

function registerLaunchSurfaces() {
  registerFeedbackSurface();
  const { library, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!library.has(definition.type)) library.register(definition); };
  add({
    type: TYPES.team,
    header: 'surface',
    label: () => t('launch.new_team', 'New Team'),
    summary: () => t('launch.new_team_summary', 'Define a Team, then launch its Agents.'),
    create: ({ environment, workspace }) => environment.team(workspace),
  });
  add({
    type: TYPES.agent,
    header: 'surface',
    label: () => t('launch.new_agent', 'New Agent'),
    summary: () => t('launch.new_agent_summary', 'Start an Agent in a Team or on its own.'),
    create: ({ environment, workspace }) => environment.agent(workspace),
  });
  // or instructions… I should be able to scroll up and down the form, and the help should
  // scroll up and down." It follows whichever form is on the bench.
  add({
    type: TYPES.help,
    header: 'surface',
    label: () => t('help.title', 'Help'),
    summary: () => t('help.card_summary', 'What each step means, beside the step you are on.'),
    variant: 'dotted',
    create: ({ environment, workspace }) => environment.help(workspace),
  });
  profiles.define(PROFILE, [TYPES.team, TYPES.agent, TYPES.help, FEEDBACK_TYPE]);
}

export function createLaunchView() {
  registerLaunchSurfaces();
  const { createSurface } = WorkspaceKit.primitives;
  let ctx = null;
  let bench = null;
  const teamBySeat = {};
  const agentBySeat = {};
  const helpBySeat = {};
  const started = new WeakSet();

  const seated = (view) => ({
    el: view.el,
    show: (detail) => { if (!started.has(view)) { started.add(view); void view.enter(detail); } },
  });
  const environment = {
    feedback: (workspace) => createFeedbackSurface(() => bench.place(TYPES.team, workspace)),
    team: (workspace) => {
      if (!teamBySeat[workspace]) {
        teamBySeat[workspace] = createNewTeamFormView(WorkspaceKit, {
          created: async () => { await refreshTeams(); bench.refreshSelector(); },
        });
      }
      return seated(teamBySeat[workspace]);
    },
    agent: (workspace) => {
      if (!agentBySeat[workspace]) agentBySeat[workspace] = createNewAgentView(WorkspaceKit, {});
      return seated(agentBySeat[workspace]);
    },
    help: (workspace) => {
      if (!helpBySeat[workspace]) helpBySeat[workspace] = createLaunchHelpView(WorkspaceKit, { bench });
      return helpBySeat[workspace];
    },
  };

  const blank = (id) => {
    const surface = createSurface({ label: id.replace('workspace', 'Workspace '), className: 'lv-blank' });
    surface.content.append(node('p', 'cv-blank-word', t('team.workspace_blank', 'Workspace')));
    return surface.el;
  };
  const save = () => ctx?.patchViewState('launch', bench.snapshot());
  bench = WorkspaceKit.workbench.create({
    profile: PROFILE,
    tenant: { kind: 'launch' },
    environment,
    defaultNode: blank,
    label: t('campaign_home.launch', 'New Project'),
    title: () => t('campaign_home.launch', 'New Project'),
    shapeControl: document.getElementById('shapecycle'),
    onStateChange: save,
    onPlacement: save,
  });

  return {
    el: bench.host,
    glyph: '＋',
    arrangement: bench.arrangement,
    placeFeedback: () => bench.place(FEEDBACK_TYPE, bench.selected()),
    title: () => t('campaign_home.launch', 'New Project'),
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      ctx = context;
      const stored = context.viewState('launch') || {};
      const entry = launchEntryPlan(stored);
      bench.enter(stored);
      await refreshTeams();
      let placed = false;
      for (const [workspace, held] of Object.entries(stored.seats || {})) {
        const type = typeof held === 'object' ? held.type : held;
        if (!Object.values(TYPES).includes(type)) continue;
        bench.place(type, workspace);
        placed = true;
      }
      if (entry.kind === 'customize') {
        const placement = entry.placements[0];
        bench.place(placement.type, placement.workspace, placement.detail);
        bench.select('workspace1');
        context.patchViewState('launch', { customize: null });
        placed = true;
      } else if (entry.kind) {
        if (entry.kind === 'template') bench.setCount(2);
        for (const placement of entry.placements) bench.place(placement.type, placement.workspace, placement.detail);
        bench.select('workspace1');
        context.patchViewState('launch', { preload: null });
        placed = true;
      } else if (entry.clear.includes('preload')) {
        context.patchViewState('launch', { preload: null });
      }
      // Arriving from the root page with nothing remembered: the Agent form, since that
      // is what most arrivals want, and the Team card is one click beside it.
      if (!placed) bench.place(TYPES.agent, 'workspace1');
      // The cards read left-to-right like the page does; drag it back and that sticks.
      if (!stored.arrangement) bench.arrangement.move('selector', 0);
      bench.refreshSelector();
      save();
    },
    leave: () => bench.leave(),
    destroy: () => { for (const help of Object.values(helpBySeat)) help.destroy?.(); bench.leave(); ctx = null; },
  };
}
