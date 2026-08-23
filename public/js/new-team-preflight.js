/* part of the ronin-cowork client — see js/README.md */

/**
 * THE DRY RUN, from the browser's side.
 *
 * One door: `POST /api/launch/preflight`, which runs the REAL resolver (`resolveForm`)
 * without creating a session or a roster. Nothing in this file re-derives the cascade,
 * guesses at a default, or decides whether a launch would be legal — those answers are
 * the server's, and asking twice in two languages is how the two drift.
 *
 * REFUSALS ARRIVE AS DATA, AND A NON-2xx MEANS SOMETHING ELSE ENTIRELY. The route answers
 * 200 with a body even when every seat refuses, so `ok:false` is "your draft is wrong" and
 * a thrown/failed request is "the tool is broken". Keeping those apart is the whole reason
 * the route returns structured reasons instead of a message to parse.
 *
 * SEAT-LOCAL AND BATCH-LEVEL STAY APART, because two surfaces show them: `seats[].reasons`
 * belong under the seat's own controls (Agent Configuration draws those), while `team` and
 * `capacity` belong to New Team.
 */
import { request } from './request.js';
import { preflightBody } from './new-team-draft.js';

/** What a caller gets when the request itself failed — never confused with a refusal. */
const BROKEN = (message) => ({ ok: false, broken: true, message, team: null, capacity: null, seats: [] });

export async function preflight(draft) {
  const r = await request('/api/launch/preflight', { method: 'POST', json: preflightBody(draft) });
  if (!r.ok) return BROKEN(r.message || 'the preflight could not run');
  return { broken: false, ...r.data };
}

/**
 * The Team half, in the owner's words rather than field names.
 *
 * ADOPTION IS THE ORDINARY PATH, NOT AN EDGE CASE. Today's launcher sends a team as a
 * plain tag and never the first-class `team:` key, so on any existing box almost every
 * live Team is tag-only and giving one a roster IS the migration. A name that already has
 * members must therefore read as ADOPTING AN EXISTING TEAM, never as a collision warning.
 */
export function teamNotes(team) {
  if (!team) return [];
  const notes = [];
  if (team.name && !team.name_valid) {
    notes.push({
      kind: 'failed',
      text: 'A Team name is lowercase letters, digits, _ and - — and it is also the tag. "unassigned" is reserved for the holding area.',
    });
  }
  if (team.name_valid && !team.name_available) {
    notes.push({ kind: 'failed', text: `Team "${team.name}" already has a roster. Open it instead of creating it.` });
  }
  const n = team.adopts_sessions?.length ?? 0;
  if (n) {
    notes.push({
      kind: 'info',
      text: `${n} live session${n === 1 ? '' : 's'} already carry this name and become members the moment the Team exists: ${team.adopts_sessions.join(', ')}. Membership is derived from the sessions, so the Team arrives already staffed.`,
    });
    // Birth-only by ruling: a session that joins later is not re-briefed, and these were
    // never BORN onto the Team. Naming a team_role now briefs nobody who is already here.
    notes.push({
      kind: 'warning',
      text: 'Those members were tagged, not born onto this Team, so none of them reads the team_role shelf — that reading happens at birth only. Sessions raised from the roster afterwards do.',
    });
  }
  if (team.adopts_wipeboard) {
    notes.push({
      kind: 'info',
      text: `A wipeboard named "${team.wipeboard}" already exists and this Team adopts its thread — the team wins its name.`,
    });
  }
  return notes;
}

/** The box's own limit, reported only when it actually bites. `cap: exempt` seats are born
 *  even at the max, so they are excluded from the headroom question. */
export function capacityNote(capacity) {
  if (!capacity || capacity.over_by <= 0) return null;
  return {
    kind: 'failed',
    text: `This box allows ${capacity.max} live sessions and ${capacity.live} are running. This roster would need ${capacity.over_by} more than there is room for.`,
  };
}
