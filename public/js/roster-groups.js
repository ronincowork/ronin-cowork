/* part of the ronin-cowork client — see js/README.md */
/** Steerco, the house Team, stays at the roster's foot while it exists. */
export const STEERCO = 'steerco';
export const teamTag = (team) => team;
const teamDisplay = (tag) => tag;
export const steercoLast = (a, b) => Number(a === STEERCO) - Number(b === STEERCO)
  || String(a).localeCompare(String(b));
export const partitionRosterGroups = (groups = []) => ({
  ordinary: groups.filter((group) => group !== STEERCO),
  helper: groups.includes(STEERCO) ? STEERCO : '',
});

/** Only real Team records are groups; a stale session tag must not synthesize one. */
export const rosterGroups = (_sessions = [], offered = []) => [...new Set(
  (Array.isArray(offered) ? offered.map(teamDisplay) : []).filter(Boolean),
)].sort(steercoLast);
