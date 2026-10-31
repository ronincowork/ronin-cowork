/**
 * THE WORK ITEM STORE — one item type, stored once, keyed by id.
 *
 * The only module that reads or writes an item file. Everything else reaches items through
 * the /api/work-items routes (src/routes/work-items-api.ts), and every change here appends
 * exactly one line to the item's trail, naming who called (a quiet Jira fields refresh aside,
 * setJiraFields). Nothing is locked against
 * anyone: holding is discovery, never permission. Two refusals: nothing goes below -1 (follow),
 * and an Agent's new item needs an epic above it (createItemUnlocked).
 *
 * THE SHAPE MATCHES JIRA (docs/using-ronin/work-items.md). One object at every level, and one
 * exact value (Lab JIRA_RONIN_BRIDGE keystone 10): `status`, `kind`, `priority` and a link's
 * `type` are the space's own names (spaceNames), anything else refused naming the set;
 * `level` is the kind's level (1 epic · 0 story, task, bug · -1 subtask); `flagged` an
 * impediment; `comments` a list.
 *
 * One file per item, <store>/<id>.json, written beside and renamed over. An id is `w<n>` from one
 * global issuer (w1, w2, …), or a paired item's Jira key (KAN-65, keystone 3: renameItem), under
 * one in-process lock that every write shares, so a trail append is read, push, write with
 * nobody in between.
 */
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './resources.js';
import { sessionKey } from './session-dir.js';
import { enqueueMessage } from './message-queue.js';
import { listTeamRosters, readTeamRoster, writeTeamRoster } from './team-rosters.js';
import { ackRecord, listLetterHolds, teamChanged, readLetterHolds, seedTegami, writeLetterHolds, writeLetterWatches } from './tegami.js';
import { initialCampaignId } from './campaign-scope.js';
import { listSessions } from './tmux.js';
import { emitItemChanged } from './sockets.js';

export const ITEM_LEVELS = [1, 0, -1] as const;
export const TRAIL_OPS = ['create', 'assign', 'handoff', 'release', 'move', 'status', 'edit', 'comment', 'flag', 'attach', 'link', 'holder-ended', 'rename'] as const;

export type ItemLevel = typeof ITEM_LEVELS[number];
export type TrailOp = typeof TRAIL_OPS[number];

export interface TrailLine { at: string; by: string; op: TrailOp; from?: string; to?: string; note?: string }
/** The pair (JIRA_RONIN_BRIDGE keystone 3): the Jira issue's id, which never changes, and the
 * key it shows (PAY-123). Only the bridge writes it. */
export interface JiraPair { id: string; key: string }
export interface External { trello?: string; jira?: JiraPair; github?: string }
export interface Comment { by: string; at: string; text: string; edited?: string }
/** Jira's issue link, kept on the item it starts from: `type` is the link type's name (Blocks: this item blocks `to`). */
export interface Link { type: string; to: string }

/** A space's own names: what status, kind (with its level), priority and link type may be. */
export interface SpaceNames {
  statuses: string[];
  kinds: Array<{ name: string; level: ItemLevel }>;
  priorities: string[];
  /** The priority a new work item holds. */
  priority: string;
  links: string[];
  /** The Jira site's address (https://x.atlassian.net), for a paired item's link; none unconnected. */
  site?: string;
}
/** Jira's defaults, for a campaign no space has named. Statuses in workflow order; the first
 * kind at a level is the one a new item there takes. */
export const JIRA_NAMES: SpaceNames = {
  statuses: ['To Do', 'In Progress', 'In Review', 'Done'],
  kinds: [{ name: 'Epic', level: 1 }, { name: 'Task', level: 0 }, { name: 'Story', level: 0 }, { name: 'Bug', level: 0 }, { name: 'Feature', level: 0 }, { name: 'Subtask', level: -1 }],
  priorities: ['Highest', 'High', 'Medium', 'Low', 'Lowest'],
  priority: 'Medium',
  links: ['Blocks', 'Relates', 'Duplicate', 'Cloners'],
};
const SPACES = new Map<string, SpaceNames>();
/** The Jira bridge names a connected campaign's space here (null when it disconnects). */
export function setSpaceNames(campaign: string, names: SpaceNames | null): void {
  if (names) SPACES.set(campaign, names); else SPACES.delete(campaign);
}
export const spaceNames = (campaign: string): SpaceNames => SPACES.get(campaign) ?? JIRA_NAMES;
/** A paired item's Jira issue address, derived from its space's site; none when unpaired or the site is unnamed. */
export function jiraLink(item: WorkItem): string | undefined {
  const site = spaceNames(item.campaign_id).site;
  return site && item.external.jira ? `${site}/browse/${item.external.jira.key}` : undefined;
}

/** What item read says of an item's connection, from stored keys only: the key it carries,
 * and its parent's (null: no parent; key null: a parent that carries none). Nothing is
 * fetched, so a key is not a claim the connection works. None for an unconnected item. */
export interface Connection { key: string; parent: { id: string; key: string | null } | null }
export function connectionOf(item: WorkItem, parent: WorkItem | null): Connection | undefined {
  if (!item.external.jira) return undefined;
  return { key: item.external.jira.key, parent: item.parent ? { id: item.parent, key: parent?.external.jira?.key ?? null } : null };
}

/** The value as named, or a refusal naming the set. */
function oneOf(what: string, value: string, names: string[]): string {
  if (!names.includes(value)) throw new WorkItemBadInput(`${what} is one of ${names.join(', ')}; not "${value}".`);
  return value;
}
const kindAt = (names: SpaceNames, level: number): string => {
  const kind = names.kinds.find((one) => one.level === level);
  if (!kind) throw new WorkItemBadInput(`the space has no work type at level ${level}.`);
  return kind.name;
};
const levelOfKind = (names: SpaceNames, kind: string): ItemLevel => {
  oneOf('kind', kind, names.kinds.map((one) => one.name));
  return names.kinds.find((one) => one.name === kind)!.level;
};

