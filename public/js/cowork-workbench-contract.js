/* Pure Cowork-workbench roster order, kept outside the DOM. */

/** Ordinary Teams sort by stable key; the no-team landing and Ronin helpers stay at the foot. */
export function orderCoworkTeams(teams = [], options = {}) {
  const helperName = String(options.helperName || '');
  const noTeam = options.noTeam;
  const ordinary = teams
    .filter((team) => !team?.holding && team?.name !== helperName)
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  const helper = teams.find((team) => !team?.holding && team?.name === helperName);
  return [...ordinary, ...(noTeam ? [noTeam] : []), ...(helper ? [helper] : [])];
}
