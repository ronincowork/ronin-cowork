/**
 * READINGS — derived from the live index (work-items-index.ts; w418), never stored: rows, not
 * item files. An item's own file is read only where a reading needs what no row has (an
 * Agent's or its Teams' held items' attachments, for the work record's documents).
 * agent:      the items an Agent holds and every held item's attachments (a lead's Teams' holds
 *             included: the lead wears the Team), and the items it watches;
 *             for a lead, each Team it leads: what the Team holds and watches, and what each
 *             member holds and watches.
 * team:       the roster objective, the items the Team holds and the items its members
 *             hold, each child after its parent where the lead made any; and its epics
 *             (the epic → Teams rule, boardReadings), plus the roots nobody's work reaches,
 *             each whole.
 * every:      every item, each with the holder it is found on (team:, agent: or workspace:<name>;
 *             '' when nobody holds it).
 * board:      one epic's root and every item under it (boardReadings), each with its holder.
 */
import { readLetterHolds } from './tegami.js';
import type { TeamLayers } from './team-layers.js';
import { sessionKey } from './session-dir.js';
import { readTeamRoster, type TeamRoster } from './team-rosters.js';
import { listSessions } from './tmux.js';
import { WorkItemMissing, handedInNote, readItem, type WorkItem } from './work-items.js';
import { currentIds, liveRows, type ItemRow } from './work-items-index.js';

export interface AgentReading {
  holder: string;
  items: ItemRow[];
  attachments: string[];
  watching: ItemRow[];
  /** Each Team the Agent leads, read from its roster and its members' records. */
  teams: LedTeam[];
  /** Each Team the Agent is on or leads: its four layers, live (team-layers.ts; KAN-331). */
  layers: TeamLayers[];
}

export interface LedTeam {
  team: string;
  items: ItemRow[];
  watching: ItemRow[];
  members: Array<{ name: string; items: ItemRow[]; watching: ItemRow[] }>;
}

/** An item in a reading, with the holder it was found on (team:<name> or agent:<name>). */
export type HeldItem = ItemRow & { holder: string };

export interface TeamReading {
  holder: string;
  team: string;
  objective: string;
  items: HeldItem[];
  /** Every item under the Team's epics (the epic → Teams rule, boardReadings) and under the
   * roots no Team reaches, roots included, each with its holder. */
  boards: HeldItem[];
}

/** The live rows by id, read once per reading. */
const rowsById = async (): Promise<Map<string, ItemRow>> => new Map((await liveRows()).map((row) => [row.id, row]));
/** The rows a holder holds, by the index; each once. */
const heldBy = (rows: Map<string, ItemRow>, label: string): ItemRow[] => [...rows.values()].filter((row) => row.holders.includes(label));
/** The rows for ids from a list (watches), each once by the id it goes by now; archived ones are history. */
const rowsFor = async (rows: Map<string, ItemRow>, ids: string[] = []): Promise<ItemRow[]> => [...new Map((await currentIds(ids)).map((id) => rows.get(id)).filter((row): row is ItemRow => Boolean(row)).map((row) => [row.id, row])).values()];

export async function agentReading(session: string): Promise<AgentReading> {
  const rows = await rowsById();
  // Watches are on the Agent's own letter, the one letter read; holds come from the index.
  const letter = await readLetterHolds(await sessionKey(session));
  // In the order the Agent took them, as its letter lists them.
  const items = await rowsFor(rows, letter?.holds);
  const sessions = await listSessions();
  const teams: LedTeam[] = [];
  for (const team of sessions.find((one) => one.name === session)?.leads ?? []) {
    const roster = await readTeamRoster(team);
    const members = [];
    for (const member of sessions.filter((one) => one.name !== session && one.tags.includes(team))) {
      const record = await readLetterHolds(member.key);
      members.push({ name: member.name, items: heldBy(rows, `agent:${member.name}`), watching: await rowsFor(rows, record?.watches) });
    }
    teams.push({ team, items: await rowsFor(rows, roster?.holds), watching: await rowsFor(rows, roster?.watches), members });
  }
  const me = sessions.find((one) => one.name === session);
  const { teamLayers } = await import('./team-layers.js');
  const every = [...rows.values()];
  const layers = await Promise.all([...new Set([...(me?.leads ?? []), ...(me?.tags ?? [])])].map((team) => teamLayers(team, sessions, every).catch(() => null)));
  return {
    holder: `agent:${session}`,
    items,
    attachments: await openedAttachments([...items, ...teams.flatMap((team) => team.items)]),
    watching: await rowsFor(rows, letter?.watches),
    teams,
    layers: layers.filter((one): one is TeamLayers => one !== null),
  };
}

/** Every held item's attachments, each once: a `plan:<workspace>/<name>` opened through the plan
 * read to where it is now (src/plans.ts), or left as written when it no longer resolves (gone).
 * Attachments are not on a row: each held item's own file is read, the only bodies a work record
 * opens (the Agent's and its Teams' held items, a handful). */