export interface WorkItem {
  id: string;
  campaign_id: string;
  title: string;
  objective: string;
  /** The kind's level: 1 epic · 0 story, task or bug · -1 subtask. */
  level: ItemLevel;
  /** The space's work type name. */
  kind: string;
  /** The space's status name. */
  status: string;
  flagged: boolean;
  /** The space's priority name. */
  priority: string;
  comments: Comment[];
  parent: string | null;
  /** Absolute paths, or the Jira link of a file kept in Jira. */
  attachments: string[];
  links: Link[];
  external: External;
  /** A paired item's Jira fields (keystone 10): Jira's field name → its value as plain text,
   * the populated ones. In only: the bridge sets them (setJiraFields), nobody else. */
  jiraFields?: Record<string, string>;
  trail: TrailLine[];
  created: { at: string; by: string };
}

/** What every write answers: the item as it now is, the line it appended, and who was told
 * of an arrival. What the act did is read from the line (didLine). */
export interface Acknowledged { item: WorkItem; line: TrailLine; notified?: string[] }

export class WorkItemRefused extends Error {}
export class WorkItemMissing extends Error {}
export class WorkItemBadInput extends Error {}

/** `w<n>`, or a Jira key (KAN-65). */
const ID = /^(w[1-9][0-9]*|[A-Z][A-Z0-9_]+-[1-9][0-9]*)$/;
export const isItemId = (value: string): boolean => ID.test(value);
/** w ids by number, then keys by space and number. */
const order = (id: string): [string, number] => { const [, prefix, n] = /^(.*?)-?([0-9]+)$/.exec(id)!; return [prefix!, Number(n)]; };
const byId = (a: WorkItem, b: WorkItem): number => {
  const [pa, na] = order(a.id);
  const [pb, nb] = order(b.id);
  return pa === pb ? na - nb : pa === 'w' ? -1 : pb === 'w' ? 1 : pa.localeCompare(pb);
};

const dir = () => storeDir('work_items');
const fileOf = (id: string) => path.join(dir(), `${id}.json`);

let tail: Promise<unknown> = Promise.resolve();
/** The issuer lock. Every item and holder write runs inside it, one at a time. */
export function withIssuer<T>(action: () => Promise<T>): Promise<T> {
  const run = tail.then(action, action);
  tail = run.catch(() => undefined);
  return run;
}

let written = 0;
async function save(item: WorkItem): Promise<void> {
  await mkdir(dir(), { recursive: true });
  const target = fileOf(item.id);
  const tmp = `${target}.tmp-${process.pid}-${++written}`;
  await writeFile(tmp, `${JSON.stringify(item, null, 2)}\n`, 'utf8');
  await rename(tmp, target);
}

async function load(id: string): Promise<WorkItem> {
  if (!isItemId(id)) throw new WorkItemMissing(`"${id}" is not a work item id; ids look like w12 or KAN-65.`);
  try {
    return JSON.parse(await readFile(fileOf(id), 'utf8')) as WorkItem;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new WorkItemMissing(`No work item ${id}.`);
    throw error;
  }
}

export async function readItem(id: string): Promise<WorkItem | null> {
  try { return await load(id); } catch (error) {
    if (error instanceof WorkItemMissing) return null;
    throw error;
  }
}

export async function listItems(): Promise<WorkItem[]> {
  let names: string[];
  try { names = await readdir(dir()); } catch { return []; }
  const ids = names.filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5)).filter(isItemId);
  const items = await Promise.all(ids.map((id) => readItem(id)));
  return items.filter((item): item is WorkItem => item !== null).sort(byId);
}

/** THE ISSUER never issues an id twice. It keeps the highest w number ever issued in
 * <store>/issued (written inside the issuer lock), so a w item renamed to its Jira key leaves
 * its number used. With no file yet it starts from the w files and every "renamed from w<n>"
 * trail line. A Jira key is never issued. */
async function nextId(): Promise<string> {
  const file = path.join(dir(), 'issued');
  const number = (id: string | undefined) => Number(/^w([1-9][0-9]*)$/.exec(id ?? '')?.[1] ?? 0);
  let top = Number((await readFile(file, 'utf8').catch(() => '')).trim()) || 0;
  if (!top) for (const item of await listItems()) {
    top = Math.max(top, number(item.id), ...item.trail.filter((line) => line.op === 'rename').map((line) => number(line.from)));
  }
  let names: string[] = [];
  try { names = await readdir(dir()); } catch { /* an empty store issues w1 */ }
  for (const name of names) top = Math.max(top, number(name.replace(/\.json$/, '')));
  await mkdir(dir(), { recursive: true });
  await writeFile(file, `${top + 1}\n`, 'utf8');
  return `w${top + 1}`;
}

const lineOf = (by: string, op: TrailOp, extra: Omit<TrailLine, 'at' | 'by' | 'op'> = {}): TrailLine => ({
  at: new Date().toISOString(), by: by.trim() || 'unknown', op,
  ...Object.fromEntries(Object.entries(extra).filter(([, value]) => value !== undefined && value !== '')),
});

/** Read, change, append one trail line, write. Runs inside the issuer lock. */
const answer = (item: WorkItem, line: TrailLine): Acknowledged => ({ item, line });

/** A change by anyone but the hearer pushes each hearer one line naming the item and the
 * change (one's own writes tell nobody); `news` false keeps the line from everyone. */
export async function appendTrail(id: string, by: string, change: (item: WorkItem) => Omit<TrailLine, 'at' | 'by'>, news: (line: TrailLine) => boolean = () => true): Promise<Acknowledged> {
  const item = await load(id);
  const { op, ...extra } = change(item);
  const line = lineOf(by, op, extra);
  item.trail.push(line);
  await save(item);
  emitItemChanged({ item, line });
  if (news(line)) await ackHolders(item, line);
  return answer(item, line);
}

