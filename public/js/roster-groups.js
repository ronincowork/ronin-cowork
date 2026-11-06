/* part of the ronin-cowork client — see js/README.md */
/** Steerco, the house Team, stays at the roster's foot while it exists. */
export const STEERCO = 'steerco';
/** Ronin Helpers, the house Team before Steerco (w168); a store may still hold its roster. */
const RONIN_HELPERS = 'ronin_helpers';
/** The one rule for a Teams list, desktop and phone (KAN-305): the house Teams are not listed. */
export const listedTeam = (team) => team?.name !== STEERCO && team?.name !== RONIN_HELPERS;
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
