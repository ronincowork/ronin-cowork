/* The Cowork workbench's one reading of every Team: a Phalanx stone per Team. */
import { membersOfTeam, subscribe, teamsFromState, UNASSIGNED } from './team-controller.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { createPhalanx } from './phalanx.js';
import { orderCoworkTeams } from './cowork-workbench-contract.js';
import { RONIN_HELPERS } from './roster-groups.js';
import { agentTitle } from './team-members.js';
import { SURFACE_DRAG } from './workbench.js';
import { WORKBENCH_TYPES } from './workbench-catalog.js';

/** A stone carries what the Team card carried: name, objective, Agent count and lead.
 * Its detail is the Team profile the card opened (`teamDetail`, the cowork view's one
 * renderer); dragged, the stone places that profile in another workspace. */
export function createTeamRosterSurface({ teamDetail } = {}) {
  const label = t('campaign.coworks', 'Teams');
  const surface = WorkspaceKit.primitives.createSurface({ label, className: 'team-roster-surface' });
  const items = () => orderCoworkTeams(teamsFromState(), {
    helperName: RONIN_HELPERS,
    noTeam: { name: UNASSIGNED, title: t('league.ronin', 'Ronin: no team'), objective: '' },
  }).map((team) => {
    const members = membersOfTeam(team.name);
    const lead = members.find((member) => member.team_lead);
    const name = String(team.title ?? '').trim() || team.name;
    const count = t('league.agent_count', '{count} Agents', { count: members.length });
    return {
      id: team.name, label: name, secondary: team.objective || '',
      state: lead ? `${count} · 人 ${agentTitle(lead)}` : count,
      draggable: true,
      events: { dragstart: (event) => {
        event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify({ type: WORKBENCH_TYPES.team, detail: { key: team.name } }));
        event.dataTransfer.setData('text/plain', name);
        event.dataTransfer.effectAllowed = 'copy';
      } },
    };
  });
  const renderDetail = (item, host) => {
    const view = teamDetail?.(item.id);
    if (view) host.append(view.el);
  };
  const stones = createPhalanx({ className: 'team-roster-phalanx', items: [], renderDetail });
  stones.mount(surface.content);
  // A push that moves nothing a stone shows leaves the grid and an open detail alone, so
  // an edit in progress in the Team's configuration keeps its focus.
  let shown = null;
  const paint = () => {
    const next = items();
    const signature = JSON.stringify(next.map(({ id, label: name, secondary, state }) => [id, name, secondary, state]));
    if (signature !== shown) { shown = signature; stones.setItems(next); }
  };
  const stop = subscribe(paint);
  return {
    el: surface.el,
    render: paint,
    destroy: () => { stop?.(); stones.destroy(); },
  };
}
