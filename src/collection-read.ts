/**
 * THE COLLECTION READING — Who (Teams), What (boards), Where (workspace folders), joined from
 * the records that already exist and never stored. GET /api/collection answers it.
 *
 *   Team → folders   the roster's project_root and repos, each a registered workspace folder
 *   board → Teams    the one rule in work-items-read.ts (boardReadings): holders on the root
 *                    and every item under it, team:<name> directly, agent:<name> through the
 *                    Agent's Team tags; the Unfiled board has no Team
 *   board → folders  through its Teams; the Unfiled board has none
 *
 * Filters, all optional, narrow together: team (its folders and boards), root (the Teams in
 * that folder, the boards they hold), board (its Teams and folders), agent (boards narrowed to
 * the items that Agent holds, Teams to its Teams), stage (items at that stage). Worktrees are
 * not part of it.
 */
import { peekProjectRoots } from './project-roots.js';
import { listTeamRosters } from './team-rosters.js';
import { listSessions } from './tmux.js';
import { ITEM_STAGES } from './work-items.js';
import { boardReadings, type HeldItem } from './work-items-read.js';

export interface CollectionFilters { team?: string; root?: string; board?: string; agent?: string; stage?: string }

export interface CollectionTeam {
  name: string; title: string; objective: string; lead: string;
  agents: string[]; roots: string[]; repos: string[]; boards: string[]; items: number;
}
export type CollectionBoard = HeldItem & { teams: string[]; agents: string[]; roots: string[]; stages: Array<{ stage: string; items: HeldItem[] }> };
export interface CollectionRoot { name: string; path: string; teams: string[]; boards: string[] }
export interface CollectionReading { teams: CollectionTeam[]; boards: CollectionBoard[]; roots: CollectionRoot[] }

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

export async function collectionReading(filters: CollectionFilters = {}): Promise<CollectionReading> {
  const [rosters, sessions, folders] = await Promise.all([listTeamRosters(), listSessions(), peekProjectRoots()]);
  const live = rosters.filter((roster) => roster.state !== 'archived');
  const teamNames = new Set(live.map((roster) => roster.name));
  const folderNames = new Set(folders.filter((folder) => !folder.archived).map((folder) => folder.name));
  const foldersOf = new Map(live.map((roster) => [roster.name, unique([roster.project_root, ...roster.repos]).filter((name) => folderNames.has(name))]));

  // Every board with its Teams (the one rule) and its folders through them.
  let boards = (await boardReadings(sessions, teamNames)).map((reading) => ({
    ...reading, roots: unique(reading.teams.flatMap((team) => foldersOf.get(team) ?? [])),
  }));
  let teams = live;
  const { team, root, board, agent, stage } = filters;
  if (team) {
    teams = teams.filter((row) => row.name === team);
    boards = boards.filter((row) => row.teams.includes(team));
  }
  if (root) {
    teams = teams.filter((row) => foldersOf.get(row.name)?.includes(root));
    boards = boards.filter((row) => row.roots.includes(root));
  }
  if (board) {
    boards = boards.filter((row) => row.board.id === board);
    teams = teams.filter((row) => boards.some((entry) => entry.teams.includes(row.name)));
  }
  if (agent) {
    const agentTeams = sessions.find((session) => session.name === agent)?.tags.filter((tag) => teamNames.has(tag)) ?? [];
    teams = teams.filter((row) => agentTeams.includes(row.name));
    boards = boards.map((row) => ({ ...row, items: row.items.filter((item) => item.holder === `agent:${agent}`) })).filter((row) => row.items.length);
  }
  if (stage) boards = boards.map((row) => ({ ...row, items: row.items.filter((item) => item.stage === stage) })).filter((row) => row.items.length);

  const narrowed = Boolean(team || root || board || agent || stage);
  const shownFolders = folders.filter((folder) => !folder.archived)
    .filter((folder) => (root ? folder.name === root : !narrowed
      || teams.some((row) => foldersOf.get(row.name)?.includes(folder.name)) || boards.some((row) => row.roots.includes(folder.name))));

  return {
    teams: teams.map((roster) => {
      const held = boards.filter((row) => row.teams.includes(roster.name));
      const members = sessions.filter((session) => session.tags.includes(roster.name));
      return {
        name: roster.name, title: roster.title, objective: roster.objective,
        lead: members.find((session) => session.leads.includes(roster.name))?.name ?? '',
        agents: members.map((session) => session.name),
        roots: foldersOf.get(roster.name) ?? [], repos: roster.repos,
        boards: held.map((row) => row.board.id), items: held.reduce((sum, row) => sum + row.items.length, 0),
      };
    }),
    boards: boards.map((row) => ({
      ...row.board, teams: row.teams, agents: row.agents, roots: row.roots,
      stages: ITEM_STAGES.map((at) => ({ stage: at, items: row.items.filter((item) => item.stage === at) })).filter((entry) => entry.items.length),
    })),
    roots: shownFolders.map((folder) => ({
      name: folder.name, path: folder.dir,
      teams: teams.filter((row) => foldersOf.get(row.name)?.includes(folder.name)).map((row) => row.name),
      boards: boards.filter((row) => row.roots.includes(folder.name)).map((row) => row.board.id),
    })),
  };
}
