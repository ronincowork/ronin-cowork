/* The one browser-side Team projection and refresh controller. */
import { fetchSessions } from './api.js';
import { request } from './request.js';
import { teamTag } from './roster-groups.js';
import { S } from './state.js';

export const UNASSIGNED = ' unassigned';
let rosters = [];
let loaded = false;
let revision = 0;
const listeners = new Set();

const blankLast = (key) => (a, b) => {
  const av = String(a[key] || '').trim();
  const bv = String(b[key] || '').trim();
  if (!!av !== !!bv) return av ? -1 : 1;
  return (av || a.name).localeCompare(bv || b.name) || a.name.localeCompare(b.name);
};
const sessions = () => Array.isArray(S.sessions) ? S.sessions : [];
const publish = () => { revision++; for (const listener of listeners) listener(snapshot()); };

export function snapshot() {
  return { revision, loaded, rosters: rosters.map((row) => ({ ...row })), sessions: sessions() };
}
export function subscribe(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export async function refreshTeams() {
  const [live, durable] = await Promise.all([fetchSessions(), request('/api/team-rosters', { cache: 'no-store' })]);
  if (durable.ok && Array.isArray(durable.data)) {
    rosters = durable.data; loaded = true;
  }
  publish();
  return { live, durable, snapshot: snapshot() };
}
export async function deleteTeamRoster(team) {
  const result = await request(`/api/team-rosters/${encodeURIComponent(team)}`, { method: 'DELETE' });
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
  return sessions().filter((session) => !sessionBelongsToTeam(session, team)).sort(blankLast('session_role'));
}
export const sessionBelongsToTeam = (session, team) => {
  const tags = session.tags || [];
  // Ordinary tmux tags use the house-normalized spelling; the reserved durable Team keeps
  // its explicit display identity. This is the one adapter between those existing stores.
  return tags.map(teamTag).includes(teamTag(team));
};
export const leadsTeam = (session, team) => (session.leads || []).includes(team);
export function unassignedSessions() {
  const valid = new Set(rosters.filter((team) => team.state !== 'archived').map((team) => team.name));
  return sessions().filter((s) => !(s.tags || []).some((team) => valid.has(team))).sort(blankLast('session_role'));
}
export function membersOfTeam(team) {
  if (team === UNASSIGNED) return unassignedSessions();
  const byRole = blankLast('session_role');
  return sessions().filter((s) => sessionBelongsToTeam(s, team))
    .map((session) => ({ ...session, team_lead: leadsTeam(session, team) }))
    .sort((a, b) => Number(b.team_lead) - Number(a.team_lead) || byRole(a, b));
}
export function teamByName(name) {
  const roster = rosters.find((row) => row.name === name && row.state !== 'archived');
  return roster ? { ...roster, durable: true } : { name, objective: '', durable: false };
}
export function teamsFromState() {
  const active = rosters.filter((r) => r.state !== 'archived');
  const helper = active.find((r) => r.name === 'ronin_helpers')
    || active.find((r) => teamTag(r.name) === 'ronin_helpers');
  const durable = [
    ...active.filter((r) => teamTag(r.name) !== 'ronin_helpers'),
    ...(helper ? [{ ...helper, name: 'ronin_helpers', title: helper.title || 'Ronin Helpers' }] : []),
  ].map((r) => ({ ...r, durable: true }));
  return [...durable.sort(blankLast('name')),
    { name: UNASSIGNED, objective: '', durable: false, holding: true }];
}
