import { deleteTeamRoster, readTeamRoster } from './team-rosters.js';
import { getLeads, listSessions, setLeads, setTags } from './tmux.js';
import { writeTeams } from './tegami.js';
import { announceTeamChanges } from './routes/wipeboards-api.js';
import { ignoreEndingRequest, inspectTeamEnding, promptEnding } from './desks/ending-runtime.js';
import { resolveEndingRequest } from './desks/ending-response.js';

export type TeamRetireDisposition = 'inspect' | 'prompt' | 'ignore';

export async function retireTeam(name: string, disposition: TeamRetireDisposition = 'inspect'): Promise<Record<string, unknown>> {
  // Recover an orphaned legacy/incomplete membership that has no Team roster. With no
  // roster it cannot own the desk/team-line state inspected by this preflight, but its
  // stale member tags and leads still need to be detached.
  const roster = await readTeamRoster(name);
  let acknowledgement: Record<string, unknown> | undefined;
  if (roster) {
    const ending = await inspectTeamEnding(name);
    const decision = await resolveEndingRequest(ending, disposition, {
      prompt: () => promptEnding(ending),
      quarantine: () => ignoreEndingRequest(ending),
    });
    if (!decision.proceed) return { ...decision.response! };
    acknowledgement = decision.acknowledgement;
  }
  await deleteTeamRoster(name);
  for (const session of await listSessions()) {
    if (!session.tags.includes(name)) continue;
    const teams = await setTags(session.name, session.tags.filter((team) => team !== name));
    const leads = await getLeads(session.name);
    if (leads.includes(name)) await setLeads(session.name, leads.filter((team) => team !== name));
    await writeTeams(session.name, teams).catch(() => {});
    await announceTeamChanges(session.name, session.tags, teams).catch(() => {});
  }
  return { ok: true, retired: name, ...(acknowledgement ? { worktree_acknowledgement: acknowledgement } : {}) };
}
