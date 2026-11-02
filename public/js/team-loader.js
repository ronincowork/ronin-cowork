/* part of the ronin-cowork client — see js/README.md */

/**
 * Birth every picked Agent after its Team record has been created.
 *
 * Each row is its own launch. Launches are deliberately SERIAL: every birth updates the same Team membership record,
 * so concurrent read/modify/write births can overwrite one another and leave a two-Agent
 * form with one member. A refusal is retained in the returned outcomes and does not stop
 * the remaining rows.
 */
export async function launchTeamAgents(request, team, rows = []) {
  // A BARE-METAL ROW is the native agent itself, born with no Ronin packet: the route
  // wants its opening words and refuses birth material by name.
  const chosen = (row) => ({ ...(row.provider ? { provider: row.provider } : {}), ...(row.model ? { model: row.model } : {}) });
  const body = (row) => row.session_type === 'bare_metal_agent'
    ? { session_type: 'bare_metal_agent', ...(team ? { team } : {}), name: row.name, instructions: row.instructions, ...chosen(row) }
    : {
      session_type: 'cowork_agent',
      ...(team ? { team } : {}),
      team_lead: row.team_lead === true,
      name: row.name,
      instructions: row.instructions,
      mandate: row.mandate,
      ...chosen(row),
    };
  const launch = (row) => request('/api/launch', { method: 'POST', json: body(row) });

  const ordered = [...rows.filter((row) => row.team_lead !== true), ...rows.filter((row) => row.team_lead === true)];
  const outcomes = [];
  for (const row of ordered) outcomes.push({ row, result: await launch(row) });
  return outcomes;
}