/** The hearers' ack: "KAN-27: a comment from jira:glen." or "w64: status In Progress → In Review by jira:x." */
async function ackHolders(item: WorkItem, line: TrailLine): Promise<void> {
  const detail = line.from && line.to ? `${line.from} → ${line.to}` : line.to ?? line.from ?? line.note ?? '';
  const what = line.op === 'comment' ? `a comment from ${line.by}` : `${line.op}${detail ? ` ${detail}` : ''} by ${line.by}`;
  const { holders, watchers } = await hearers(item, line.op, line.by);
  for (const { name } of holders) await enqueueMessage(name, `${item.id}: ${what}.`, 'house', 'Work items');
  for (const { name, watches } of watchers) await enqueueMessage(name, `${item.id}${watching(item.id, watches)}: ${what}.`, 'house', 'Work items');
}

/** What a watcher's message names: " (under w3, which you watch)", or nothing when it watches the item itself. */
const watching = (id: string, watches: string): string => watches === id ? '' : ` (under ${watches}, which you watch)`;

/** The moves a watcher hears: status, a flag raised or cleared, a holder change, and an
 * arrival (a child created or moved under). Comments, edits, links and fields stay the holders'. */
const WATCHED: ReadonlySet<string> = new Set<TrailOp | 'arrival'>(['status', 'flag', 'assign', 'handoff', 'release', 'holder-ended', 'arrival']);

/** The item's id and every id above it, nearest first. */
async function ancestry(item: WorkItem): Promise<string[]> {
  const ids = [item.id];
  for (let at = item.parent; at; at = (await readItem(at))?.parent ?? null) ids.push(at);
  return ids;
}

/** THE ONE RECIPIENT RULE: who hears a move on an item, in two lists, never the one who made
 * it. Holders hear every change: the Agents holding it, and the lead of each Team holding it,
 * as the Team's voice (`team`). Watchers, each with the item it
 * watches, hear only the WATCHED moves: the Agents watching it or an item above it, and the lead
 * of each Team watching it: a Team watches what its roster's watches name, and what its members
 * hold, found now from the holders and written into nobody's watches; holding puts a Team on
 * no watchers list. A lead is found at send time and stored nowhere, so a new lead hears with no
 * step. Each list is a union, an Agent once in it; the two are never compared, so an Agent on
 * both gets both messages. */
async function hearers(item: WorkItem, move: TrailOp | 'arrival' | null, by: string): Promise<{ holders: Array<{ name: string; team: boolean }>; watchers: Array<{ name: string; watches: string }> }> {
  const held = await holdersOf(item.id);
  const agents = held.filter((holder) => holder.kind === 'agent').map((holder) => holder.name);
  const teams = held.filter((holder) => holder.kind === 'team').map((holder) => holder.name);
  const watched = Boolean(move && WATCHED.has(move));
  const sessions = watched || teams.length ? await listSessions() : [];
  const leadsOf = (team: string) => sessions.filter((session) => session.leads.includes(team)).map((session) => session.name);
  const holders = new Map<string, boolean>(teams.flatMap((team) => leadsOf(team).map((name) => [name, true] as const)));
  for (const name of agents) holders.set(name, false);
  holders.delete(by);
  const watchers = new Map<string, string>();
  if (watched) {
    const above = await ancestry(item);
    const nearest = (watches: string[]) => above.find((id) => watches.includes(id));
    for (const letter of await listLetterHolds()) {
      const at = nearest(letter.watches);
      if (at) watchers.set(letter.name, at);
    }
    for (const roster of await listTeamRosters()) {
      const at = nearest(roster.watches);
      if (at) for (const name of leadsOf(roster.name)) watchers.set(name, at);
    }
    const memberOf = agents.flatMap((name) => sessions.find((session) => session.name === name)?.tags ?? []);
    for (const team of memberOf) for (const name of leadsOf(team)) watchers.set(name, item.id);
  }
  watchers.delete(by);
  return { holders: [...holders].map(([name, team]) => ({ name, team })), watchers: [...watchers].map(([name, watches]) => ({ name, watches })) };
}

export interface NewItem {
  title: string;
  campaign_id?: string;
  objective?: string;
  status?: string;
  parent?: string | null;
  /** The space's work type name; with none, the space's first at one below the parent (0 with none). */
  kind?: string;
  /** Held from birth by this Team or Agent, in the same call and the same trail line. */
  holder?: Holder;
  priority?: string;
  attachments?: string[];
  /** Born paired, so its create line and unheld message already name the Jira key. */
  jira?: JiraPair;
}

/** One below the parent, 0 with none (Jira's hierarchy). A default, never a guard. */
const levelUnder = (parent: WorkItem | null): ItemLevel => parent ? (parent.level - 1) as ItemLevel : 0;

/** THE ONE RULE (owner, 2026-10-22): nothing goes below -1. On a create, move or kind
 * write the item takes its new level and its children follow, each one below its own
 * parent; if any would land below -1 the act fails in one line: "w39 can't go there."
 * Nothing else is checked. That covers anything under a subtask, a move under one's own
 * descendant, and a move under oneself (the item becomes its own child, so the levels fall
 * past -1). Returns the children whose level changes, with their new level. */
async function follow(item: WorkItem, parent: string | null, level: number): Promise<Array<{ child: WorkItem; level: number }>> {
  const all = (await listItems()).map((other) => other.id === item.id ? { ...other, parent } : other);
  const out: Array<{ child: WorkItem; level: number }> = [];
  const walk = (id: string, at: number): void => {
    if (at < -1) throw new WorkItemRefused(`${item.id} can't go there.`);
    for (const child of all.filter((other) => other.parent === id)) {
      if (child.id !== item.id && child.level !== at - 1) out.push({ child, level: at - 1 });
      walk(child.id, at - 1);
    }
  };
  walk(item.id, level);
  return out;
}

/** The children follow: each takes its new level, and the space's first kind there when its
 * own is at another level, with one trail line saying why. */
