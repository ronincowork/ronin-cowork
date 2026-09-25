/* The detailed Ronin roster, promoted to a Cowork workspace surface. */
import { deleteTeamRoster, refreshTeams, subscribe, teamsFromState } from './team-controller.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { buildRoster } from './roster.js';
import { buildTeamMembers } from './team-members.js';
import { refreshHome } from './home.js';
import { openWorkspaceTab } from './workspace.js';

const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

export function createTeamRosterSurface(options = {}) {
  const label = t('league.team_roster', 'Team roster');
  const surface = WorkspaceKit.primitives.createSurface({ label, className: 'team-roster-surface' });
  const host = node('div', 'home-sec team-roster-detail');
  surface.content.append(host);
  const tools = node('div', 'league-team-people-tools');
  const toggle = node('div', 'league-team-view-toggle');
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', t('league.people_reading', 'People reading'));
  const rosterButton = WorkspaceKit.primitives.createAction({ label: t('league.roster_reading', 'Roster'), size: 'compact' });
  const orgButton = WorkspaceKit.primitives.createAction({ label: t('league.org_reading', 'Org chart'), size: 'compact' });
  toggle.append(rosterButton.el, orgButton.el); tools.append(toggle); host.append(tools);
  const rosterHost = node('div', 'team-roster-reading');
  const orgHost = node('div', 'team-org-reading');
  host.append(rosterHost, orgHost);
  let reading = 'roster';
  const openTeam = (name) => openWorkspaceTab('team', name);
  const teamLabel = (name) => {
    const title = teamsFromState().find((team) => team.name === name)?.title;
    return String(title ?? '').trim() || name;
  };
  const removeTeam = async (team, count) => {
    if (!window.confirm(t('league.delete_team_confirm', 'Delete {team}? {count} Agents will lose this Team membership.', { team: teamLabel(team), count }))) return;
    const result = await deleteTeamRoster(team);
    if (!result.ok) surface.setState('failed', result.message);
    else { surface.setState(null, ''); await refreshHome(); roster.render(); }
  };
  const roster = buildRoster({ index: 'team-roster', connect: (name) => options.onOpen?.(name) }, rosterHost, {
    hideGroupCounts: true,
    groups: () => teamsFromState().filter((team) => !team.holding).map((team) => team.name),
    groupLabel: teamLabel,
    groupActions: (team, count) => {
      const launch = WorkspaceKit.primitives.createAction({
        label: t('league.launch_team', 'Launch'), launch: true, size: 'compact', action: () => openTeam(team),
      }).el;
      const remove = node('button', 'kill', '🗑');
      remove.type = 'button';
      remove.title = t('league.delete_team', 'Delete');
      remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', () => void removeTeam(team, count));
      return [launch, remove];
    },
  });
  const paintReading = () => {
    rosterHost.hidden = reading !== 'roster';
    orgHost.hidden = reading !== 'org';
    rosterButton.el.setAttribute('aria-pressed', String(reading === 'roster'));
    orgButton.el.setAttribute('aria-pressed', String(reading === 'org'));
    if (reading !== 'org') return;
    orgHost.replaceChildren(...teamsFromState().filter((team) => !team.holding).map((team) => {
      const section = node('section', 'team-roster-org-team');
      const head = node('div', 'home-grp');
      head.append(node('b', null, teamLabel(team.name)));
      const launch = WorkspaceKit.primitives.createAction({ label: t('league.launch_team', 'Launch'), launch: true, size: 'compact', action: () => openTeam(team.name) });
      head.append(launch.el);
      section.append(head, buildTeamMembers(team.name, {
        onSelect: options.onSelect,
        onOpen: options.onOpen,
        onChanged: () => { void refreshTeams().then(() => paintReading()); },
        onFailed: (message) => surface.setState('failed', message),
        onAddLead: () => options.onAddLead?.(team.name),
      }));
      return section;
    }));
  };
  rosterButton.el.addEventListener('click', () => { reading = 'roster'; paintReading(); });
  orgButton.el.addEventListener('click', () => { reading = 'org'; paintReading(); });
  paintReading();
  subscribe(() => roster.render());
  return {
    el: surface.el,
    render: () => {
      surface.setState('loading', t('league.roster_loading', 'Loading Team roster…'));
      void Promise.all([refreshHome(), refreshTeams()]).then(() => {
        surface.setState(null, '');
        roster.render();
        paintReading();
      });
    },
  };
}
