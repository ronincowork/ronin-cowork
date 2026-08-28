/* The one browser-side Team projection and refresh controller. */
import { fetchSessions } from './api.js';
import { request } from './request.js';
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
  if (durable.ok && Array.isArray(durable.data)) { rosters = durable.data; loaded = true; }
  publish();
  return { live, durable, snapshot: snapshot() };
}
export async function updateSessionTeams(session, change) {
  const path = `/api/sessions/${encodeURIComponent(session)}/teams`, current = await request(path);
  if (!current.ok) return current;
  const saved = await request(path, { method: 'PUT', json: { teams: change(current.data.teams || []) } });
  if (!saved.ok) return saved;
  const live = sessions().find((item) => item.name === session);
  if (live) live.tags = saved.data.teams || [];
  await refreshTeams();
  return saved;
}
export const sessionBelongsToTeam = (session, team) => (session.tags || []).includes(team);
export const leadsTeam = (session, team) => (session.leads || []).includes(team);
export function unassignedSessions() {
  return sessions().filter((s) => !(s.tags || []).length).sort(blankLast('session_role'));
}
export function membersOfTeam(team) {
  if (team === UNASSIGNED) return unassignedSessions();
  // The 人 pins to the top (owner, 2026-08-26); the rest by role, then name.
  const byRole = blankLast('session_role');
  return sessions().filter((s) => sessionBelongsToTeam(s, team))
    .map((session) => ({ ...session, team_lead: leadsTeam(session, team) }))
    .sort((a, b) => Number(b.team_lead) - Number(a.team_lead) || byRole(a, b));
}
export function teamByName(name) {
  const roster = rosters.find((row) => row.name === name && row.state !== 'archived');
  return roster ? { ...roster, durable: true } : { name, team_role: '', objective: '', durable: false };
}
export function teamsFromState() {
  const durable = rosters.filter((r) => r.state !== 'archived').map((r) => ({ ...r, durable: true }));
  return [...durable.sort(blankLast('team_role')),
    { name: UNASSIGNED, team_role: '', objective: '', durable: false, holding: true }];
}
