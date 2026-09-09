/* part of the ronin-cowork client — see js/README.md */
/** The ordinary helper Team stays at the roster's foot while it exists. */
export const RONIN_HELPERS = 'ronin_helpers';
export const teamTag = (team) => team;
export const teamDisplay = (tag) => tag;
export const helpersLast = (a, b) => Number(a === RONIN_HELPERS) - Number(b === RONIN_HELPERS)
  || String(a).localeCompare(String(b));
export const partitionRosterGroups = (groups = []) => ({
  ordinary: groups.filter((group) => group !== RONIN_HELPERS),
  helper: groups.includes(RONIN_HELPERS) ? RONIN_HELPERS : '',
});

/** Durable empty Teams are drop targets too; membership alone cannot discover them. */
export const rosterGroups = (sessions = [], offered = []) => [...new Set([
  ...sessions.flatMap((s) => (s.tags || []).map(teamDisplay)),
  ...(Array.isArray(offered) ? offered.map(teamDisplay) : []),
].filter(Boolean))].sort(helpersLast);
