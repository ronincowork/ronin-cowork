/* part of the ronin-cowork client — see js/README.md */
/** Durable empty Teams are drop targets too; membership alone cannot discover them. */
export const rosterGroups = (sessions = [], offered = []) => [...new Set([
  ...sessions.flatMap((s) => s.tags || []),
  ...(Array.isArray(offered) ? offered : []),
].filter(Boolean))].sort();
