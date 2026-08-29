/* part of the ronin-cowork client — see js/README.md */

/**
 * THE CANONICAL TEAM DRAFT — one object, two consumers.
 *
 * New Team owns this. Agent Configuration edits ONE SEAT of it and hands the seat back
 * (Gate E, frozen with @eye_agent_config 2026-08-23). There is no second draft, no second
 * launch payload, and no browser-side cascade: what the server resolves, the server is
 * asked.
 *
 * UNSET IS NOT EMPTY, AND THAT IS THE WHOLE SHAPE OF THIS FILE. `null` means "say
 * nothing and let the resolved profile decide"; `''` and `[]` mean "the owner stated
 * this". Only four fields distinguish the two, because only for those does the SERVER
 * treat an absent key differently from a stated one:
 *
 *   mcp           null -> the profile's own `mcp:` default   (false is an OPINION)
 *   cmd           null -> the owner's session default (⚙ Configuration)
 *   project_root  null -> the team's default, then the top active root
 *   name          null -> slugged from the role and the prompt
 *
 * Everywhere else `''` is a value. Most sharply `session_role: ''`, which is a REAL
 * launch with no role reading and no mark — never "the owner has not picked yet". And
 * `mode` is always stated and never null: the wire defaults an absent mode to `assisted`
 * while the launcher's honest default is `manual`, so leaving it unset would quietly
 * change what happens to the owner's words.
 *
 * THE ROUND TRIP IS THE TEST. Open a seat, draw every control, save it back unedited, and
 * the draft must be byte-identical. That holds because THE DRAFT IS THE AUTHORITY AND THE
 * WIRE BODY IS DERIVED: `bodyOf` drops nulls rather than materializing them, so no default
 * can be written into the draft merely because a control was drawn for it.
 *
 * NOTHING HERE IS REQUIRED. An empty Team is valid, zero seats is valid, a blank
 * `team_role` is an unclassified Team, and `lead_seat_id` is null far more often than not
 * — a Team NEVER requires a designated lead (owner, 2026-08-23). No gate in this file
 * exists because a form draws a field.
 */

export const DRAFT_VERSION = 1;

/** The four fields where `null` is a distinct state. Exported so a consumer can build a
 *  per-field clear without re-deriving the list from this file's prose. */
export const NULLABLE_SEAT_FIELDS = Object.freeze(['mcp', 'cmd', 'project_root', 'name']);

/**
 * THE SEAT CONSTRUCTORS LANDED WITH THEIR IMPORTER, not before it. `check-dead` is right
 * that an export nobody imports is dead code, and its list "MUST ONLY EVER SHRINK" — so
 * these two waited for `agent-config-fields.js` rather than for an exemption. The rule
 * that generalises, owed to @eye_agent_config: an export with an INTERNAL consumer may
 * land ahead of its external one (`NULLABLE_SEAT_FIELDS` did, because `bodyOf` reads it);
 * an export that exists ONLY for somebody else may not.
 */

/** Everything a seat may state. `presented_family` is a draft-local breadcrumb naming the
 *  shelf the seat was picked from — it is NEVER sent, because a family is presentation and
 *  reaches no payload (R35). */
const SEAT_DEFAULTS = Object.freeze({
  session_role: '',
  mode: 'manual',
  prompt: '',
  name: null,
  cmd: null,
  mcp: null,
  project_root: null,
  tags: [],
  seed: [],
  inject: '',
  reference: '',
  presented_family: '',
});

/** The roster's seven durable fields, in the order Stage 1 asks for them. Only `name`
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

let seatCounter = 0;
/** Stable within a draft and never reused: it is the retry key, and the identity Agent
 *  Configuration returns unchanged. */
const nextSeatId = () => `seat-${++seatCounter}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * THE ONE PLACE A SEAT IS CONSTRUCTED. `SEAT_DEFAULTS` is the contract, so a caller that
 * built a seat literal of its own could differ by a single default and kill the
 * byte-identical round trip SILENTLY — no error, no gate, just a draft that changes when
 * it is opened. That is the failure the round-trip law exists to catch, and it is why no
 * consumer restates the defaults.
 */
export function createSeat(overrides = {}) {
  return { seat_id: nextSeatId(), ...SEAT_DEFAULTS, ...overrides, resolved: null, outcome: null };
}

export function createDraft(overrides = {}) {
  return {
    draft_version: DRAFT_VERSION,
    draft_id: overrides.draft_id ?? `team-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    team: { ...TEAM_DEFAULTS, ...(overrides.team ?? {}) },
    seats: Array.isArray(overrides.seats) ? overrides.seats : [],
    /** null is valid at every moment, for an empty Team and a staffed one alike. */
    lead_seat_id: overrides.lead_seat_id ?? null,
    transaction: overrides.transaction ?? null,
  };
}

/** The durable roster identity, not a mutable boolean assertion about `draft.team`. */
export const committedTeam = (draft) => String(draft?.transaction?.committed_team ?? '');

/**
 * A seat as `/api/launch` would receive it — nulls DROPPED, not defaulted.
 *
 * This is the one direction that matters for the round trip: the draft is never rewritten
 * from the wire, so a control that draws `mcp` as a tri-state cannot leave `false` behind
 * by being looked at.
 */
export function bodyOf(seat, team) {
  const body = {
    session_role: seat.session_role ?? '',
    mode: seat.mode === 'manual' ? 'manual' : 'assisted',
    prompt: seat.prompt ?? '',
    tags: [...(seat.tags ?? [])],
    seed: [...(seat.seed ?? [])],
    inject: seat.inject ?? '',
    reference: seat.reference ?? '',
  };
  if (team) body.team = team;
  for (const key of NULLABLE_SEAT_FIELDS) {
    if (seat[key] !== null && seat[key] !== undefined) body[key] = seat[key];
  }
  return body;
}

/** What the preflight route is asked. Server truth (`resolved`, `outcome`) never rides
 *  out — it is a reading, and sending a reading back would let it masquerade as an edit. */
export function preflightBody(draft) {
  return {
    team: { ...draft.team },
    seats: draft.seats.map((seat) => ({ ...bodyOf(seat, ''), seat_id: seat.seat_id })),
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
 * not a root, not a seat, not a lead. A Team defined with a name and nothing else is a
 * complete and valid outcome of this surface.
 */
export function canCreateTeam(draft) {
  return isValidTeamName(finalizeTeamName(draft.team.name ?? ''));
}

/**
 * PER-FIELD CLEAR — the only way back to unset, and it exists because a control that can
 * reach a value must be able to reach "say nothing" too. It is deliberately narrow: on a
 * field that is not nullable there IS no unset to return to, because `''` and `[]` are
 * stated values there, and offering the affordance anyway would be a lie about the shape.
 */
export function clearSeatField(seat, field) {
  if (!NULLABLE_SEAT_FIELDS.includes(field)) return seat;
  return { ...seat, [field]: null };
}
