/* part of the ronin-cowork client — see js/README.md */

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
