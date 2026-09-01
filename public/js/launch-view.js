/* part of the ronin-cowork client — see js/README.md */
/**
 * LAUNCH — one workbench, two cards, and you decide what goes where.
 *
 * Reached from the root page, and that is who it is for (owner, 2026-08-31: "this is
 * really only accessed from the root page, so this is sort of for the first-time
 * experience. People can kind of play with it, see what they can do."). The fast path
 * lives where the fast loaders already are — the Coworks bench and Add Agent.
 *
 * THE SHAPE, ruled 2026-09-01 after two versions that were not it: "we're going to put
 * the team and the agent cards in the selector, and you're going to be able to put either
 * workspace one or workspace two, this team page or this agent page… We're dropping this
 * little button that you have in the selector header, and we're dropping the 1, 2, 3, 4,
 * 5, 6 cards in the middle. Drop that and just allow us so that we can have the new team
 * and new agent on the same page."
 *
 * So: no mode toggle, no step outline, no separate output surface. Two cards. Either form
 * in either workspace, both at once if you want them — which is the thing the toggle and
 * the outline were both in the way of. Each form carries its own reading under it again,
 * and its launch button rides its tile header (`createSurface({ actions })`), asleep until
 * a name is typed.
 *
 * ONE FORM PER CARD PER WORKSPACE. The Workbench keys an instance by workspace, so putting
 * New Agent in both seats gives two independent drafts — two Agents being written side by
 * side is a use, not a bug.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createNewTeamFormView } from './new-team-form.js';
import { createNewAgentView } from './new-agent.js';
import { refreshTeams } from './team-controller.js';
import { t } from './lexicon.js';

const PROFILE = 'launch';
const TYPES = Object.freeze({ team: 'launch.team', agent: 'launch.agent' });
const node = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };

function registerLaunchSurfaces() {
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
  profiles.define(PROFILE, [TYPES.team, TYPES.agent]);
}

export function createLaunchView() {
  registerLaunchSurfaces();
  const { createSurface } = WorkspaceKit.primitives;
  let ctx = null;
  let bench = null;
  const teamBySeat = {};
  const agentBySeat = {};
  const started = new WeakSet();

  const seated = (view) => ({
    el: view.el,
    show: () => { if (!started.has(view)) { started.add(view); void view.enter(); } },
  });
  const environment = {
    team: (workspace) => {
      if (!teamBySeat[workspace]) {
        teamBySeat[workspace] = createNewTeamFormView(WorkspaceKit, {
          created: async (name) => { await refreshTeams(); ctx?.navigate('team', { param: name }); },
        });
      }
      return seated(teamBySeat[workspace]);
    },
    agent: (workspace) => {
      if (!agentBySeat[workspace]) agentBySeat[workspace] = createNewAgentView(WorkspaceKit, {});
      return seated(agentBySeat[workspace]);
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
    label: t('campaign_home.launch', 'Launch'),
    title: () => t('campaign_home.launch', 'Launch'),
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
      bench.enter(stored);
      await refreshTeams();
      let placed = false;
      for (const [workspace, held] of Object.entries(stored.seats || {})) {
        const type = typeof held === 'object' ? held.type : held;
        if (!Object.values(TYPES).includes(type)) continue;
        bench.place(type, workspace);
        placed = true;
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
    destroy: () => { bench.leave(); ctx = null; },
  };
}
