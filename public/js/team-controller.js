/* The one browser-side Team projection and refresh controller.
 *
 * The rosters are the store's `teams` (js/store.js), read when the server nudges; the
 * members are `S.sessions`, which the store's pushed `sessions` keeps current. It hears
 * both, and a listener hears the projection only when one of the two changed, so a Team
 * surface never rebuilds from the same answer twice. */
import { fetchSessions } from './api.js';
import { request } from './request.js';
import { painted, snapshot as readFromServer, subscribe as hear } from './store.js';
import { helpersLast, teamTag } from './roster-groups.js';
import { S } from './state.js';

export const UNASSIGNED = ' unassigned';
let rosters = [];
let loaded = false;
let revision = 0;
let published = '';
const listeners = new Set();

const sessions = () => Array.isArray(S.sessions) ? S.sessions : [];
const publish = () => {
  const now = JSON.stringify([loaded, rosters]) + painted(sessions());
  if (now === published) return;
  published = now;
  revision++;
  for (const listener of listeners) listener(snapshot());
};

hear('teams', (rows) => { rosters = rows; loaded = true; publish(); });
hear('sessions', () => publish());

export function snapshot() {
  return { revision, loaded, rosters: rosters.map((row) => ({ ...row })), sessions: sessions() };
}
export function subscribe(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export async function refreshTeams() {
  const [live, read] = await Promise.all([fetchSessions(), readFromServer('teams')]);
  publish(); // the members may have moved even when the rosters did not
  return { live, durable: read.result, snapshot: snapshot() };
}
export async function deleteTeamRoster(team) {
  const result = await request(`/api/team-rosters/${encodeURIComponent(team)}`, {
    method: 'DELETE', json: { worktree_disposition: 'ignore' },
  });
  if (result.ok) await refreshTeams();
  return result;
}
export async function setTeamMembership(session, team, member) {
  const live = sessions().find((row) => row.name === session);
  if (!live) return { ok: false, message: 'No such session.' };
  const teams = new Set(live.tags || []);
  if (member) teams.add(team); else teams.delete(team);
  const result = await request(`/api/sessions/${encodeURIComponent(session)}/teams`, { method: 'PUT', json: { teams: [...teams] } });
  if (result.ok) await refreshTeams();
  return result;
}
export async function setTeamLead(session, team, lead) {
  const live = sessions().find((row) => row.name === session);
  if (!live) return { ok: false, message: 'No such session.' };
  const leads = new Set(live.leads || []);
  if (lead) leads.add(team); else leads.delete(team);
  const result = await request(`/api/sessions/${encodeURIComponent(session)}/team_lead`, { method: 'POST', json: { teams: [...leads] } });
  if (result.ok) await refreshTeams();
  return result;
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
