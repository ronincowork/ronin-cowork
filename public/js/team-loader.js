/* part of the ronin-cowork client — see js/README.md */

/**
 * Birth every picked Agent after its Team record has been created.
 *
 * Each row is its own launch. Ordinary rows finish first and a marked lead finishes last.
 * Launches are deliberately SERIAL: every birth updates the same Team membership record,
 * so concurrent read/modify/write births can overwrite one another and leave a two-Agent
 * form with one member. A refusal is retained in the returned outcomes and does not stop
 * the remaining rows.
 */
export async function launchTeamAgents(request, team, rows = []) {
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
  const outcomes = [];
  for (const row of [...ordinary, ...leads]) outcomes.push({ row, result: await launch(row) });
  return outcomes;
}