async function settle(moved: Array<{ child: WorkItem; level: number }>, item: WorkItem, by: string): Promise<void> {
  for (const { child, level } of moved) {
    const next = await load(child.id);
    const names = spaceNames(next.campaign_id);
    next.level = level as ItemLevel;
    if (names.kinds.find((one) => one.name === next.kind)?.level !== level) next.kind = kindAt(names, level);
    const line = lineOf(by, 'edit', { note: `level ${level}, kind ${next.kind}, following ${item.id}` });
    next.trail.push(line);
    await save(next);
    emitItemChanged({ item: next, line });
  }
}

const blank = (title: string, by: string): WorkItem => ({
  id: '', campaign_id: '', title, objective: '', level: 0, kind: '', status: '', flagged: false, priority: '', comments: [], parent: null,
  attachments: [], links: [], external: {}, trail: [], created: { at: new Date().toISOString(), by: by.trim() || 'unknown' },
});

/** An arrival under an item is announced to the parent's hearers (hearers), one queued
 * message each: its holders, and the watchers of the parent or an item above it. A parent
 * nobody holds or watches notifies nobody. */
async function announceArrival(item: WorkItem, by: string): Promise<string[]> {
  const parent = item.parent ? await readItem(item.parent) : null;
  if (!parent) return [];
  const { holders, watchers } = await hearers(parent, 'arrival', by);
  for (const { name, team } of holders) await enqueueMessage(name, `${item.id} ${item.title} was added under ${parent.id}, which ${team ? 'your team holds' : 'you hold'}. Handle it as you see fit.`, 'house', 'Work items');
  for (const { name, watches } of watchers) await enqueueMessage(name, `${item.id}${watching(item.id, watches)}: ${item.title} was added under ${parent.id}.`, 'house', 'Work items');
  return [...holders, ...watchers].map(({ name }) => name);
}

/** An unheld item not Done belongs on its Campaign's unheld list: every Coordinator in the
 * Campaign is told, in one message naming the item. With no Coordinator, nobody is told. */
async function announceUnheld(item: WorkItem, by: string): Promise<string[]> {
  if (item.status === 'Done' || (await holdersOf(item.id)).length || (await watchedIds()).has(item.id)) return [];
  const sessions = (await listSessions()).filter((session) => session.campaign_id === item.campaign_id && session.name !== by);
  const { readAgentComposition } = await import('./agent-composition.js');
  const told: string[] = [];
  for (const session of sessions) {
    const role = await readAgentComposition(session.name).then((found) => found.current.role).catch(() => 'coworker');
    if (role !== 'coordinator') continue;
    await enqueueMessage(session.name, `${item.id} '${item.title}' has no holders; place it.`, 'house', 'Work items');
    told.push(session.name);
  }
  return told;
}

/** Whether an epic (level 1) is at or above this item. */
async function underEpic(item: WorkItem | null): Promise<boolean> {
  for (let at = item; at; at = at.parent ? await readItem(at.parent) : null) if (at.level === 1) return true;
  return false;
}

/** Issue an id and write the item; born paired, its id is its Jira key. Unlocked: callers hold
 * the issuer. A create by an Agent (a live session) lands on its Team when it leads one, else on
 * itself; a lead of several names one (the holder), and an Agent's new item needs an epic above
 * it unless it is one. The owner, Ronin and the Jira bridge (a paired item) create as named. */
export async function createItemUnlocked(input: NewItem, by: string): Promise<Acknowledged> {
  const title = String(input.title ?? '').trim();
  if (!title) throw new WorkItemBadInput('A work item needs a title.');
  const parent = input.parent ? await load(input.parent) : null;
  const agent = input.jira ? undefined : (await listSessions()).find((session) => session.name === by);
  if (agent && !input.holder && agent.leads.length > 1) throw new WorkItemRefused(`You lead ${agent.leads.join(', ')}; name one with --team <team>.`);
  const holder: Holder | undefined = input.holder ?? (agent ? (agent.leads.length ? { kind: 'team', name: agent.leads[0]! } : { kind: 'agent', name: by }) : undefined);
  const campaign_id = input.campaign_id ?? agent?.campaign_id ?? await initialCampaignId();
  const names = spaceNames(campaign_id);
  const named = input.kind?.trim();
  const item: WorkItem = {
    ...blank(title, by),
    id: input.jira?.key ?? await nextId(),
    campaign_id,
    objective: String(input.objective ?? '').trim(),
    level: named ? levelOfKind(names, named) : levelUnder(parent),
    status: oneOf('status', input.status?.trim() || names.statuses[0]!, names.statuses),
    priority: oneOf('priority', input.priority?.trim() || names.priority, names.priorities),
    parent: parent?.id ?? null,
    attachments: input.attachments ?? [],
    external: input.jira ? { jira: { id: input.jira.id, key: input.jira.key } } : {},
  };
  if (agent && item.level !== 1 && !(await underEpic(parent))) throw new WorkItemRefused('A new item needs an epic above it: name one with --parent <id>.');
  await follow(item, item.parent, item.level);
  item.kind = named || kindAt(names, item.level);
  const list = holder ? await listFor(holder) : null;
  await save(item);
  if (list) { await list.set([...list.holds, item.id]); await ackHolds([holder ?? null], by); }
  const line = lineOf(by, 'create', { to: holder ? holderLabel(holder) : 'none', note: [item.title, item.parent ? `under ${item.parent}` : 'no parent'].join('; ') });
  item.trail.push(line);
  await save(item);
  emitItemChanged({ item, line });
  const notified = [...new Set([...await announceArrival(item, by), ...await announceUnheld(item, by)])];
  return { ...answer(item, line), notified };
}

export const createItem = (input: NewItem, by: string) => withIssuer(() => createItemUnlocked(input, by));

export interface ItemEdit {
  title?: string; objective?: string; status?: string; kind?: string; priority?: string;
  /** A new parent id, or null for none; absent leaves it. Parent is a field, as in Jira. */
  parent?: string | null;
  external?: { trello?: string; github?: string };
  /** The pair, or null to drop it; absent leaves it. */
  jira?: JiraPair | null;
}

