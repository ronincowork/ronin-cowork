/* part of the ronin-cowork client — see js/README.md */
/** The house helper Team is ordinary and durable, but stays at the roster's foot. */
export const RONIN_HELPERS = 'RONIN_HELPERS';
export const helpersLast = (a, b) => Number(a === RONIN_HELPERS) - Number(b === RONIN_HELPERS)
  || String(a).localeCompare(String(b));

/** Durable empty Teams are drop targets too; membership alone cannot discover them. */
export const rosterGroups = (sessions = [], offered = []) => [...new Set([
  ...sessions.flatMap((s) => s.tags || []),
  ...(Array.isArray(offered) ? offered : []),
].filter(Boolean))].sort(helpersLast);
