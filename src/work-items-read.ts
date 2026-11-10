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
 * every:      every item, each with the holder it is found on (team:, agent: or workspace:<name>;
 *             '' when nobody holds it).
 * board:      one epic's root and every item under it (boardReadings), each with its holder.
 */
import { readLetterHolds } from './tegami.js';
import type { TeamLayers } from './team-layers.js';
import { sessionKey } from './session-dir.js';
import { readTeamRoster, type TeamRoster } from './team-rosters.js';
import { listSessions } from './tmux.js';
import { WorkItemMissing, heldIds, holderLabel, listItems, readItem, type HandIn, type WorkItem } from './work-items.js';

export interface AgentReading {
  holder: string;
  items: WorkItem[];
  attachments: string[];
  watching: WorkItem[];
  /** Each Team the Agent leads, read from its roster and its members' records. */
  teams: LedTeam[];
  /** Each Team the Agent is on or leads: its four layers, live (team-layers.ts; KAN-331). */
  layers: TeamLayers[];
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

/** The items found, each once by the id it goes by now: a list holding an item under its old w id
 * and its Jira key reads it once (KAN-261). */
const present = (items: Array<WorkItem | null>): WorkItem[] => [...new Map(items.filter((item): item is WorkItem => item !== null).map((item) => [item.id, item])).values()];

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
  const me = sessions.find((one) => one.name === session);
  const { teamLayers } = await import('./team-layers.js');
  const every = await listItems();
  const layers = await Promise.all([...new Set([...(me?.leads ?? []), ...(me?.tags ?? [])])].map((team) => teamLayers(team, sessions, every).catch(() => null)));
  return {
    holder: `agent:${session}`,
    items,
    attachments: await openedAttachments([...items, ...teams.flatMap((team) => team.items)]),
    watching: await read(letter?.watches),
    teams,
    layers: layers.filter((one): one is TeamLayers => one !== null),
  };
}

/** Every held item's attachments, each once: a `plan:<workspace>/<name>` opened through the plan
 * read to where it is now (src/plans.ts), or left as written when it no longer resolves (gone). */
async function openedAttachments(items: WorkItem[]): Promise<string[]> {
  const { resolvePlanRef } = await import('./plans.js');
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

/** A Team's epics by the rule above, plus the roots no Team reaches, every item under them. A root
 * a Workspace holds (its Icebox, KAN-352) is no Team's: it is on no Team's reading. */
async function teamBoards(team: string, sessions: Array<{ name: string; tags: string[] }>): Promise<HeldItem[]> {
  return (await boardReadings(sessions))
    .filter((reading) => reading.teams.includes(team) || (!reading.teams.length && !reading.board.holder.startsWith('workspace:')))
    .flatMap((reading) => [reading.board, ...reading.items]);
}

/** The Team's Epics for the Team workbench's Epics card (`epics`): those the Team or its members
 * hold, and the Epic above each item they hold. */
export interface TeamWork { epics: string[] }

export function teamWork(items: HeldItem[], every: WorkItem[]): TeamWork {
  const byId = new Map(every.map((item) => [item.id, item]));
  const held = [...new Map(items.map((item) => [item.id, item])).values()];
  const epics = new Set<string>();
  for (const item of held) {
    let at: WorkItem | undefined = item;
    for (let steps = 0; at && at.level !== 1 && steps < every.length; steps += 1) at = at.parent ? byId.get(at.parent) : undefined;
    if (at?.level === 1) epics.add(at.id);
  }
  return { epics: [...epics] };
}

/** An item under an Epic as the Epics workbench draws it (KAN-206): no history, comments or
 * attachments; its Jira key when paired, and the Epic it sits under. */
export interface EpicItem {
  id: string; title: string; status: string; holder: string; parent: string | null; level: number;
  kind: string; flagged: boolean; campaign_id: string; jira: string; epic: string;
  /** What a bar says it is (owner, 2026-11-06, w334): the objective cut short, its last comment
   * cut short, how many comments, when it last moved, and its last hand-in and promotion. */
  objective: string; said: { by: string; at: string; text: string } | null; comment_count: number;
  moved: string; hand_ins: HandIn[]; on_dev?: { promotion: string; at: string };
}

/** A push's words, cut at a word near `max` characters. */
const cut = (text: string, max: number): string => {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const at = flat.lastIndexOf(' ', max);
  return `${flat.slice(0, at > max * 0.6 ? at : max)}…`;
};

/** THE EPICS PUSH (KAN-190, KAN-206): every Epic whole, and every item under one, slim. */
export function epicsPush(all: HeldItem[]): { epics: Array<HeldItem & { archived_under: number }>; items: EpicItem[] } {
  // Archived items (Done five days, KAN-266) are off the workbench: each Epic counts its own.
  const byId = new Map(all.map((item) => [item.id, item]));
  const every = all.filter((item) => !item.archived);
  const epicOf = (item: HeldItem): string => {
    let at: HeldItem | undefined = item;
    for (let steps = 0; at?.parent && steps < every.length; steps += 1) {
      at = byId.get(at.parent);
      if (at?.level === 1) return at.id;
    }
    return '';
  };
  const items: EpicItem[] = [];
  for (const item of every) {
    const epic = item.level === 1 ? '' : epicOf(item);
    if (!epic) continue;
    items.push({
      id: item.id, title: item.title, status: item.status, holder: item.holder, parent: item.parent, level: item.level,
      kind: item.kind, flagged: item.flagged, campaign_id: item.campaign_id, jira: item.external.jira?.key ?? '', epic,
      objective: cut(item.objective, 280),
      said: item.comments?.length ? (({ by, at, text }) => ({ by, at, text: cut(text, 200) }))(item.comments.at(-1)!) : null,
      comment_count: item.comments?.length ?? 0,
      moved: item.trail?.at(-1)?.at ?? item.created?.at ?? '',
      hand_ins: item.hand_ins?.length ? [item.hand_ins.at(-1)!] : [],
      ...(item.on_dev ? { on_dev: item.on_dev } : {}),
    });
  }
  const archivedUnder = new Map<string, number>();
  for (const item of all) {
    if (!item.archived || item.level === 1) continue;
    const epic = epicOf(item);
    if (epic) archivedUnder.set(epic, (archivedUnder.get(epic) ?? 0) + 1);
  }
  return { epics: every.filter((item) => item.level === 1).map((epic) => ({ ...epic, archived_under: archivedUnder.get(epic.id) ?? 0 })), items };
}

export async function everyItemReading(): Promise<HeldItem[]> {
  const held = await heldIds();
  return (await listItems()).map((item) => {
    const holder = held.get(item.id);
    return { ...item, holder: holder ? holderLabel(holder) : '' };
  });
}
