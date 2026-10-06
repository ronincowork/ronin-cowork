/* part of the ronin-cowork client — see js/README.md */
/**
 * TEAM — the thin tenant on the tenant frame (js/tenant-frame.js), at `team-next` while the
 * old Team (cowork-view.js) stands; it takes the `team` word when it replaces it. The route
 * names the Team. Cards, as today's Team workbench has them: the Agents' tiles with the lead
 * kept hot, the Commons, Team Chart, the Trello view, the Team profile, New Agent, and the
 * composition reader the roster opens. Not yet here: Mika's help, the arranger (`edges
 * page`), Work Items and Task Manager (they retire into the board). Each change of row in
 * UI_STRUCTURE.md is its own hand-in from here.
 */
import { createTenantFrame } from './tenant-frame.js';
import { createTeamCommonsSurface, readingsOf } from './team-commons-surface.js';
import { createTeamChartSurface } from './team-chart-surface.js';
import { createWorkViewsSurface } from './work-views-surface.js';
import { createTeamProfile } from './team-profile.js';
import { itemOverlay } from './work-details.js';
import { createNewAgentView } from './new-agent.js';
import { createAgentCompositionSurface } from './agent-composition.js';
import { membersOfTeam, teamByName, teamsFromState } from './team-controller.js';
import { agentTitle } from './team-members.js';
import { store } from './store.js';
import { retireSession } from './session-retire.js';
import { S } from './state.js';
import { t } from './lexicon.js';
import { WorkspaceKit } from './workspace-kit.js';
import { openWorkbenchTab, openWorkspaceTab, reserveWorkspaceTab, workbenchLaunchUrl } from './workspace.js';
import { BEHAVIOUR_SURFACE_TYPE } from './behaviour-surface.js';
import { RONIN_HELPERS } from './roster-groups.js';
import { WORKBENCH_PROFILES, WORKBENCH_TYPES as WB } from './workbench-catalog.js';
import { DISMISSED_WORKSPACE } from './workspace-contract.js';

function readableTeam(name) {
  return String(teamByName(name)?.title ?? '').trim() || name;
}
function leadOf(name) {
  return membersOfTeam(name).find((member) => member.team_lead)?.name || '';
}
// The Team a work item's holder works in: the holding Team, or the Team of the holding Agent.
function holderTeam(holder) {
  if (holder.startsWith('team:')) return holder.slice(5);
  if (!holder.startsWith('agent:')) return '';
  const agent = holder.slice(6);
  return teamsFromState().find((row) => membersOfTeam(row.name).some((member) => member.name === agent))?.name || '';
}
// Reserve the tab while the click is still the user's gesture; else the ViewHost transition.
function openAgentWorkbench(name, context) {
  const tab = reserveWorkspaceTab();
  if (tab) return openWorkspaceTab('agent', name, tab);
  return context?.navigate?.('agent', { param: name }) ?? false;
}
function openTeam(name) {
  return openWorkspaceTab('team-next', name);
}
const teamDefaultsRequest = (name) => ({ destination: 'team-next', param: name, mode: 'replace', state: {
  count: 2, selected: 'workspace1',
  seats: { workspace1: { type: WB.commons, tab: 'team-configuration' }, workspace2: DISMISSED_WORKSPACE },
} });
const deskDefaultsRequest = () => ({ destination: 'campaign', mode: 'replace', state: {
  count: 2, selected: 'workspace1', seats: { workspace1: 'campaign.defaults', workspace2: 'setup.launch-own' },
} });

