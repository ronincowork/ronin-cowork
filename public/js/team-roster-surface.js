/* Team roster workspace surface: plain sessions → Team membership drop targets. */
import { request } from './request.js';
import { S } from './state.js';
import { membersOfTeam, refreshTeams, teamsFromState } from './team-controller.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';

const MIME = 'application/x-ronin-team-roster-session';
const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

export function createTeamRosterSurface() {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('league.team_roster', 'Team roster'), className: 'team-roster-surface' });
  const layout = node('div', 'team-roster-layout'), sessions = node('section', 'team-roster-column'), teams = node('section', 'team-roster-column');
  layout.append(sessions, teams); surface.content.append(layout);
  let message = '';

  const addMembership = async (session, team) => {
    message = t('league.team_roster_saving', 'Adding {session} to {team}…', { session, team }); render();
    const current = await request(`/api/sessions/${encodeURIComponent(session)}/tags`);
    if (!current.ok) { message = current.message; render(); return; }
    const tags = [...new Set([...(current.data.tags || []), team])].sort();
    const saved = await request(`/api/sessions/${encodeURIComponent(session)}/tags`, { method: 'POST', json: { tags } });
    if (!saved.ok) { message = saved.message; render(); return; }
    const live = (S.sessions || []).find((item) => item.name === session);
    if (live) live.tags = saved.data.tags || tags;
    await refreshTeams(); message = ''; render();
  };
  const render = () => {
    sessions.replaceChildren(node('h2', null, t('stats.sessions', 'Sessions')));
    for (const session of S.sessions || []) {
      const card = node('article', 'team-roster-session'); card.draggable = true;
      card.append(node('b', null, session.name), node('small', null, session.session_role || ''));
      card.addEventListener('dragstart', (event) => { event.dataTransfer.setData(MIME, session.name); event.dataTransfer.effectAllowed = 'copy'; });
      sessions.append(card);
    }
    teams.replaceChildren(node('h2', null, t('stats.teams', 'Teams')));
    for (const team of teamsFromState().filter((item) => !item.holding)) {
      const target = node('article', 'team-roster-team');
      target.append(node('b', null, team.name), node('small', null, membersOfTeam(team.name).map((member) => member.name).join(', ') || t('team.no_live', 'No live sessions')));
      target.addEventListener('dragover', (event) => { if (![...event.dataTransfer.types].includes(MIME)) return; event.preventDefault(); target.dataset.dropReady = 'true'; });
      target.addEventListener('dragleave', () => { delete target.dataset.dropReady; });
      target.addEventListener('drop', (event) => { delete target.dataset.dropReady; const session = event.dataTransfer.getData(MIME); if (!session) return; event.preventDefault(); void addMembership(session, team.name); });
      teams.append(target);
    }
    if (message) teams.append(node('p', 'team-roster-message', message));
  };
  render();
  return { el: surface.el, render };
}
