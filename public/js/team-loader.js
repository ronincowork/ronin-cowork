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
  // A row's own Routine switches become the launch's agent layer (src/routines.ts): on
  // over off when a template states both, and nothing sent when it states neither, so
  // an ordinary row still inherits the team's map untouched.
  const routinesOf = (row) => {
    const map = {};
    for (const name of row.routines_off || []) map[name] = false;
    for (const name of row.routines_on || []) map[name] = true;
    return Object.keys(map).length ? { routines: map } : {};
  };
  const launch = (row) => request('/api/launch', {
    method: 'POST',
    json: {
      session_type: 'cowork_agent',
      team,
      team_lead: row.team_lead === true,
      name: row.name,
      instructions: row.instructions,
      mandate: row.mandate,
      ...routinesOf(row),
    },
  });

  const ordinary = rows.filter((row) => row.team_lead !== true);
  const leads = rows.filter((row) => row.team_lead === true);
  const outcomes = [];
  for (const row of [...ordinary, ...leads]) outcomes.push({ row, result: await launch(row) });
  return outcomes;
}
