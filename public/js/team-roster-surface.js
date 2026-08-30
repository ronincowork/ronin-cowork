/* The detailed Ronin roster, promoted to a Cowork workspace surface. */
import { S } from './state.js';
import { deleteTeamRoster, refreshTeams, subscribe, teamsFromState } from './team-controller.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { buildRoster } from './roster.js';
import { refreshHome } from './home.js';

const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

export function createTeamRosterSurface() {
  const label = t('league.team_roster', 'Team roster');
  const surface = WorkspaceKit.primitives.createSurface({ label, className: 'team-roster-surface' });
  const host = node('div', 'home-sec team-roster-detail');
  surface.content.append(host);
  const openTeam = (name) => {
    const url = new URL(location.href);
    url.hash = `#/team/${encodeURIComponent(name)}`;
    window.open(url.href, '_blank', 'noopener');
  };
  const removeTeam = async (team, count) => {
    if (!window.confirm(t('league.delete_team_confirm', 'Delete {team}? {count} Agents will lose this Team membership.', { team, count }))) return;
    const result = await deleteTeamRoster(team);
    if (!result.ok) surface.setState('failed', result.message);
    else { surface.setState(null, ''); await refreshHome(); roster.render(); }
  };
  const roster = buildRoster({ index: 'team-roster', connect: (name) => S.connectSession?.(name) }, host, {
    hideGroupCounts: true,
    groups: () => teamsFromState().filter((team) => !team.holding).map((team) => team.name),
    groupActions: (team, count) => {
      const launch = node('button', 'torii', '⛩');
      launch.type = 'button';
      launch.title = t('league.launch_team', 'Launch');
      launch.setAttribute('aria-label', launch.title);
      launch.addEventListener('click', () => openTeam(team));
      const remove = node('button', 'kill', '🗑');
      remove.type = 'button';
      remove.title = t('league.delete_team', 'Delete');
      remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', () => void removeTeam(team, count));
      return [launch, remove];
    },
  });
  subscribe(() => roster.render());
  return { el: surface.el, render: () => { void Promise.all([refreshHome(), refreshTeams()]).then(() => roster.render()); roster.render(); } };
}