export function createTeamView() {
  const { createSurface } = WorkspaceKit.primitives;
  let rows = new Map(); // name -> the store's home row, for the cards' readings
  let hearRows = null;
  const commonsBySeat = {};
  const newAgentBySeat = {};
  const profiles = new Map();
  return createTenantFrame({
    key: 'team-next',
    profile: WORKBENCH_PROFILES.teamNext,
    glyph: '人',
    label: () => t('team.roster_title', 'Roster'),
    name: (team) => readableTeam(team) || t('team.team', 'Team'),
    homeCard: WB.commons,
    // Nothing is seated by name: the lead is pinned, and the frame seats it on a first visit.
    firstOpen: () => ({}),
    sessions: (team) => membersOfTeam(team).map((member) => member.name),
    pinned: (team) => membersOfTeam(team).filter((member) => member.team_lead).map((member) => member.name),
    selectorFilter: (type) => type !== BEHAVIOUR_SURFACE_TYPE,
    cards: (frame) => {
      const team = () => frame.param();
      const openAgent = (name) => openAgentWorkbench(name, frame.context());
      const newAgentAt = (seat, detail) => frame.place(WB.newAgent, seat, detail);
      return {
        sessions: () => membersOfTeam(team()).map((member) => {
          const reading = readingsOf(rows.get(member.name));
          const mika = team() === RONIN_HELPERS && member.name === 'mika_agent';
          return { key: member.name, label: mika ? t('mika.name', 'Mika') : agentTitle(member), className: 'team-agent-card',
            mark: member.team_lead ? '人' : null, summary: reading.step, metadata: reading.lines };
        }),
        agent: () => '',
        teamCommons: (seat) => {
          commonsBySeat[seat] ||= createTeamCommonsSurface({
            team, context: frame.context, idPrefix: seat,
            onSelect: (member) => frame.place(WB.agentComposition, frame.opposite(seat), { key: member.name }),
            onOpen: (member) => openAgent(member.name),
            onAddLead: () => newAgentAt(frame.opposite(seat), { prompt: t('league.add_lead_prompt', 'Join this Team as its team lead.'), teamLead: true }),
            onClose: (member) => retireSession(member.name, `commons-${seat}-${member.name}`),
            onSaved: () => S.refreshWorkspaceHeader?.(),
          });
          return commonsBySeat[seat];
        },
        chartTeams: () => (team() ? [{ key: team(), label: t('team_chart.title', 'Team Chart') }] : []),
        teamChart: (seat, detail = {}) => createTeamChartSurface({
          team: () => detail.key || team(),
          onOpen: (member) => openAgent(member.name),
          onAddLead: (name) => newAgentAt(frame.opposite(seat), { team: name, teamLead: true }),
        }),
        workViews: () => createWorkViewsSurface({ holderTeam, openTeam, team: team(), leadOf }),
        composition: (detail = {}) => createAgentCompositionSurface(detail.key),
        // ONE TEAM PROFILE (js/team-profile.js) in a whole workspace; an item line opens its overlay over it.
        team: (seat, detail = {}) => {
          const name = detail.key || team();
          const cacheKey = `${seat}\0${name}`;
          if (!profiles.has(cacheKey)) {
            let surface = null;
            const profile = createTeamProfile(name, {
              openTeam, openAgent,
              onNewAgent: (chosen, lead) => newAgentAt(frame.opposite(seat), { team: chosen, ...(lead ? { teamLead: true } : {}) }),
              openItem: (item) => { const at = surface.content; at.querySelector(':scope > .work-overlay')?.remove(); itemOverlay(at, item, {}); },
              onDeleted: () => { profiles.get(cacheKey)?.destroy(); profiles.delete(cacheKey); frame.emptySeat(seat); },
              say: (state, message) => surface?.setState(state, message),
            });
            surface = createSurface({ label: readableTeam(name), className: 'league-team-edit', actions: profile.controls });
            surface.content.append(profile.objective, profile.main);
            profiles.set(cacheKey, { el: surface.el, show: profile.render, destroy: profile.destroy });
          }
          return profiles.get(cacheKey);
        },
        newAgent: (seat, consumed) => {
          if (!newAgentBySeat[seat]) {
            const view = createNewAgentView(WorkspaceKit, {
              consumed,
              team,
              teamDefaultsUrl: (name) => workbenchLaunchUrl(teamDefaultsRequest(name)),
              deskDefaultsUrl: () => workbenchLaunchUrl(deskDefaultsRequest()),
              openTeamDefaults: (name) => {
                if (!name) return;
                if (name === team()) frame.place(WB.commons, frame.opposite(seat), { tab: 'team-configuration' });
                else openWorkbenchTab(teamDefaultsRequest(name));
              },
              openDeskDefaults: () => openWorkbenchTab(deskDefaultsRequest()),
              openBehaviours: () => frame.place(BEHAVIOUR_SURFACE_TYPE, frame.opposite(seat)),
              // A Team launch hands its workspace to the newborn.
              connect: (name) => frame.connectSession(name, seat),
            });
            newAgentBySeat[seat] = { el: view.el, enter: (detail) => view.enter(detail), destroy: () => view.destroy() };
          }
          return { el: newAgentBySeat[seat].el, show: (detail) => void newAgentBySeat[seat].enter(detail) };
        },
      };
    },
    enter: (frame) => {
      hearRows?.();
      hearRows = store.subscribe('home', (list) => { rows = new Map((list || []).map((row) => [row.name, row])); frame.refreshSelector(); });
      // The ＋ New door (the bar, ⌃⇧N) opens the drawn New Agent; a prompt rides as its Instructions.
      S.showNewSession = (prompt = '') => { frame.place(WB.newAgent, frame.selected(), prompt ? { prompt } : {}); };
    },
    leave: () => {
      hearRows?.();
      hearRows = null;
      S.showNewSession = null;
      for (const commons of Object.values(commonsBySeat)) commons.leave();
    },
    destroy: () => {
      for (const commons of Object.values(commonsBySeat)) commons.destroy();
      for (const view of Object.values(newAgentBySeat)) view.destroy();
      for (const profile of profiles.values()) profile.destroy?.();
    },
  });
}
