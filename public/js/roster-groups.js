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

/** Only real Team records are groups; a stale session tag must not synthesize one. */
export const rosterGroups = (_sessions = [], offered = []) => [...new Set(
  (Array.isArray(offered) ? offered.map(teamDisplay) : []).filter(Boolean),
)].sort(helpersLast);
