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
      team_lead: row.lead === true,
      name: row.name,
      instructions: row.assignment,
      mandate: row.mandate,
    },
  });

  const ordinary = rows.filter((row) => row.lead !== true);
  const leads = rows.filter((row) => row.lead === true);
  for (const row of [...ordinary, ...leads]) void launch(row);
}

/** Create is the duplicate-submit gate: only the call that made the Team fires its cast. */
export async function raiseTeam(request, roster, rows = []) {
  const made = await request('/api/team-rosters', { method: 'POST', json: roster });
  if (made.ok) void launchTeamAgents(request, roster.name, rows);
  return made;
}
