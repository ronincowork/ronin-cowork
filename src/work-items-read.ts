/**
 * READINGS — derived from the store and the holder lists, never stored.
 * agent:      the items an Agent holds and every held item's attachments (a lead's Teams' holds
 *             included: the lead wears the Team), and the items it watches;
 *             for a lead, each Team it leads: what the Team holds and watches, and what each
 *             member holds and watches.
 * team:       the roster objective, the items the Team holds and the items its members
 *             hold, each child after its parent where the lead made any; and its epics
 *             (the epic → Teams rule, boardReadings), plus the roots nobody's work reaches,
 *             each whole.
 * every:      every item, each with the holder it is found on ('' when nobody holds it).
 * board:      one epic's root and every item under it (boardReadings), each with its holder.
 */
import { readLetterHolds } from './tegami.js';
import { sessionKey } from './session-dir.js';
import { readTeamRoster, type TeamRoster } from './team-rosters.js';
import { listSessions } from './tmux.js';
import { WorkItemMissing, heldIds, holderLabel, listItems, readItem, type WorkItem } from './work-items.js';

export interface AgentReading {
  holder: string;
  items: WorkItem[];
  attachments: string[];
  watching: WorkItem[];
  /** Each Team the Agent leads, read from its roster and its members' records. */
  teams: LedTeam[];
}

export interface LedTeam {
  team: string;
  items: WorkItem[];
  watching: WorkItem[];
  members: Array<{ name: string; items: WorkItem[]; watching: WorkItem[] }>;
}

/** An item in a reading, with the holder it was found on (team:<name> or agent:<name>). */
export type HeldItem = WorkItem & { holder: string };

export interface TeamReading {
  holder: string;
  team: string;
  objective: string;
  items: HeldItem[];
  /** Every item under the Team's epics (the epic → Teams rule, boardReadings) and under the
   * roots no Team reaches, roots included, each with its holder. */
  boards: HeldItem[];
}

const present = (items: Array<WorkItem | null>): WorkItem[] => items.filter((item): item is WorkItem => item !== null);

const read = (ids: string[] = []) => Promise.all(ids.map((id) => readItem(id))).then(present);

export async function agentReading(session: string): Promise<AgentReading> {
  const letter = await readLetterHolds(await sessionKey(session));
  const items = await read(letter?.holds);
  const sessions = await listSessions();
  const teams: LedTeam[] = [];
  for (const team of sessions.find((one) => one.name === session)?.leads ?? []) {
    const roster = await readTeamRoster(team);
    const members = [];
    for (const member of sessions.filter((one) => one.name !== session && one.tags.includes(team))) {
      const record = await readLetterHolds(member.key);
      members.push({ name: member.name, items: await read(record?.holds), watching: await read(record?.watches) });
    }
    teams.push({ team, items: await read(roster?.holds), watching: await read(roster?.watches), members });
  }
  return {
    holder: `agent:${session}`,
    items,
    attachments: [...new Set([...items, ...teams.flatMap((team) => team.items)].flatMap((item) => item.attachments))],
    watching: await read(letter?.watches),
    teams,
  };
}

/** Parents first, each child straight after its parent; order otherwise kept. */
function byParent(items: HeldItem[]): HeldItem[] {
  const ids = new Set(items.map((item) => item.id));
  const children = new Map<string, HeldItem[]>();
  for (const item of items) if (item.parent && ids.has(item.parent)) children.set(item.parent, [...(children.get(item.parent) ?? []), item]);
  const out: HeldItem[] = [];
  const walk = (item: HeldItem) => { out.push(item); for (const child of children.get(item.id) ?? []) walk(child); };
  for (const item of items) if (!item.parent || !ids.has(item.parent)) walk(item);
  return out;
}

export async function teamReading(team: string, sessions?: Array<{ name: string; key: string; tags: string[] }>): Promise<TeamReading> {
  const roster = await readTeamRoster(team);
  if (!roster) throw new WorkItemMissing(`Team "${team}" has no roster.`);
  return rosterReading(roster, sessions);
}