/** One call, one trail line. A lone status change is named by its own op (a transition), a
 * lone parent change by move ("w39 moved under w40, level -1"); anything else is edit. A kind
 * sets the level; a new parent with no kind named sets the level one below it, or leaves it
 * with none (Jira's convert/move), and the kind becomes the space's first at that level. The
 * children follow under the one rule (follow). A line that changes nothing (a hand-in or a
 * promotion on an item already there, any empty edit) stays on the trail and acks nobody. */
export function editItem(id: string, edit: ItemEdit, by: string, note?: string): Promise<Acknowledged> {
  if (edit.title !== undefined && !String(edit.title).trim()) throw new WorkItemBadInput('title cannot be empty.');
  return withIssuer(async () => {
    const current = await load(id);
    const names = spaceNames(current.campaign_id);
    if (edit.status !== undefined) oneOf('status', edit.status.trim(), names.statuses);
    if (edit.priority !== undefined) oneOf('priority', edit.priority.trim(), names.priorities);
    const reparent = edit.parent !== undefined && edit.parent !== current.parent;
    const under = reparent && edit.parent ? await load(edit.parent) : null;
    const parent = reparent ? under?.id ?? null : current.parent;
    const named = edit.kind?.trim();
    const level = named ? levelOfKind(names, named) : under ? levelUnder(under) : current.level;
    const children = level !== current.level || reparent ? await follow(current, parent, level) : [];
    const kind = named || (level === current.level ? current.kind : kindAt(names, level));
    // The bridge storing the Jira key alone is not news: the rename that follows is told.
    let paired = false;
    let unchanged = false;
    const done = await appendTrail(id, by, (item) => {
      const changed: string[] = [];
      const before = item.status;
      const from = item.parent ?? 'none';
      if (reparent) { item.parent = parent; changed.push(`parent ${parent ?? 'none'}`); }
      if (level !== item.level) { item.level = level; changed.push(`level ${item.level}`); }
      if (edit.title !== undefined && edit.title.trim() !== item.title) { item.title = edit.title.trim(); changed.push('title'); }
      if (edit.objective !== undefined && edit.objective.trim() !== item.objective) { item.objective = edit.objective.trim(); changed.push('objective'); }
      if (edit.status !== undefined && edit.status.trim() !== item.status) { item.status = edit.status.trim(); changed.push(`status ${item.status}`); }
      if (kind !== item.kind) { item.kind = kind; changed.push(`kind ${kind}`); }
      const priority = edit.priority?.trim();
      if (priority !== undefined && priority !== item.priority) { item.priority = priority; changed.push(`priority ${priority}`); }
      if (edit.jira !== undefined && JSON.stringify(edit.jira ?? undefined) !== JSON.stringify(item.external.jira)) {
        if (edit.jira) item.external.jira = { id: edit.jira.id, key: edit.jira.key }; else delete item.external.jira;
        changed.push(`jira ${item.external.jira?.key ?? 'cleared'}`);
      }
      for (const [key, value] of Object.entries(edit.external ?? {}) as Array<['trello' | 'github', string]>) {
        if ((item.external[key] ?? '') === value.trim()) continue;
        if (value.trim()) item.external[key] = value.trim(); else delete item.external[key];
        changed.push(`${key} ${item.external[key] ?? 'cleared'}`);
      }
      const said = note || undefined;
      paired = changed.length === 1 && changed[0]!.startsWith('jira ') && Boolean(item.external.jira);
      unchanged = !changed.length;
      if (changed.length === 1 && changed[0]!.startsWith('status ')) return { op: 'status', from: before, to: item.status, note: said };
      if (reparent && changed.every((what) => /^(parent|level|kind) /.test(what))) return { op: 'move', from, to: parent ?? 'none', note: `level ${item.level}` };
      return { op: 'edit', note: [said, changed.length ? changed.join(', ') : 'no change'].filter(Boolean).join('; ') };
    }, () => !paired && !unchanged);
    await settle(children, done.item, by);
    return reparent ? { ...done, notified: await announceArrival(done.item, by) } : done;
  });
}

/** The bridge, in-process, sets a paired item's Jira fields; no route writes them. With a note
 * (a Sprint or Due date change) it is a trail line the holders hear; without, it is saved with
 * no line, since Rank moves with every drag in the backlog. */
export function setJiraFields(id: string, fields: Record<string, string>, by: string, note?: string): Promise<unknown> {
  return withIssuer(async () => {
    if (note) return appendTrail(id, by, (item) => { item.jiraFields = fields; return { op: 'edit', note }; });
    const item = await load(id);
    item.jiraFields = fields;
    await save(item);
  });
}

/** A comment, as Jira's: who, when, what. One trail line, so the holder hears of it like any write. */
export async function addComment(id: string, words: string, by: string): Promise<Acknowledged> {
  const text = String(words ?? '').trim();
  if (!text) throw new WorkItemBadInput('a comment needs its text.');
  return withIssuer(() => appendTrail(id, by, (item) => {
    item.comments.push({ by: by.trim() || 'unknown', at: new Date().toISOString(), text });
    return { op: 'comment', note: text };
  }));
}

/** Jira's Add flag / Remove flag: the impediment set or cleared, a reason given becoming an
 * ordinary comment, in one trail line. */
export async function flagItem(id: string, flagged: boolean, reason: string | undefined, by: string): Promise<Acknowledged> {
  const text = String(reason ?? '').trim();
  return withIssuer(() => appendTrail(id, by, (item) => {
    item.flagged = flagged;
    if (text) item.comments.push({ by: by.trim() || 'unknown', at: new Date().toISOString(), text });
    return { op: 'flag', to: String(flagged), note: text || undefined };
  }));
}

