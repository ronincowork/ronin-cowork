/* part of the ronin-cowork client — see js/README.md */
/** The house helper Team is ordinary and durable, but stays at the roster's foot. */
export const RONIN_HELPERS = 'ronin_helpers';
const isHelper = (team) => String(team || '').toLowerCase() === RONIN_HELPERS;
export const teamTag = (team) => isHelper(team) ? RONIN_HELPERS : team;
export const teamDisplay = (tag) => isHelper(tag) ? RONIN_HELPERS : tag;
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