/** The Team reading from a roster already in hand: the teams push builds one per roster. */
export async function rosterReading(roster: Pick<TeamRoster, 'name' | 'objective' | 'holds'>, sessions?: Array<{ name: string; key: string; tags: string[] }>): Promise<TeamReading> {
  const team = roster.name;
  const members = (sessions ?? await listSessions()).filter((session) => session.tags.includes(team));
  const lists: Array<{ holder: string; ids: string[] }> = [{ holder: `team:${team}`, ids: roster.holds }];
  for (const member of members) lists.push({ holder: `agent:${member.name}`, ids: (await readLetterHolds(member.key))?.holds ?? [] });
  const items: HeldItem[] = [];
  for (const { holder, ids } of lists) {
    for (const item of present(await Promise.all(ids.map((id) => readItem(id))))) items.push({ ...item, holder });
  }
  return { holder: `team:${team}`, team, objective: roster.objective, items: byParent(items), boards: await teamBoards(team, sessions ?? await listSessions()) };
}

/** THE TEAM'S EPIC (owner, 2026-10-18): the root the Team holds, else the root its lead
 * holds; none is null. What the teams push carries as `board`, and State on the Teams overlay. */
export const teamBoard = (reading: TeamReading, lead: string): HeldItem | null =>
  reading.items.find((item) => !item.parent && item.holder === reading.holder)
  ?? reading.items.find((item) => !item.parent && item.holder === `agent:${lead}`)
  ?? null;

/* THE EPIC → TEAMS RULE, the one place it lives. An epic here is a root item with every item
 * under it. Its Teams come from the holders on the root and on every item under it: team:<name>
 * directly, agent:<name> through that Agent's Team tags (an Agent in two Teams brings the epic
 * to both). A root nobody's work reaches belongs to no Team. A Team's epics (its reading's `boards`) read
 * this. */
export interface BoardReading {
  board: HeldItem;
  /** Every item under the epic, the root itself excluded. */
  items: HeldItem[];
  teams: string[];
  agents: string[];
}

export async function boardReadings(sessions?: Array<{ name: string; tags: string[] }>, teamNames?: Set<string>): Promise<BoardReading[]> {
  const every = await everyItemReading();
  const live = sessions ?? await listSessions();
  const teams = teamNames ?? new Set(live.flatMap((session) => session.tags));
  const tagsOf = new Map(live.map((session) => [session.name, session.tags.filter((tag) => teams.has(tag))]));
  const byId = new Map(every.map((item) => [item.id, item]));
  const rootOf = (id: string): string => {
    let item = byId.get(id);
    for (let steps = 0; item?.parent && byId.has(item.parent) && steps < every.length; steps += 1) item = byId.get(item.parent);
    return item?.id ?? '';
  };
  const out = new Map<string, BoardReading>();
  for (const item of every) if (!item.parent) out.set(item.id, { board: item, items: [], teams: [], agents: [] });
  for (const item of every) if (item.parent) out.get(rootOf(item.id))?.items.push(item);
  for (const reading of out.values()) {
    const held = [reading.board, ...reading.items].map((item) => item.holder);
    const agents = [...new Set(held.filter((holder) => holder.startsWith('agent:')).map((holder) => holder.slice(6)))];
    reading.agents = agents;
    reading.teams = [...new Set([
      ...held.filter((holder) => holder.startsWith('team:')).map((holder) => holder.slice(5)),
      ...agents.flatMap((agent) => tagsOf.get(agent) ?? []),
    ])];
  }
  return [...out.values()];
}

/** A Team's epics by the rule above, plus the roots no Team reaches, every item under them. */
async function teamBoards(team: string, sessions: Array<{ name: string; tags: string[] }>): Promise<HeldItem[]> {
  return (await boardReadings(sessions))
    .filter((reading) => reading.teams.includes(team) || !reading.teams.length)
    .flatMap((reading) => [reading.board, ...reading.items]);
}

export async function everyItemReading(): Promise<HeldItem[]> {
  const held = await heldIds();
  return (await listItems()).map((item) => {
    const holder = held.get(item.id);
    return { ...item, holder: holder ? holderLabel(holder) : '' };
  });
}
