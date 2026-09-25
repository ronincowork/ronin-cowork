/* Team Chart — the Team's organizational reading as a standalone Phalanx surface. */
import { WorkspaceKit } from './workspace-kit.js';
import { createPhalanx } from './phalanx.js';
import { ask } from './ask.js';
import { agentTitle } from './team-members.js';
import { membersOfTeam, refreshTeams, setTeamLead, subscribe } from './team-controller.js';
import { t } from './lexicon.js';
import { createAgentCompositionReader } from './agent-composition.js';

export const TEAM_CHART_TYPE = 'team.chart';
const el = (tag, cls = '', text = '') => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = String(text); return node; };

export function createTeamChartSurface({ team, onOpen, onAddLead } = {}) {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('team_chart.title', 'Team Chart'), className: 'team-chart-surface' });
  let picker = null;
  let entered = false;
  const teamName = () => String(typeof team === 'function' ? team() : team || '');
  const rows = () => membersOfTeam(teamName());
  const items = () => {
    const members = rows();
    const leads = members.filter((member) => member.team_lead);
    const others = members.filter((member) => !member.team_lead);
    return [
      ...(leads.length ? leads.map((member) => ({ id: member.name, label: agentTitle(member), group: t('league.team_lead', 'Team Lead'), secondary: `@${member.name}`, state: t('league.team_lead', 'Team Lead'), member }))
        : [{ id: '@lead', label: t('league.no_lead_title', 'Team lead not assigned'), group: t('league.team_lead', 'Team Lead'), state: t('league.assign_lead', 'Assign lead'), emptyLead: true }]),
      ...others.map((member) => ({ id: member.name, label: agentTitle(member), group: t('league.agents', 'Agents'), secondary: `@${member.name}`, member })),
    ];
  };
  const changed = async () => { await refreshTeams(); phalanx.setItems(items()); phalanx.refreshDetail(); };
  const renderDetail = (item, host) => {
    picker?.destroy(); picker = null;
    if (item.emptyLead) {
      host.append(el('h2', '', t('league.no_lead_title', 'Team lead not assigned')), el('p', 'tc-note', t('league.no_lead_help', 'Assign an Agent already on this Team, or add a new Agent for the role.')));
      const candidates = rows().filter((member) => !member.team_lead);
      let selected = '';
      const assign = WorkspaceKit.primitives.createAction({ label: t('league.assign_lead', 'Assign lead'), disabled: true });
      picker = ask([{ fields: [{ key: 'lead', label: t('league.choose_lead', 'Choose an Agent as team lead'), blank: candidates.length ? t('league.choose_lead', 'Choose an Agent as team lead') : t('league.no_lead_candidates', 'No current Agents to assign'), options: candidates.map((member) => ({ v: member.name, l: agentTitle(member) })) }] }], { density: 'tight', onChange: (value) => { selected = value.lead; assign.setDisabled(!selected); } });
      assign.el.addEventListener('click', async () => { const result = await setTeamLead(selected, teamName(), true); if (!result.ok) return surface.setState('failed', result.message); await changed(); });
      const add = WorkspaceKit.primitives.createAction({ label: t('league.add_lead_agent', 'Add new Agent'), action: () => onAddLead?.(teamName()) });
      const actions = el('div', 'tc-actions'); actions.append(picker.el, assign.el, add.el); host.append(actions);
      return () => { picker?.destroy(); picker = null; };
    }
    const member = item.member;
    const reader = createAgentCompositionReader(member.name, { setState: (state, message) => surface.setState(state, message) });
    const launch = WorkspaceKit.primitives.createAction({ label: t('league.launch_agent', 'Launch'), launch: true, action: () => onOpen?.(member) });
    const actions = el('div', 'tc-actions'); actions.append(launch.el);
    host.append(reader.el, actions);
    void reader.show();
    return () => reader.destroy();
  };
  const phalanx = createPhalanx({ className: 'team-chart-phalanx', items: [], renderDetail });
  phalanx.mount(surface.content);
  const stop = subscribe(() => { if (entered) phalanx.setItems(items()); });
  return {
    el: surface.el,
    show: async () => { entered = true; await refreshTeams(); phalanx.setItems(items()); },
    leave: () => { entered = false; },
    destroy: () => { entered = false; picker?.destroy(); stop?.(); phalanx.destroy(); },
  };
}
