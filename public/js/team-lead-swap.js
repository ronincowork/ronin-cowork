/* part of the ronin-cowork client — see js/README.md */

/**
 * The in-Team quick launch's exclusive leadership handoff.
 *
 * Birth has already marked `newborn`; this removes only THIS Team from every previous
 * leader. Other Team lead marks stay intact, and the general Team controls remain free
 * to designate multiple leaders later.
 */
export async function swapTeamLead(request, team, newborn, members = []) {
  const previous = members.filter((member) => member.name !== newborn && member.team_lead);
  const failed = [];
  for (const member of previous) {
    const teams = (member.leads || []).filter((name) => name !== team);
    const result = await request(`/api/sessions/${encodeURIComponent(member.name)}/team_lead`, {
      method: 'POST',
      json: { teams },
    });
    if (!result.ok) failed.push(member.name);
  }
  return { ok: failed.length === 0, failed };
}
