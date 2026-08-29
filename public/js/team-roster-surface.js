/* Team roster workspace surface: plain sessions → Team membership drop targets. */
import { S } from './state.js';
import { deleteTeamRoster, membersOfTeam, teamsFromState, updateSessionTeams } from './team-controller.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';

const MIME = 'application/x-ronin-team-roster-session';
const SOURCE_MIME = 'application/x-ronin-team-roster-source';
const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

export function createTeamRosterSurface() {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('league.team_roster', 'Team roster'), className: 'team-roster-surface' });
  const layout = node('div', 'team-roster-layout');
  surface.content.append(layout);
  let message = '';

  const addMembership = async (session, team) => {
    message = t('league.team_roster_saving', 'Adding {session} to {team}…', { session, team }); render();
    const saved = await updateSessionTeams(session, (teams) => [...new Set([...teams, team])].sort());
    if (!saved.ok) { message = saved.message; render(); return; }
    message = ''; render();
  };
  const removeMembership = async (session, team) => {
    if (!team) return;
    message = t('league.team_roster_removing', 'Removing {session} from {team}…', { session, team }); render();
    const saved = await updateSessionTeams(session, (teams) => teams.filter((name) => name !== team));
    if (!saved.ok) { message = saved.message; render(); return; }
    message = ''; render();
  };
  const deleteTeam = async (team, count) => {
    if (!window.confirm(t('league.delete_team_confirm', 'Delete {team}? {count} Agents will lose this Team membership.', { team, count }))) return;
    const result = await deleteTeamRoster(team);
    if (!result.ok) { message = result.message; render(); return; }
    message = ''; render();
  };
  const render = () => {
    layout.replaceChildren();
    for (const team of teamsFromState().filter((item) => !item.holding)) {
      const members = membersOfTeam(team.name);
      const target = node('section', 'team-roster-team');
      const heading = node('header', 'team-roster-heading');
      const remove = node('button', 'team-roster-delete', t('league.delete_team', 'Delete'));
      remove.type = 'button'; remove.addEventListener('click', () => void deleteTeam(team.name, members.length));
      heading.append(node('b', null, team.title || team.name), remove);
      target.append(heading);
      for (const session of members) {
        const row = node('div', 'team-roster-session', session.name); row.draggable = true;
        row.addEventListener('dragstart', (event) => { event.dataTransfer.setData(MIME, session.name); event.dataTransfer.setData(SOURCE_MIME, team.name); event.dataTransfer.effectAllowed = 'copy'; });
        target.append(row);
      }
      if (!members.length) target.append(node('span', 'team-roster-empty', t('league.no_agents', 'No live Agents')));
      target.addEventListener('dragover', (event) => { if (![...event.dataTransfer.types].includes(MIME)) return; event.preventDefault(); target.dataset.dropReady = 'true'; });
      target.addEventListener('dragleave', () => { delete target.dataset.dropReady; });
      target.addEventListener('drop', (event) => { delete target.dataset.dropReady; const session = event.dataTransfer.getData(MIME); if (!session) return; event.preventDefault(); void addMembership(session, team.name); });
      layout.append(target);
    }
    const loose = (S.sessions || []).filter((session) => !(session.tags || []).length);
    const unassigned = node('section', 'team-roster-team');
    const heading = node('header', 'team-roster-heading');
    heading.append(node('b', null, t('league.ronin', 'Ronin: no team')));
    unassigned.append(heading);
    for (const session of loose) {
      const row = node('div', 'team-roster-session', session.name); row.draggable = true;
      row.addEventListener('dragstart', (event) => { event.dataTransfer.setData(MIME, session.name); event.dataTransfer.effectAllowed = 'copy'; });
      unassigned.append(row);
    }
    if (!loose.length) unassigned.append(node('span', 'team-roster-empty', t('league.no_ronin', 'No Rōnin Agents')));
    unassigned.addEventListener('dragover', (event) => { if (![...event.dataTransfer.types].includes(SOURCE_MIME)) return; event.preventDefault(); unassigned.dataset.dropReady = 'true'; });
    unassigned.addEventListener('dragleave', () => { delete unassigned.dataset.dropReady; });
    unassigned.addEventListener('drop', (event) => { delete unassigned.dataset.dropReady; const session = event.dataTransfer.getData(MIME), source = event.dataTransfer.getData(SOURCE_MIME); if (!session || !source) return; event.preventDefault(); void removeMembership(session, source); });
    layout.append(unassigned);
    if (message) layout.append(node('p', 'team-roster-message', message));
  };
  render();
  return { el: surface.el, render };
}
