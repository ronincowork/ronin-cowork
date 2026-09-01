/* part of the ronin-cowork client — see js/README.md */

/**
 * Birth every picked Agent after its Team record has been created.
 *
 * Each row is its own launch. Ordinary rows are fired first and a marked lead is fired
 * last, without waiting for any birth to finish. Outcomes belong to the existing launch
 * door; the Team form does not monitor, retry or roll back them.
 */
export function launchTeamAgents(request, team, rows = []) {
  const launch = (row) => request('/api/launch', {
    method: 'POST',
    json: {
      session_type: 'cowork_agent',
      team,
      team_lead: row.team_lead === true,
      name: row.name,
      instructions: row.instructions,
      mandate: row.mandate,
    },
  });

  const ordinary = rows.filter((row) => row.team_lead !== true);
  const leads = rows.filter((row) => row.team_lead === true);
  for (const row of [...ordinary, ...leads]) void launch(row);
}
