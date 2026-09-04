import { deleteTeamRoster } from './team-rosters.js';
import { getLeads, listSessions, setLeads, setTags } from './tmux.js';
import { writeTeams } from './tegami.js';
import { announceTeamChanges } from './routes/wipeboards-api.js';
import { ignoreEndingRequest, inspectTeamEnding, promptEnding } from './desks/ending-runtime.js';

export type TeamRetireDisposition = 'inspect' | 'prompt' | 'ignore';

export async function retireTeam(name: string, disposition: TeamRetireDisposition = 'inspect'): Promise<Record<string, unknown>> {
  const ending = await inspectTeamEnding(name);
  if (ending.unresolved.length && disposition === 'inspect') {
    return { ok: false, requires_disposition: true, ending, actions: ['prompt', 'ignore'] };
  }
  if (ending.unresolved.length && disposition === 'prompt') {
    return { ok: false, requires_disposition: true, ...(await promptEnding(ending)) };
  }
  if (ending.unresolved.length) await ignoreEndingRequest(ending);
  await deleteTeamRoster(name);
  for (const session of await listSessions()) {
    if (!session.tags.includes(name)) continue;
    const teams = await setTags(session.name, session.tags.filter((team) => team !== name));
    const leads = await getLeads(session.name);
    if (leads.includes(name)) await setLeads(session.name, leads.filter((team) => team !== name));
    await writeTeams(session.name, teams).catch(() => {});
    await announceTeamChanges(session.name, session.tags, teams).catch(() => {});
  }
  return { ok: true, retired: name };
}