async function openedAttachments(rows: ItemRow[]): Promise<string[]> {
  const { resolvePlanRef } = await import('./plans.js');
  const items = (await Promise.all([...new Set(rows.map((row) => row.id))].map((id) => readItem(id)))).filter((item): item is WorkItem => item !== null);
  const opened = await Promise.all(items.flatMap((item) => item.attachments.map(async (doc) =>
    doc.startsWith('plan:') ? (await resolvePlanRef(item.campaign_id, doc)) ?? doc : doc)));
  return [...new Set(opened)];
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
  const rows = await rowsById();
  const items: HeldItem[] = [];
  for (const row of await rowsFor(rows, roster.holds)) items.push({ ...row, holder: `team:${team}` });
  for (const holder of members.map((member) => `agent:${member.name}`)) {
    for (const row of heldBy(rows, holder)) items.push({ ...row, holder });
  }
  return { holder: `team:${team}`, team, objective: roster.objective, items: byParent(items), boards: await teamBoards(team, sessions ?? await listSessions(), [...rows.values()]) };
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

export async function boardReadings(sessions?: Array<{ name: string; tags: string[] }>, teamNames?: Set<string>, rows?: ItemRow[]): Promise<BoardReading[]> {
  const every = rows ? rows.map(withHolder) : await everyItemReading();
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

/** A Team's epics by the rule above, plus the roots no Team reaches, every item under them. A root
 * a Workspace holds (its Icebox, KAN-352) is no Team's: it is on no Team's reading. */
async function teamBoards(team: string, sessions: Array<{ name: string; tags: string[] }>, rows?: ItemRow[]): Promise<HeldItem[]> {
  return (await boardReadings(sessions, undefined, rows))
    .filter((reading) => reading.teams.includes(team) || (!reading.teams.length && !reading.board.holder.startsWith('workspace:')))
    .flatMap((reading) => [reading.board, ...reading.items]);
}

/** The Team's Epics for the Team workbench's Epics card (`epics`): those the Team or its members
 * hold, and the Epic above each item they hold. */
export interface TeamWork { epics: string[] }

type Node = { id: string; parent: string | null; level: number };
export function teamWork(items: Node[], every: Node[]): TeamWork {
  const byId = new Map(every.map((item) => [item.id, item]));
  const held = [...new Map(items.map((item) => [item.id, item])).values()];
  const epics = new Set<string>();
  for (const item of held) {
    let at: Node | undefined = item;
    for (let steps = 0; at && at.level !== 1 && steps < every.length; steps += 1) at = at.parent ? byId.get(at.parent) : undefined;
    if (at?.level === 1) epics.add(at.id);
  }
  return { epics: [...epics] };
}

/** An item under an Epic as the Epics workbench draws it (KAN-206): its row (w418) with the Epic it
 * sits under. What a bar says beyond the row (the objective cut short, the last comment, how
 * many comments) is the picked Epic's alone: epicCards reads those bodies when it is opened. */
export type EpicItem = HeldItem & { epic: string };

/** A push's words, cut at a word near `max` characters. */
const cut = (text: string, max: number): string => {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const at = flat.lastIndexOf(' ', max);
  return `${flat.slice(0, at > max * 0.6 ? at : max)}…`;
};

/** THE EPICS PUSH (KAN-190, KAN-206, w418): every Epic's row, and every live item under one with
 * its Epic. Rows only: archived items have none, and no item file is read. */
export function epicsPush(all: HeldItem[]): { epics: HeldItem[]; items: EpicItem[] } {
  const byId = new Map(all.map((item) => [item.id, item]));
  const epicOf = (item: HeldItem): string => {
    let at: HeldItem | undefined = item;
    for (let steps = 0; at?.parent && steps < all.length; steps += 1) {
      at = byId.get(at.parent);
      if (at?.level === 1) return at.id;
    }
    return '';
  };
  // Every live item that is not an Epic, with the Epic above it ('' under none: KAN-414), so the
  // push moves on any item write and Work Items needs no re-read on a push that moved nothing.
  // Every reader of `items` picks by epic id, so an item under no Epic shows on no Epic's board.
  const items: EpicItem[] = [];
  for (const item of all) if (item.level !== 1) items.push({ ...item, epic: epicOf(item) });
  return { epics: all.filter((item) => item.level === 1), items };
}

/** What a bar says beyond its row (owner, 2026-11-06, w334), for one picked Epic and every live
 * item under it (w418): the objective cut short, the last comment cut short, how many comments.
 * The one place the Epics board opens bodies. */
export interface EpicCard { id: string; objective: string; review: string; said: { by: string; at: string; text: string } | null; comment_count: number }
export async function epicCards(epicId: string): Promise<EpicCard[]> {
  const rows = await liveRows();
  const { items } = epicsPush(rows.map(withHolder));
  const ids = [epicId, ...items.filter((item) => item.epic === epicId).map((item) => item.id)];
  const bodies = (await Promise.all(ids.map((id) => readItem(id)))).filter((item): item is WorkItem => item !== null);
  return bodies.map(cardOf);
}

/** One bar's words from its item's file: the objective and last comment cut short, the count. */
export const cardOf = (item: Pick<WorkItem, 'id' | 'objective' | 'comments' | 'status'>): EpicCard => ({
  id: item.id,
  objective: cut(item.objective, 280),
  // In Review, what the owner should look at (KAN-429): the Handed in note.
  review: item.status === 'In Review' ? cut(handedInNote(item), 200) : '',
  said: item.comments?.length ? (({ by, at, text }) => ({ by, at, text: cut(text, 200) }))(item.comments.at(-1)!) : null,
  comment_count: item.comments?.length ?? 0,
});

/** A row with the one holder a list shows: the last of its holders (Teams, then Agents, then
 * Workspaces), '' when nobody holds it. */
const withHolder = (row: ItemRow): HeldItem => ({ ...row, holder: row.holders.at(-1) ?? '' });

export async function everyItemReading(): Promise<HeldItem[]> {
  return (await liveRows()).map(withHolder);
}
