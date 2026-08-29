/* part of the ronin-cowork client — see js/README.md */

/**
 * THE TEAM DRAFT — one object, one consumer, seven fields.
 *
 * New Team owns this and nothing else reads it. A draft is what the owner has TYPED and
 * not yet created; the moment `POST /api/team-rosters` accepts it the draft is spent and
 * a fresh one takes its place, because the Team itself is now the record and the surface
 * has nothing left to hold.
 *
 * NOTHING IS REQUIRED EXCEPT A NAME, AND ONLY AT THE MOMENT OF CREATION. A blank
 * `team_role` is an unclassified Team; an empty objective, no root, no repos and no
 * branch are all valid. A Team defined with a name and nothing else is a complete
 * outcome of this surface. Sessions are not this file's business: a session joins a
 * Team by carrying its tag, which is what the New Agent launcher writes at birth.
 */

export const DRAFT_VERSION = 2;

/** The roster's seven durable fields, in the order the form asks for them. Only `name`
 *  gates anything, and only at the instant of creation. */
const TEAM_DEFAULTS = Object.freeze({
  name: '',
  team_role: '',
  objective: '',
  project_root: '',
  repos: [],
  branch: '',
  wipeboard: '',
});

export function createDraft(overrides = {}) {
  return {
    draft_version: DRAFT_VERSION,
    team: { ...TEAM_DEFAULTS, ...(overrides.team ?? {}) },
  };
}

/**
 * THE ROSTER WRITE, and the derived facts are absent BY NAME rather than by omission.
 * `POST /api/team-rosters` refuses `members`, `sessions`, `team_lead`, `leads` and
 * `leaders` out loud, because membership and leadership are derived from live sessions
 * and a roster carrying them would be the drift that store exists to prevent.
 */
export function rosterBody(team) {
  return {
    name: finalizeTeamName(team.name),
    team_role: team.team_role ?? '',
    objective: team.objective ?? '',
    project_root: team.project_root ?? '',
    repos: [...(team.repos ?? [])],
    branch: team.branch ?? '',
    // '' means "the Team's own token" — the store fills it in rather than storing a blank.
    wipeboard: (team.wipeboard ?? '').trim(),
  };
}

/** A team name obeys the tag rules — it IS the tag. Mirrors `isValidTeamName` in
 *  src/team-rosters.ts; the server refuses regardless, this only tells you sooner. */
export const isValidTeamName = (s) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(s);

/**
 * Live-sanitize as the owner types, character for character, so the caret cannot jump.
 *
 * Trailing separators are stripped as well as leading ones — `isValidTeamName` would
 * ACCEPT `product-launch-`, so nothing downstream would ever have complained, and the
 * owner would have got a Team whose tag ends in a dash because they typed `!!`. Mirrors
 * `sanitizeName` in src/spawn.ts, which trims both ends for the same reason.
 */
export const sanitizeTeamName = (raw) =>
  String(raw).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[_-]+/, '').slice(0, 64);

/**
 * The SETTLED name — what actually gets created. Trailing separators go here and NOT in
 * the live sanitizer, because a live trim eats the `-` in `product-launch` at the instant
 * you type it and you can never reach the second word. So the field lets you type, and the
 * value settles when you leave it or press create. Two functions because they answer two
 * different questions: "what may this field contain right now" and "what will be made".
 */
export const finalizeTeamName = (raw) => sanitizeTeamName(raw).replace(/[_-]+$/, '');

/**
 * Is this draft ready to become a Team? Exactly ONE condition, because exactly one thing
 * is enforced by the server at creation: a valid name. Not an objective, not a team_role,
 * not a root. A Team defined with a name and nothing else is a complete and valid outcome
 * of this surface.
 */
export function canCreateTeam(draft) {
  return isValidTeamName(finalizeTeamName(draft.team.name ?? ''));
}
