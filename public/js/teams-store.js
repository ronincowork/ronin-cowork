/* part of the ronin-cowork client — see js/README.md
 *
 * THE TEAM PROJECTION — one place that turns sessions plus durable rosters into the
 * League's and the Team's rosters, so no destination invents its own answer.
 *
 * IT READS AND NEVER WRITES. `S.sessions` has exactly one writer (`reconcileSessions`
 * in js/api.js) and this module is not a second one; the durable half is fetched here
 * and cached. Membership writes are a later leg and deliberately absent.
 *
 * NULL IS ALWAYS VALID (owner, 2026-08-23). Nothing here rejects a blank axis and
 * nothing synthesizes one: a Team with no team_role, no objective and no live members
 * is an ordinary Team, and a session with no session_role is an ordinary session.
 * Where a list is ordered by a classification the blanks sort LAST and then by name —
 * never dropped, never given a stand-in value.
 */
import { request } from './request.js';
import { S } from './state.js';

/** The holding area is a PROJECTION, never a tag. This sentinel is not a legal team
 *  name (isValidTeamName rejects the leading space), so a roster can never collide with
 *  it — a real team called "unassigned" draws as its own ordinary card beside it. */
export const UNASSIGNED = ' unassigned';

let rosters = []; // the durable half; [] until load() answers, which is a real state
let loaded = false;

/** The durable half. A failure keeps the last good list rather than emptying the board. */
export async function loadRosters() {
  const r = await request('/api/team-rosters', { cache: 'no-store' });
  if (r.ok && Array.isArray(r.data)) {
    rosters = r.data;
    loaded = true;
  }
  return r;
}

export const rostersLoaded = () => loaded;

/** Blank sorts after stated, then by name. The one ordering rule in this file. */
const byBlankLast = (key) => (a, b) => {
  const av = (a[key] || '').trim();
  const bv = (b[key] || '').trim();
  if (!av !== !bv) return av ? -1 : 1;
  return (av || a.name).localeCompare(bv || b.name) || a.name.localeCompare(b.name);
};

const liveSessions = () => (Array.isArray(S.sessions) ? S.sessions : []);

/**
 * EVERY TEAM THE BOARD DRAWS, in board order: durable rosters, then tag-only Teams,
 * then the holding area last.
 *
 * ARCHIVED ROSTERS ARE HIDDEN in v1 (owner, 2026-08-23) — hidden, not deleted.
 *
 * TAG-ONLY TEAMS ARE NOT A FOOTNOTE. /api/launch takes a first-class team key but the
 * shipped launcher sends only tags (js/launcher.js), so every Team made through today's
 * UI has no durable record. On an existing box they are most of the board, and they
 * stay so: giving one a roster is a deliberate act that nothing forces.
 */
export function teamsFromState() {
  const sessions = liveSessions();
  const tagged = new Set(sessions.flatMap((s) => s.tags || []));
  const durable = rosters.filter((r) => r.state !== 'archived').map((r) => ({ ...r, durable: true }));
  const known = new Set(durable.map((r) => r.name));
  const tagOnly = [...tagged]
    .filter((t) => !known.has(t))
    .map((name) => ({ name, team_role: '', objective: '', durable: false }));
  return [
    ...durable.sort(byBlankLast('team_role')),
    ...tagOnly.sort((a, b) => a.name.localeCompare(b.name)),
    { name: UNASSIGNED, team_role: '', objective: '', durable: false, holding: true },
  ];
}

/** The live half of one Team, ordered with unmarked sessions last. */
export function membersOfTeam(team) {
  if (team === UNASSIGNED) return unassignedSessions();
  return liveSessions()
    .filter((s) => sessionBelongsToTeam(s, team))
    .sort(byBlankLast('session_role'));
}

/** Zero real memberships. Derived every time; never stored, never written. */
export function unassignedSessions() {
  return liveSessions()
    .filter((s) => !(s.tags || []).length)
    .sort(byBlankLast('session_role'));
}

export const sessionBelongsToTeam = (session, team) => (session.tags || []).includes(team);

/** Leadership is the hand-set designation, contextual per Team, and may be absent. */
export const leadsTeam = (session, team) => (session.leads || []).includes(team);
