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

/** Cold entry discovers Team-backed offers only after the Team authority has arrived. */
export async function refreshCoworkDiscovery({ refreshTeams, active, paint, refreshSelector }) {
  await refreshTeams();
  if (!active()) return false;
  paint();
  refreshSelector();
  return true;
}

/** Team authority projected into the Cowork Teams Phalanx; one visible stone per Team. */
export function coworkTeamStones(teams = [], memberCount = () => 0, agentWord = (count) => `${count} Agents`) {
  return teams.filter((team) => !team?.holding).map((team) => {
    const count = memberCount(team.name);
    return { id: team.name, label: String(team.title ?? '').trim() || team.name,
      secondary: team.objective || team.name, state: agentWord(count), team, count };
  });
}
