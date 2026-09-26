/* The one browser-side Team projection.
 *
 * The rosters are the store's pushed `teams` (js/store.js); the members are `S.sessions`,
 * which the store's pushed `sessions` keeps current. The store delivers each only when it
 * changed, so a listener hears the projection once per change and a Team surface never
 * rebuilds from the same answer twice. A write here changes the server; the change comes
 * back by push, and nothing is re-read. */
import { request } from './request.js';
import { subscribe as hear } from './store.js';
import { helpersLast, teamTag } from './roster-groups.js';
import { S } from './state.js';

export const UNASSIGNED = ' unassigned';
let rosters = [];
const listeners = new Set();

const sessions = () => Array.isArray(S.sessions) ? S.sessions : [];
const publish = () => { for (const listener of listeners) listener(); };

hear('teams', (rows) => { rosters = rows; publish(); });
hear('sessions', () => publish());

export function subscribe(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export async function deleteTeamRoster(team) {
  return request(`/api/team-rosters/${encodeURIComponent(team)}`, {
    method: 'DELETE', json: { worktree_disposition: 'ignore' },
  });
}
export async function setTeamMembership(session, team, member) {
  const live = sessions().find((row) => row.name === session);
  if (!live) return { ok: false, message: 'No such session.' };
  const teams = new Set(live.tags || []);
  if (member) teams.add(team); else teams.delete(team);
  return request(`/api/sessions/${encodeURIComponent(session)}/teams`, { method: 'PUT', json: { teams: [...teams] } });
}
export async function setTeamLead(session, team, lead) {
  const live = sessions().find((row) => row.name === session);
  if (!live) return { ok: false, message: 'No such session.' };
  const leads = new Set(live.leads || []);
  if (lead) leads.add(team); else leads.delete(team);
  return request(`/api/sessions/${encodeURIComponent(session)}/team_lead`, { method: 'POST', json: { teams: [...leads] } });
}
export function sessionsAvailableToTeam(team) {
  return sessions().filter((session) => !sessionBelongsToTeam(session, team)).sort((a, b) => a.name.localeCompare(b.name));
}
const sessionBelongsToTeam = (session, team) => {
  const tags = session.tags || [];
  // Ordinary tmux tags use the house-normalized spelling; the reserved durable Team keeps
  // its explicit display identity. This is the one adapter between those existing stores.
  return tags.map(teamTag).includes(teamTag(team));
};
const leadsTeam = (session, team) => (session.leads || []).includes(team);
export function unassignedSessions() {
  const valid = new Set(rosters.filter((team) => team.state !== 'archived').map((team) => team.name));
  return sessions().filter((s) => !(s.tags || []).some((team) => valid.has(team))).sort((a, b) => a.name.localeCompare(b.name));
}
export function membersOfTeam(team) {
  if (team === UNASSIGNED) return unassignedSessions();
  return sessions().filter((s) => sessionBelongsToTeam(s, team))
    .map((session) => ({ ...session, team_lead: leadsTeam(session, team) }))
    .sort((a, b) => Number(b.team_lead) - Number(a.team_lead) || a.name.localeCompare(b.name));
}
export function teamByName(name) {
  const roster = rosters.find((row) => row.name === name && row.state !== 'archived');
  return roster ? { ...roster, durable: true } : { name, objective: '', durable: false };
}
export function teamsFromState() {
  const durable = rosters.filter((r) => r.state !== 'archived').map((r) => ({ ...r, durable: true }));
  return [...durable.sort((a, b) => helpersLast(a.name, b.name)),
    { name: UNASSIGNED, objective: '', durable: false, holding: true }];
}