/** Change comment n (from 1), as Jira's comment edit; the trail line carries the new text. */
export async function editComment(id: string, n: number, words: string, by: string): Promise<Acknowledged> {
  const text = String(words ?? '').trim();
  if (!text) throw new WorkItemBadInput('a comment needs its text.');
  return withIssuer(() => appendTrail(id, by, (item) => {
    const comment = item.comments[n - 1];
    if (!Number.isInteger(n) || !comment) throw new WorkItemBadInput(`${id} has ${item.comments.length} comment(s); there is no comment ${n}.`);
    comment.text = text;
    comment.edited = new Date().toISOString();
    return { op: 'comment', from: String(n), note: text };
  }));
}

/** Attachments live on the item: an absolute path that exists when attached, or a link (a file kept in Jira). */
function attachment(target: string, remove: boolean): string {
  const at = String(target ?? '').trim();
  if (!at) throw new WorkItemBadInput('name the document to attach.');
  if (/^https?:\/\//.test(at)) return at;
  if (!path.isAbsolute(at)) throw new WorkItemBadInput(`${at} is not an absolute path.`);
  if (!remove) {
    if (!existsSync(at)) throw new WorkItemBadInput(`no such file: ${at}`);
    if (statSync(at).isDirectory()) throw new WorkItemBadInput(`${at} is a directory; attach documents.`);
  }
  return at;
}

export async function attachDoc(id: string, target: string, by: string, remove = false): Promise<Acknowledged> {
  const at = attachment(target, remove);
  return withIssuer(() => appendTrail(id, by, (item) => {
    const kept = item.attachments.filter((doc) => doc !== at);
    item.attachments = remove ? kept : [at, ...kept];
    return { op: 'attach', to: at, ...(remove ? { from: 'removed' } : {}) };
  }));
}

/** Jira's issue link, by the space's link type name (Blocks: this item blocks `to`). Kept on
 * this item; a read of the other shows it inward. */
export async function linkItem(id: string, type: string, to: string, by: string, remove = false): Promise<Acknowledged> {
  return withIssuer(async () => {
    oneOf('a link', type, spaceNames((await load(id)).campaign_id).links);
    await load(to);
    return appendTrail(id, by, (item) => {
      const same = (link: Link) => link.type === type && link.to === to;
      if (remove) item.links = item.links.filter((link) => !same(link));
      else if (!item.links.some(same)) item.links.push({ type, to });
      return { op: 'link', to, note: `${type} ${to}${remove ? ': link removed' : ''}` };
    });
  });
}

/** Jira's delete. The item goes, and with it its subtasks (as Jira deletes an issue's
 * subtasks); any other child is left with no parent (as an epic's children are). Links to
 * it go, every holder lets go of it, and each holding Agent is told. */
export function deleteItem(id: string, by: string): Promise<{ deleted: string[]; orphaned: string[] }> {
  return withIssuer(async () => {
    await load(id);
    const all = await listItems();
    const deleted: string[] = [];
    const collect = (at: string): void => {
      deleted.push(at);
      for (const child of all.filter((other) => other.parent === at && other.level === -1 && !deleted.includes(other.id))) collect(child.id);
    };
    collect(id);
    const orphaned: string[] = [];
    for (const other of all.filter((item) => !deleted.includes(item.id))) {
      const orphan = other.parent !== null && deleted.includes(other.parent);
      const links = other.links.filter((link) => !deleted.includes(link.to));
      if (!orphan && links.length === other.links.length) continue;
      const lines: TrailLine[] = [];
      if (orphan) {
        lines.push(lineOf(by, 'move', { from: other.parent!, to: 'none', note: `level ${other.level}; ${other.parent} was deleted` }));
        other.parent = null;
        orphaned.push(other.id);
      }
      if (links.length !== other.links.length) lines.push(lineOf(by, 'link', { note: 'links to deleted items removed' }));
      other.links = links;
      other.trail.push(...lines);
      await save(other);
      for (const line of lines) emitItemChanged({ item: other, line });
      await ackHolders(other, lines[0]!);
    }
    for (const at of deleted) {
      await ackHolds(await takeOffEveryList(at), by);
      await rm(fileOf(at));
    }
    await rewriteWatches((watches) => watches.filter((watched) => !deleted.includes(watched)));
    return { deleted, orphaned };
  });
}

/** Keystone 3: a paired item's Ronin id is its Jira key. One call rewrites the item's file and
 * id, each child's parent, every link pointing at it, and each holder's holds; the item gets one
 * trail line, "renamed from <old>", and its holding Agents are told. Trails, comments,
 * receipts and the promotion ledger stay as written. */
export function renameItem(from: string, to: string, by: string): Promise<Acknowledged> {
  return withIssuer(async () => {
    const item = await load(from);
    item.id = to;
    for (const other of await listItems()) {
      if (other.id === from || (other.parent !== from && !other.links.some((link) => link.to === from))) continue;
      if (other.parent === from) other.parent = to;
      other.links = other.links.map((link) => link.to === from ? { ...link, to } : link);
      await save(other);
    }
    for (const list of await heldLists()) {
      if (list.holds.includes(from)) await list.set(list.holds.map((id) => id === from ? to : id));
    }
    await rewriteWatches((watches) => watches.map((id) => id === from ? to : id));
    const line = lineOf(by, 'rename', { from, to, note: `renamed from ${from}` });
    item.trail.push(line);
    await save(item);
    await rm(fileOf(from));
    emitItemChanged({ item, line });
    for (const { name } of (await hearers(item, 'rename', by)).holders) await enqueueMessage(name, `${from} is now ${to} (its Jira key); nothing to do.`, 'house', 'Work items');
    return answer(item, line);
  });
}

/* HOLDING — a list of item ids on each Team (roster.holds) and each Agent (the letter's
 * holds). Assignment adds an id; handoff removes the giver and adds the receiver. Neither
 * touches the item's content or parent, and both run under the issuer lock. */

export type Holder = { kind: 'team' | 'agent'; name: string };
export const holderLabel = (holder: Holder): string => `${holder.kind}:${holder.name}`;

interface HeldList { holder: Holder; holds: string[]; set(holds: string[]): Promise<unknown> }

async function heldLists(): Promise<HeldList[]> {
  const teams = (await listTeamRosters()).map((roster): HeldList => ({
    holder: { kind: 'team', name: roster.name },
    holds: roster.holds,
    set: (holds) => writeTeamRoster(roster.name, { holds }, roster.campaign_id),
  }));
  const agents = (await listLetterHolds()).map((letter): HeldList => ({
    holder: { kind: 'agent', name: letter.name },
    holds: letter.holds,
    set: (holds) => writeLetterHolds(letter.key, holds),
  }));
  return [...teams, ...agents];
}

async function listFor(holder: Holder): Promise<HeldList> {
  if (holder.kind === 'team') {
    const roster = await readTeamRoster(holder.name);
    if (!roster) throw new WorkItemBadInput(`Team "${holder.name}" has no roster.`);
    return { holder, holds: roster.holds, set: (holds) => writeTeamRoster(roster.name, { holds }, roster.campaign_id) };
  }
  const letter = await letterOf(holder.name, 'hold work in');
  return { holder, holds: letter.holds, set: (holds) => writeLetterHolds(letter.key, holds) };
}

async function letterOf(name: string, to: string) {
  const key = await sessionKey(name);
  const letter = await readLetterHolds(key) ?? (await seedTegami(name) ? await readLetterHolds(key) : null);
  if (!letter) throw new WorkItemBadInput(`Agent "${name}" has no work record to ${to}.`);
  return letter;
}

/** Every id on any holder's list, with the holder that has it. */
export async function heldIds(): Promise<Map<string, Holder>> {
  const out = new Map<string, Holder>();
  for (const list of await heldLists()) for (const id of list.holds) out.set(id, list.holder);
  return out;
}

/** Who holds this id now: nobody, or (after any old race) everyone found with it. */
export async function holdersOf(id: string): Promise<Holder[]> {
  return (await heldLists()).filter((list) => list.holds.includes(id)).map((list) => list.holder);
}

async function takeOffEveryList(id: string, except?: Holder): Promise<Holder[]> {
  const from: Holder[] = [];
  for (const list of await heldLists()) {
    if (!list.holds.includes(id)) continue;
    from.push(list.holder);
    if (except && holderLabel(list.holder) === holderLabel(except)) continue;
    await list.set(list.holds.filter((held) => held !== id));
  }
  return from;
}

const labels = (holders: Holder[]): string => holders.length ? holders.map(holderLabel).join(', ') : 'none';

/** The ack (tegami.ts ackRecord) to every Agent whose holds this move changed; a Team's holds are its roster, so its lead's. */
async function ackHolds(holders: Array<Holder | null>, by: string): Promise<void> {
  const seen = new Set<string>();
  for (const holder of holders) {
    if (!holder || seen.has(holderLabel(holder))) continue;
    seen.add(holderLabel(holder));
    await (holder.kind === 'agent' ? ackRecord(holder.name, by) : teamChanged([holder.name], by));
  }
}

export async function assignUnlocked(id: string, to: Holder, by: string, note?: string): Promise<Acknowledged> {
  await load(id);
  const target = await listFor(to);
  if (!target.holds.includes(id)) await target.set([...target.holds, id]);
  await ackHolds(to.kind === 'agent' ? [] : [to], by);
  return appendTrail(id, by, () => ({ op: 'assign', to: holderLabel(to), note }));
}

export const assignItem = (id: string, to: Holder, by: string, note?: string) => withIssuer(() => assignUnlocked(id, to, by, note));

/** The giver comes off and the receiver goes on in the same issuer step. `to` null is how
 * a holder lets go; any other holders remain. */
export function handoffItem(id: string, from: Holder, to: Holder | null, by: string, note?: string): Promise<Acknowledged> {
  return withIssuer(async () => {
    const item = await load(id);
    const source = await listFor(from);
    if (source.holds.includes(id)) await source.set(source.holds.filter((held) => held !== id));
    if (to) {
      const target = await listFor(to);
      if (!target.holds.includes(id)) await target.set([...target.holds, id]);
    }
    await ackHolds([from, to].filter((holder) => holder?.kind !== 'agent' || holderLabel(holder) !== holderLabel(to ?? from)) as Holder[], by);
    const done = await appendTrail(id, by, () => ({ op: 'handoff', from: holderLabel(from), to: to ? holderLabel(to) : 'none', note }));
    const notified = await announceUnheld(item, by);
    return notified.length ? { ...done, notified } : done;
  });
}

/** Park: the id leaves every list. It is found again under its parent, or unassigned. */
export function releaseItem(id: string, by: string, note?: string): Promise<Acknowledged> {
  return withIssuer(async () => {
    await load(id);
    const from = await takeOffEveryList(id);
    await ackHolds(from, by);
    return appendTrail(id, by, () => ({ op: 'release', from: labels(from), to: 'none', note }));
  });
}

/* WATCHING — a list of item ids beside the holds, on each Agent's letter and each Team's
 * roster: what it tracks without holding. Watching changes no holds and no item, and adds no
 * trail line; the watcher (a Team's lead) hears the WATCHED moves on the item and everything
 * under it (hearers). */

/** Watch adds the id to the watcher's watches; unwatch takes it off (a deleted item too). */
export function watchItem(id: string, watcher: Holder, watch: boolean): Promise<{ id: string; watches: string[] }> {
  return withIssuer(async () => {
    const list = await watchListFor(watcher);
    const kept = list.watches.filter((watched) => watched !== id);
    const watches = watch ? [...kept, id] : kept;
    await list.set(watches);
    return { id, watches };
  });
}

async function watchListFor(watcher: Holder): Promise<{ watches: string[]; set(watches: string[]): Promise<unknown> }> {
  if (watcher.kind === 'team') {
    const roster = await readTeamRoster(watcher.name);
    if (!roster) throw new WorkItemBadInput(`Team "${watcher.name}" has no roster.`);
    return { watches: roster.watches, set: (watches) => writeTeamRoster(roster.name, { watches }, roster.campaign_id) };
  }
  const letter = await letterOf(watcher.name, 'watch from');
  return { watches: letter.watches, set: (watches) => writeLetterWatches(letter.key, watches) };
}

/** Every id on an Agent's or a Team's watches: a watched item is off the unheld list. */
export async function watchedIds(): Promise<Set<string>> {
  return new Set([...(await listLetterHolds()), ...(await listTeamRosters())].flatMap((list) => list.watches));
}

async function rewriteWatches(change: (watches: string[]) => string[]): Promise<void> {
  for (const letter of await listLetterHolds()) {
    const watches = change(letter.watches);
    if (watches.join() !== letter.watches.join()) await writeLetterWatches(letter.key, watches);
  }
  for (const roster of await listTeamRosters()) {
    const watches = change(roster.watches);
    if (watches.join() !== roster.watches.join()) await writeTeamRoster(roster.name, { watches }, roster.campaign_id);
  }
}

/** What the act did, read from its trail line alone: "w39 moved under w40, level -1",
 * "w9 moved to In Progress", "w9 is held by agent:x", "w12 was created". Status, kind and level
 * appear only when the act changed them. Every acknowledgement is this one line. */
export function didLine({ item, line }: Acknowledged): string {
  const what = line.op === 'status' ? `moved to ${line.to}`
    : line.op === 'move' ? (line.to === 'none' ? `moved to no parent, ${line.note}` : `moved under ${line.to}, ${line.note}`)
      : line.op === 'assign' ? `is held by ${line.to}`
        : line.op === 'handoff' ? (line.to === 'none' ? `${line.from} let go` : `was handed from ${line.from} to ${line.to}`)
        : line.op === 'release' || line.op === 'holder-ended' ? (line.to && line.to !== 'none' ? `went back to ${line.to}` : 'is held by nobody')
          : line.op === 'create' ? 'was created'
          : line.op === 'rename' ? `was renamed from ${line.from}`
              : line.op === 'comment' ? (line.from ? `comment ${line.from} was edited` : `has a comment from ${line.by}: ${line.note}`)
              : line.op === 'flag' ? `is ${line.to === 'true' ? 'flagged' : 'unflagged'}${line.note ? `: ${line.note}` : ''}`
              : line.op === 'attach' ? (line.from === 'removed' ? `has ${line.to} removed` : `has ${line.to} attached`)
              : line.op === 'link' ? `${line.note}`
              : `changed: ${line.note ?? 'no change'}`;
  return `${item.id} ${what}`;
}

/** An Agent going away takes its lists with it: it watches nothing, and each item it held gets
 * one holder-ended line and goes back to its Team when its letter names exactly one, else to
 * nobody, found again under its parent or unassigned. A Done item goes to nobody, and nobody is
 * told: Done work needs no holder. Restore does not reclaim. */
export function releaseHolder(session: string, key: string, how: string): Promise<Acknowledged[]> {
  return withIssuer(async () => {
    const letter = await readLetterHolds(key);
    if (letter?.watches.length) await writeLetterWatches(key, []);
    if (!letter?.holds.length) return [];
    const team = letter.teams.length === 1 ? await readTeamRoster(letter.teams[0]!) : null;
    const released: Acknowledged[] = [];
    // Off the list first, so the ended Agent is not acked for its own release.
    await writeLetterHolds(key, []);
    for (const id of letter.holds) {
      const item = await readItem(id);
      if (!item) continue;
      const line = lineOf('ronin', 'holder-ended', { from: `agent:${session}`, to: 'none', note: how });
      if (item.status === 'Done') {
        item.trail.push(line);
        await save(item);
        emitItemChanged({ item, line });
        released.push(answer(item, line));
        continue;
      }
      if (team) await writeTeamRoster(team.name, { holds: [...new Set([...(await readTeamRoster(team.name))!.holds, id])] }, team.campaign_id);
      released.push(await appendTrail(id, 'ronin', () => ({ op: 'holder-ended', from: line.from, to: team ? `team:${team.name}` : 'none', note: how })));
    }
    return released;
  });
}

/** The Jira bridge's word to an item's holding Agents, when a change of theirs was not sent. */
export async function tellHolders(id: string, text: string): Promise<void> {
  const item = await readItem(id);
  if (item) for (const { name } of (await hearers(item, null, '')).holders) await enqueueMessage(name, text, 'house', 'Work items');
}

/* THE ONE MIGRATION, at server start: kind, priority and link type take Jira's own name where
 * one matches but for case (task → Task, high → High, blocks → Blocks); an item with no
 * priority takes Jira's default; the level is the kind's. A second run changes nothing. */
export function migrateItems(by = 'ronin'): Promise<{ before: number; migrated: string[] }> {
  return withIssuer(async () => {
    const items = await listItems();
    const exact = (names: string[], value: string) => names.find((name) => name.toLowerCase() === value.toLowerCase()) ?? value;
    const migrated: string[] = [];
    for (const item of items) {
      const was = JSON.stringify(item);
      item.kind = exact(JIRA_NAMES.kinds.map((one) => one.name), item.kind ?? '');
      item.level = JIRA_NAMES.kinds.find((one) => one.name === item.kind)?.level ?? item.level;
      item.priority = item.priority ? exact(JIRA_NAMES.priorities, item.priority) : JIRA_NAMES.priority;
      item.links = item.links.map((link) => ({ ...link, type: exact(JIRA_NAMES.links, link.type) }));
      if (JSON.stringify(item) === was) continue;
      item.trail.push(lineOf(by, 'edit', { note: `Jira's names: kind ${item.kind}, priority ${item.priority}${item.links.length ? `, links ${item.links.map((link) => link.type).join(', ')}` : ''}` }));
      await save(item);
      migrated.push(item.id);
    }
    return { before: items.length, migrated };
  });
}
