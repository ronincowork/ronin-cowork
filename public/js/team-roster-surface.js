/* The detailed Ronin roster, promoted to a Cowork workspace surface. */
import { deleteTeamRoster, membersOfTeam, refreshTeams, subscribe, teamsFromState } from './team-controller.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { createPhalanx } from './phalanx.js';
import { openWorkspaceTab } from './workspace.js';

const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

export function createTeamRosterSurface() {
  const label = t('campaign.coworks', 'Teams');
  const surface = WorkspaceKit.primitives.createSurface({ label, className: 'team-roster-surface' });
  const openTeam = (name) => openWorkspaceTab('team', name);
  const teamLabel = (name) => {
    const title = teamsFromState().find((team) => team.name === name)?.title;
    return String(title ?? '').trim() || name;
  };
  const removeTeam = async (team, count) => {
    if (!window.confirm(t('league.delete_team_confirm', 'Delete {team}? {count} Agents will lose this Team membership.', { team: teamLabel(team), count }))) return;
    const result = await deleteTeamRoster(team);
    if (!result.ok) surface.setState('failed', result.message);
    else { surface.setState(null, ''); await refreshTeams(); stones.setItems(items()); }
  };
  const items = () => teamsFromState().filter((team) => !team.holding).map((team) => {
    const count = membersOfTeam(team.name).length;
    return { id: team.name, label: String(team.title ?? '').trim() || team.name,
      secondary: team.objective || team.name, state: t('league.agent_count', '{count} Agents', { count }), team, count };
  });
  const renderDetail = (item, host) => {
    host.append(node('h2', '', item.label), node('p', 'tc-id', item.team.name), node('p', 'tc-note', item.team.objective || t('league.no_objective', 'No Team objective.')));
    const launch = WorkspaceKit.primitives.createAction({ label: t('league.launch_team', 'Launch'), launch: true, action: () => openTeam(item.team.name) });
    const remove = WorkspaceKit.primitives.createAction({ label: t('league.delete_team', 'Delete'), action: () => void removeTeam(item.team.name, item.count) });
    const actions = node('div', 'tc-actions'); actions.append(launch.el, remove.el); host.append(actions);
  };
  const stones = createPhalanx({ className: 'team-roster-phalanx', items: [], renderDetail });
  stones.mount(surface.content);
  const stop = subscribe(() => stones.setItems(items()));
  return {
    el: surface.el,
    render: () => {
      surface.setState('loading', t('league.roster_loading', 'Loading Teams…'));
      void refreshTeams().then(() => {
        surface.setState(null, '');
        stones.setItems(items());
      });
    },
    destroy: () => { stop?.(); stones.destroy(); },
  };
}
