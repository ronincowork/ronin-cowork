/**
 * READINGS — derived from the store and the holder lists, never stored.
 * agent:      the items an Agent holds, its focus item's ladder, every held item's docs.
 * team:       the roster objective, the items the Team holds and the items its members
 *             hold, each child after its parent where the lead made any.
 * unassigned: the Unfiled board's items that nobody holds.
 * every:      every item, each with the holder it is found on ('' when nobody holds it).
 */
import { readLetterHolds } from './tegami.js';
import { sessionKey } from './session-dir.js';
import { readTeamRoster } from './team-rosters.js';
import { listSessions } from './tmux.js';
import { WorkItemMissing, heldIds, holderLabel, listItems, readItem, unfiledBoard, type Rung, type WorkItem } from './work-items.js';

export interface AgentReading {
  holder: string;
  items: WorkItem[];
  focus: string | null;
  at: { rung?: number; leg?: number } | null;
  ladder: Rung[];
  docs: string[];
}

/** An item in a reading, with the holder it was found on (team:<name> or agent:<name>). */
export type HeldItem = WorkItem & { holder: string };

export interface TeamReading {
  holder: string;
  team: string;
  objective: string;
  items: HeldItem[];
}

const present = (items: Array<WorkItem | null>): WorkItem[] => items.filter((item): item is WorkItem => item !== null);

export async function agentReading(session: string): Promise<AgentReading> {
  const letter = await readLetterHolds(await sessionKey(session));
  const items = present(await Promise.all((letter?.holds ?? []).map((id) => readItem(id))));
  const named = typeof letter?.at?.item === 'string' ? letter.at.item : null;
  const focus = items.find((item) => item.id === named) ?? items[0] ?? null;
  const at = focus && letter?.at?.item === focus.id
    ? { ...(Number.isInteger(letter.at.rung) ? { rung: letter.at.rung as number } : {}), ...(Number.isInteger(letter.at.leg) ? { leg: letter.at.leg as number } : {}) }
    : null;
  return {
    holder: `agent:${session}`,
    items,
    focus: focus?.id ?? null,
    at: at && Object.keys(at).length ? at : null,
    ladder: focus?.ladder ?? [],
    docs: [...new Set(items.flatMap((item) => item.docs))],
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
  const members = (sessions ?? await listSessions()).filter((session) => session.tags.includes(team));
  const lists: Array<{ holder: string; ids: string[] }> = [{ holder: `team:${team}`, ids: roster.holds }];
  for (const member of members) lists.push({ holder: `agent:${member.name}`, ids: (await readLetterHolds(member.key))?.holds ?? [] });
  const items: HeldItem[] = [];
  for (const { holder, ids } of lists) {
    for (const item of present(await Promise.all(ids.map((id) => readItem(id))))) items.push({ ...item, holder });
  }
  return { holder: `team:${team}`, team, objective: roster.objective, items: byParent(items) };
}

export async function unassignedReading(): Promise<WorkItem[]> {
  const unfiled = await unfiledBoard();
  if (!unfiled) return [];
  const held = await heldIds();
  return (await listItems()).filter((item) => item.parent === unfiled.id && !held.has(item.id));
}

export async function everyItemReading(): Promise<HeldItem[]> {
  await unfiledBoard(); // a former "Common" root is renamed before it is read
  const held = await heldIds();
  return (await listItems()).map((item) => {
    const holder = held.get(item.id);
    return { ...item, holder: holder ? holderLabel(holder) : '' };
  });
}
