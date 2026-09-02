/* part of the ronin-cowork client — see js/README.md */

/**
 * THE CAST GATE — answer whether every requested Agent name is free before Raise makes
 * the Team record. A repeated name inside the form is the same conflict as a live name:
 * neither is allowed to fall through into a partial birth.
 */
export function conflictingAgentNames(picks = [], sessions = []) {
  const live = new Set(sessions.map((session) => session?.name).filter(Boolean));
  const seen = new Set();
  const conflicts = new Set();
  for (const pick of picks) {
    if (live.has(pick.name) || seen.has(pick.name)) conflicts.add(pick.name);
    seen.add(pick.name);
  }
  return [...conflicts];
}
