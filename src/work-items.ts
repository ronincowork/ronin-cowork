/**
 * THE WORK ITEM STORE — one item type, stored once, keyed by id.
 *
 * The only module that reads or writes an item file. Everything else reaches items through
 * the /api/work-items routes (src/routes/work-items-api.ts), and every change here appends
 * exactly one line to the item's trail, naming who called (a quiet Jira fields refresh aside,
 * setJiraFields). Nothing is locked against
 * anyone: holding is discovery, never permission. One rule of Ronin's own: nothing goes below -1
 * (follow); beside it only Jira's level and parent rules (jiraShape). An Agent creates any kind,
 * with a parent or none (owner, 2026-11-06).
 *
 * THE SHAPE MATCHES JIRA (docs/using-ronin/work-items.md). One object at every level, and one
 * exact value (ronin-services docs/jira-bridge.md, What flows each way): `status`, `kind`, `priority` and a link's
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
import { listLetterHolds, readLetterHolds, seedTegami, writeLetterHolds, writeLetterWatches } from './tegami.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { initialCampaignId } from './campaign-scope.js';
import { listSessions } from './tmux.js';
import { emitItemChanged } from './sockets.js';
import { listWorkspaceHolds, readWorkspace, readWorkspaceHolds, writeWorkspaceHolds } from './workspaces.js';

export const ITEM_LEVELS = [1, 0, -1] as const;
export const TRAIL_OPS = ['create', 'assign', 'handoff', 'release', 'move', 'status', 'edit', 'comment', 'flag', 'attach', 'link', 'holder-ended', 'rename', 'delete'] as const;

export type ItemLevel = typeof ITEM_LEVELS[number];
export type TrailOp = typeof TRAIL_OPS[number];

export interface TrailLine { at: string; by: string; op: TrailOp; from?: string; to?: string; note?: string }
/** The pair (ronin-services docs/jira-bridge.md, Pairing): the Jira issue's id, which never changes, and the
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
/** Whether the bridge has named this campaign's space: a Jira-connected campaign. */
export const jiraConnected = (campaign: string): boolean => SPACES.has(campaign);
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

/** THE SHAPES JIRA REFUSES (docs/using-ronin/work-items.md; ronin-services docs/jira-bridge.md, Pairing: the
 * live failures): on a Jira-connected campaign an item may not take a parent or kind Jira's
 * hierarchy would refuse, so Ronin and Jira never part. An epic sits under nothing; a level-0
 * item (Task, Story, Bug, Feature) under an epic or nothing; a Subtask only under a level-0
 * item; and a paired item never changes kind across levels, nor does a paired child made to
 * follow. Jira's own changes (by jira:*) are Jira's shape already and are not checked. */
function jiraShape(campaign: string, by: string, item: { id: string; kind: string; level: number; paired: boolean; was?: number }, parent: WorkItem | null): void {
  if (!jiraConnected(campaign) || by.startsWith('jira:')) return;
  const refuse = (why: string) => { throw new WorkItemRefused(`Jira would refuse this, so Ronin does too: ${why}`); };
  const named = item.id ? `${item.id} (${item.kind})` : `a ${item.kind}`;
  if (item.paired && item.was !== undefined && item.was !== item.level) refuse(`${named} is on Jira, and Jira cannot change a work item's kind across levels; make a new item instead.`);
  const under = parent ? `${parent.id} is a ${parent.kind}` : 'it has no parent';
  if (item.level === 1 && parent) refuse(`an epic goes under nothing; ${under}.`);
  if (item.level === 0 && parent && parent.level !== 1) refuse(`${named} goes only under an epic or nothing; ${under}.`);
  if (item.level === -1 && parent?.level !== 0) refuse(`a Subtask goes only under a Task, Story, Bug or Feature; ${under}.`);
}

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
  /** The last hand-in: the Agent that handed it in, and when. Send back returns it there. */
  handed_in?: { by: string; at: string };
  /** THE HAND-IN SIGNAL (docs/using-ronin/project-management.md, Three signals): every accepted hand-in, oldest first, even
   * one never promoted; `receipt` null for a checkout's (no desk, no code to promote). */
  hand_ins?: HandIn[];
  /** THE PROMOTION SIGNAL (6a): the last promotion that carried a hand-in of this item to dev.
   * Not a status: the item stays In Review, and Jira is not touched. */
  on_dev?: { promotion: string; at: string };
  /** ARCHIVED (owner, 2026-11-05; KAN-266): Done five days, so off every holder list, the Epics
   * workbench and default search; `item read` still finds it. Ronin's alone: never sent to Jira.
   * An item that leaves Done is no longer archived (save). */
  archived?: { at: string };
}

export interface HandIn { receipt: string | null; by: string; at: string }

/** Where a handed-in item waits (6a): 'lead' only when its last recorded hand-in came from a
 * desk (a receipt) and no promotion has put it on dev since, for the lead to review and promote;
 * else 'ready', for the person to try. An item with no hand-ins recorded (handed in before the
 * signals were kept, its code already on dev) is ready, as is a checkout's (no code to promote). */
export function handInStage(item: Pick<WorkItem, 'hand_ins' | 'on_dev'>): 'lead' | 'ready' {
  const last = item.hand_ins?.at(-1);
  if (!last || last.receipt === null) return 'ready';
  return item.on_dev && item.on_dev.at >= last.at ? 'ready' : 'lead';
}

/* THE NOTES A USER READS (docs/using-ronin/project-management.md, How an item lives): two
 * comments headed by their words, so Jira shows them as Ronin does. "Handed in: <note>" is what
 * the user can try, written at a hand-in (--note, at most 280 characters; no commit ids, no
 * receipts: those stay on the trail). "Handover from <agent>: <note>" is where an item stands
 * and what is next, written when an ending Agent hands it over (handoverItem). */
export const HANDED_IN = 'Handed in: ';
export const HANDOVER_FROM = 'Handover from ';
export const NOTE_MAX = 280;
export const NOTE_TOO_LONG = 'Keep it for the user: what they can try. The detail is in the diff.';

/** What is wrong with a hand-in note, or null: only its length, at most NOTE_MAX characters. */
export function handInNoteProblem(note: string | undefined): string | null {
  const text = String(note ?? '').trim();
  return text.length > NOTE_MAX ? `${NOTE_TOO_LONG} (${text.length} characters; at most ${NOTE_MAX}.)` : null;
}

/** The item's last Handed in note, without its heading; '' with none. */
export function handedInNote(item: Pick<WorkItem, 'comments'>): string {
  const comment = [...(item.comments ?? [])].reverse().find((one) => one.text.startsWith(HANDED_IN));
  return comment ? comment.text.slice(HANDED_IN.length) : '';
}

/** What every write answers: the item as it now is, the line it appended, and who its notices
 * told (section 4). What the act did is read from the line (didLine). */
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
  // Leaving Done (a Send back, a Jira reopen, any transition) brings an archived item back.
  if (item.archived && item.status !== DONE) delete item.archived;
  await mkdir(dir(), { recursive: true });
  const target = fileOf(item.id);
  const tmp = `${target}.tmp-${process.pid}-${++written}`;
  await writeFile(tmp, `${JSON.stringify(item, null, 2)}\n`, 'utf8');
  await rename(tmp, target);
}

/** EVERY ID AN ITEM HAS HAD still finds it (docs/using-ronin/work-items.md): a w id renamed to
 * its Jira key is an alias, read from the item's "rename" trail lines, so nothing is stored
 * twice. Found aliases are remembered; one that no longer leads to a file is looked up again. */
const aliases = new Map<string, string>();
async function aliasOf(id: string): Promise<string | null> {
  const known = aliases.get(id);
  if (known && existsSync(fileOf(known))) return known;
  aliases.clear();
  let names: string[];
  try { names = await readdir(dir()); } catch { return null; }
  for (const name of names) {
    if (!name.endsWith('.json') || !isItemId(name.slice(0, -5))) continue;
    const item = await readFile(path.join(dir(), name), 'utf8').then((text) => JSON.parse(text) as WorkItem).catch(() => null);
    for (const line of item?.trail ?? []) if (line.op === 'rename' && line.from) aliases.set(line.from, item!.id);
  }
  return aliases.get(id) ?? null;
}

/** The id an item goes by now, given any id it has had; a refusal when none matches. */
export async function resolveId(id: string): Promise<string> {
  const given = String(id ?? '').trim();
  if (!isItemId(given)) throw new WorkItemMissing(`"${given}" is not a work item id; ids look like w12 or KAN-65.`);
  if (existsSync(fileOf(given))) return given;
  const now = await aliasOf(given);
  if (!now) throw new WorkItemMissing(`No work item ${given}.`);
  return now;
}

async function load(id: string): Promise<WorkItem> {
  const at = await resolveId(id);
  try {
    return JSON.parse(await readFile(fileOf(at), 'utf8')) as WorkItem;
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

/** Append one trail line and save; `news` false keeps the line from the notices (noticesOf). */
export async function appendTrail(id: string, by: string, change: (item: WorkItem) => Omit<TrailLine, 'at' | 'by'>, news: (line: TrailLine) => boolean = () => true): Promise<Acknowledged> {
  const item = await load(id);
  const { op, ...extra } = change(item);
  const line = lineOf(by, op, extra);
  item.trail.push(line);
  await save(item);
  emitItemChanged({ item, line });
  const notified = news(line) ? await noticesOf(item, line) : [];
  return notified.length ? { ...answer(item, line), notified } : answer(item, line);
}

/* NOTICES (docs/using-ronin/project-management.md, Who is told what): a notice tells someone something they must act on,
 * and there are six, sent from here and nowhere else in the store:
 *   1. a hand-in, to the lead of the hander's Team: a desk's own message (desks/lead.ts)
 *      is the notice, so only a checkout's is sent here (handInUnlocked);
 *   2. a call for help, a flag raised, to each Team holding the item and
 *      the lead of the Team above the item or the holder of the epic above it (helpOf); a handover's --flag also tells the lead of the Team it
 *      goes to (handoverItem), and an Agent ended without a handover flags its unfinished items,
 *      its receiving Team's lead told once, every item listed (releaseHolder);
 *   3. a status change, to a watcher of that item, not of an item above it (tellWatchers), and
 *      to each Team holding it, never to anyone the hand-in already told;
 *   4. someone else's change on an item: a comment, to everyone holding or watching it; a Send back (sendBack), a Jira change that beat theirs
 *      (tellHolders), to the Agent working it;
 *   5. a Jira item with nobody, to the Campaign's Coordinator (traffic_control) to place it
 *      (announceUnheld); a Ronin item never goes there;
 *   6. a move to Done (Accept, item transition or Jira), to each live Agent holding the item
 *      (for an older item a Team holds, the Agents in its hand-ins), once, never to the one who
 *      moved it (noticesOf, handersOf); a Team holding it hears it through its lead, as 3.
 * Nothing else: not a new item, a start, a holder change, an Agent's own end, an attachment, a
 * rename, a delete or a flag cleared. Nobody hears their own change. Every notice resolves its people
 * through namesOf: an Agent is itself, a Team its live lead(s), else no one. A Team is told as
 * the item's holder or watcher, or as holder of the epic above: its members' items do not make
 * it one. ONE NOTICE PER PERSON PER COMMAND: inside oneNoticePerCommand (every route runs in one)
 * what one person is told is gathered and sent as one message when the command ends. */
const gathering = new AsyncLocalStorage<Map<string, string[]>>();

async function notice(name: string, text: string): Promise<void> {
  const gathered = gathering.getStore();
  if (!gathered) return void await enqueueMessage(name, text, 'house', 'Work items');
  const said = gathered.get(name) ?? [];
  if (!said.includes(text)) said.push(text);
  gathered.set(name, said);
}

/** Run one command; each person it would tell gets one message, its lines together. */
export async function oneNoticePerCommand<T>(command: () => Promise<T>): Promise<T> {
  if (gathering.getStore()) return command();
  const gathered = new Map<string, string[]>();
  try { return await gathering.run(gathered, command); } finally {
    for (const [name, said] of gathered) await enqueueMessage(name, said.join('\n'), 'house', 'Work items').catch((error) => console.error(`[work-items] notice to ${name}:`, error));
  }
}

/** The notices a trail line sends, by its op: a status change to the item's watchers, a flag
 * raised to whoever helps (helpOf), a comment to the Agents holding the item. Answers who was told. */
async function noticesOf(item: WorkItem, line: TrailLine): Promise<string[]> {
  if (line.op === 'status') {
    // Notice 6: a move to Done tells the Agents holding it, each once, while alive.
    const done = line.to === DONE ? await handersOf(item, line.by) : [];
    for (const name of done) await notice(name, `${item.id} '${item.title}' is Done (accepted by ${line.by}).`);
    const text = `${item.id}: status ${line.from} → ${line.to} by ${line.by}.`;
    const watching = await tellWatchers(item, text, [line.by, ...done]);
    return [...done, ...watching];
  }
  if (line.op === 'flag' && line.to === 'true') {
    const teams = (await holdersOf(item.id)).filter((holder) => holder.kind === 'team');
    const told = [...new Set([...(await namesOf(teams)), ...(await helpOf(item))])].filter((name) => name !== line.by);
    for (const name of told) await notice(name, `${item.id} '${item.title}' needs help${line.note ? `: ${line.note}` : ''} (flagged by ${line.by}).`);
    return told;
  }
  if (line.op === 'comment' && !line.from) {
    const told = (await namesOf([...(await holdersOf(item.id)), ...(await watchersOf(item.id))])).filter((name) => name !== line.by);
    for (const name of told) await notice(name, `${item.id}: a comment from ${line.by}: ${line.note}`);
    return told;
  }
  return [];
}

/** Who hears an item is Done (notice 6): the Agents holding it; for an older item a Team holds
 * (handed in before KAN-269 kept the hold), the Agents in its hand-ins. Each once, alive, not `except`. */
async function handersOf(item: WorkItem, except: string): Promise<string[]> {
  const held = await holdersOf(item.id);
  const handers = new Set(held.filter((one) => one.kind === 'agent').map((one) => one.name));
  if (held.some((one) => one.kind === 'team')) for (const one of [...(item.hand_ins ?? []).map((hand) => hand.by), ...(item.handed_in ? [item.handed_in.by] : [])]) handers.add(one);
  handers.delete(except);
  if (!handers.size) return [];
  const live = new Set((await listSessions().catch(() => [])).map((one) => one.name));
  return [...handers].filter((name) => live.has(name));
}

/** The Agents holding an item: who works it. */
const agentsOn = async (id: string): Promise<string[]> => (await holdersOf(id)).filter((holder) => holder.kind === 'agent').map((holder) => holder.name);

/** Who a notice reaches, the one resolution every notice uses (KAN-307): an Agent is itself; a
 * Team is its live lead(s), and with no lead alive, no one. Each name once. */
async function namesOf(holders: Holder[]): Promise<string[]> {
  const teams = holders.filter((holder) => holder.kind === 'team').map((holder) => holder.name);
  const leads = teams.length ? (await listSessions().catch(() => [])).filter((session) => session.leads.some((led) => teams.includes(led))).map((session) => session.name) : [];
  return [...new Set([...holders.filter((holder) => holder.kind === 'agent').map((holder) => holder.name), ...leads])];
}

/** Who watches an item: each Agent whose letter lists it, each Team whose roster does. */
async function watchersOf(id: string): Promise<Holder[]> {
  const agents = (await listLetterHolds()).filter((letter) => letter.watches.includes(id)).map((letter): Holder => ({ kind: 'agent', name: letter.name }));
  const teams = (await listTeamRosters()).filter((roster) => roster.watches.includes(id)).map((roster): Holder => ({ kind: 'team', name: roster.name }));
  return [...agents, ...teams];
}

/** Who hears a call for help: going up from the item's parent, the first item anyone holds
 * names them: the lead of each Team holding it, and each Agent holding it (an epic_lead). */
async function helpOf(item: WorkItem): Promise<string[]> {
  for (let at = item.parent ? await readItem(item.parent) : null; at; at = at.parent ? await readItem(at.parent) : null) {
    const held = await holdersOf(at.id);
    if (!held.length) continue;
    return namesOf(held);
  }
  return [];
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

/** Notice 5: a Jira item (one made on Jira, created.by jira:<user>) held and watched by nobody
 * and not Done is for its Campaign's Coordinator (traffic_control) to place: each one is told,
 * in one message naming the item. A Ronin item put back sits on its epic for the lead and
 * tells nobody. With no Coordinator, nobody is told. */
async function announceUnheld(item: WorkItem, by: string): Promise<string[]> {
  if (!item.created.by.startsWith('jira:') || item.status === 'Done' || (await holdersOf(item.id)).length || (await watchedIds()).has(item.id)) return [];
  const sessions = (await listSessions()).filter((session) => session.campaign_id === item.campaign_id && session.name !== by);
  const { readAgentComposition } = await import('./agent-composition.js');
  const told: string[] = [];
  for (const session of sessions) {
    const role = await readAgentComposition(session.name).then((found) => found.current.role).catch(() => 'coworker');
    if (role !== 'coordinator') continue;
    await notice(session.name, `${item.id} '${item.title}' came from Jira and has no holders; place it.`);
    told.push(session.name);
  }
  return told;
}

/** Issue an id and write the item; born paired, its id is its Jira key. Unlocked: callers hold
 * the issuer. A create by an Agent (a live session) lands on its Team when it leads one, else on
 * itself; a lead of several names one (the holder). Any kind, an Epic too, with a parent or none
 * (owner, 2026-11-06): an item with no parent is normal (the board's No epic; item search
 * --no-parent). The owner, Ronin and the Jira bridge (a paired item) create as named; a Jira
 * item with no holder named lands on the Team holding its parent, else on nobody. */
export async function createItemUnlocked(input: NewItem, by: string): Promise<Acknowledged> {
  const title = String(input.title ?? '').trim();
  if (!title) throw new WorkItemBadInput('A work item needs a title.');
  const parent = input.parent ? await load(input.parent) : null;
  const agent = input.jira ? undefined : (await listSessions()).find((session) => session.name === by);
  if (agent && !input.holder && agent.leads.length > 1) throw new WorkItemRefused(`You lead ${agent.leads.join(', ')}; name one with --team <team>.`);
  // From Jira with nobody named: the Team holding its parent (owner, 2026-11-06; KAN-308), or the
  // Workspace holding it (an idea parked from Jira under the Icebox; KAN-352).
  const parentTeam = input.jira && !input.holder && parent ? (await holdersOf(parent.id)).find((one) => one.kind === 'team' || one.kind === 'workspace') : undefined;
  const holder: Holder | undefined = input.holder ?? parentTeam ?? (agent ? (agent.leads.length ? { kind: 'team', name: agent.leads[0]! } : { kind: 'agent', name: by }) : undefined);
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
  await follow(item, item.parent, item.level);
  item.kind = named || kindAt(names, item.level);
  if (!input.jira) jiraShape(campaign_id, by, { id: '', kind: item.kind, level: item.level, paired: false }, parent);
  const list = holder ? await listFor(holder) : null;
  await save(item);
  if (list) await list.set([...list.holds, item.id]);
  const line = lineOf(by, 'create', { to: holder ? holderLabel(holder) : 'none', note: [item.title, item.parent ? `under ${item.parent}` : 'no parent'].join('; ') });
  item.trail.push(line);
  await save(item);
  emitItemChanged({ item, line });
  const notified = await announceUnheld(item, by);
  return notified.length ? { ...answer(item, line), notified } : answer(item, line);
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
    // A move to In Review by the Agent holding the item is a hand-in from a checkout.
    const only = Object.entries(edit).filter(([, value]) => value !== undefined).map(([key]) => key);
    if (only.join() === 'status' && edit.status!.trim() === REVIEW && current.status !== REVIEW
      && (await holdersOf(current.id)).some((holder) => holder.kind === 'agent' && holder.name === by)
      && (await listSessions()).some((session) => session.name === by)) {
      // Its note is the Handed in note; under project management a hand-in carries one.
      const forUser = String(note ?? '').trim();
      if (!forUser && await import('./agent-composition.js').then((m) => m.projectManagementOn(by)).catch(() => false)) {
        throw new WorkItemRefused(`a hand-in carries a note for the user: what they can try, in their words.\n  NEXT: item transition ${current.id} "${REVIEW}" --note "<what they can try>"`);
      }
      return handInUnlocked(current.id, by, { desk: false, forUser });
    }
    if (edit.priority !== undefined) oneOf('priority', edit.priority.trim(), names.priorities);
    const reparent = edit.parent !== undefined && edit.parent !== current.parent;
    const under = reparent && edit.parent ? await load(edit.parent) : null;
    const parent = reparent ? under?.id ?? null : current.parent;
    const named = edit.kind?.trim();
    const level = named ? levelOfKind(names, named) : under ? levelUnder(under) : current.level;
    const children = level !== current.level || reparent ? await follow(current, parent, level) : [];
    const kind = named || (level === current.level ? current.kind : kindAt(names, level));
    if (reparent || named) {
      jiraShape(current.campaign_id, by, { id: current.id, kind, level, paired: Boolean(current.external.jira), was: current.level }, reparent ? under : current.parent ? await readItem(current.parent) : null);
      const paired = children.find(({ child }) => child.external.jira);
      if (paired && jiraConnected(current.campaign_id) && !by.startsWith('jira:')) {
        throw new WorkItemRefused(`Jira would refuse this, so Ronin does too: ${paired.child.id} is on Jira under ${current.id} and would have to change kind across levels.`);
      }
    }
    // The bridge storing the Jira key alone is not news; nor is a line that changes nothing.
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
    return done;
  });
}

const REVIEW = 'In Review';
/** Done by its name, as In Progress and In Review are: a Jira space lists its statuses in its own
 * order (home_machine: To Do, Done, In Progress, In Review), so the last one is not Done. Jira's
 * status category ('done') would survive a space renaming Done, but the bridge does not read
 * categories yet, so the name it is. */
export const DONE = 'Done';

/** A status change told to the watchers of that item, not of an item above it (notice 3), and
 * to each Team holding it (KAN-307), through namesOf: once each, never `except`. */
async function tellWatchers(item: WorkItem, text: string, except: string[]): Promise<string[]> {
  const teams = (await holdersOf(item.id)).filter((holder) => holder.kind === 'team');
  const names = new Set(await namesOf([...(await watchersOf(item.id)), ...teams]));
  for (const name of except) names.delete(name);
  for (const name of names) await notice(name, text);
  return [...names];
}
const WORKING = 'In Progress';

/** The item's id and every id above it, nearest first. */
async function ancestry(item: WorkItem): Promise<string[]> {
  const ids = [item.id];
  for (let at = item.parent; at; at = (await readItem(at))?.parent ?? null) ids.push(at);
  return ids;
}

/** The Team a hand-in gives the item to: the hander's Team that holds the item or an item
 * above it; else the hander's one Team; else the Team holding the nearest item above; else
 * none, and the item stays where it is. */
async function handInTeam(item: WorkItem, session: string): Promise<string | null> {
  return teamFor(item, (await listSessions()).find((one) => one.name === session)?.tags ?? []);
}

/** handInTeam's rule over a given list of the Agent's Teams (an ending reads them from its letter). */
async function teamFor(item: WorkItem, mine: string[]): Promise<string | null> {
  const lists = (await heldLists()).filter((list) => list.holder.kind === 'team');
  const above = await ancestry(item);
  const holding = (id: string) => lists.filter((list) => list.holds.includes(id)).map((list) => list.holder.name);
  for (const id of above) { const team = holding(id).find((name) => mine.includes(name)); if (team) return team; }
  const rostered = mine.filter((name) => lists.some((list) => list.holder.name === name));
  if (rostered.length === 1) return rostered[0]!;
  for (const id of above) { const team = holding(id)[0]; if (team) return team; }
  return null;
}

/** THE HAND-IN (docs/using-ronin/project-management.md, How an item lives): the item moves to In
 * Review and records who handed it in (hand_ins, handed_in, the Handed in note), in one trail
 * line. Handing in code doesn't hand in the item (owner, 2026-11-05; KAN-269): the Agent keeps
 * the hold, no Team goes on. A desk's hand-in is told by the desk's own message (desks/lead.ts);
 * a checkout's (a move to In Review by its holder) tells the Team's lead from here. An item
 * already In Review gets a line that changes nothing and tells nobody. */
async function handInUnlocked(given: string, session: string, opts: HandInOptions): Promise<Acknowledged> {
  const item = await load(given);
  const id = item.id;
  oneOf('status', REVIEW, spaceNames(item.campaign_id).statuses);
  const forUser = String(opts.forUser ?? '').trim();
  const long = handInNoteProblem(forUser);
  if (long) throw new WorkItemRefused(long);
  // The Team only finds the lead to tell: handing in code doesn't hand in the item (owner,
  // 2026-11-05; KAN-269). The Agent keeps the hold; no Team goes on, nobody comes off.
  const team = await handInTeam(item, session);
  const at = new Date().toISOString();
  const recorded = (it: WorkItem) => {
    // A desk's hand-in names its receipts; only a checkout's, with no code to promote, is null.
    const receipts: Array<string | null> = opts.desk ? opts.receipts?.length ? opts.receipts : [''] : [null];
    it.hand_ins = [...(it.hand_ins ?? []), ...receipts.map((receipt) => ({ receipt, by: session, at }))];
    it.handed_in = { by: session, at };
    // The Handed in note: the one comment a user reads on Waiting on you and in Jira.
    if (forUser) it.comments.push({ by: session, at, text: `${HANDED_IN}${forUser}` });
  };
  // Already In Review: no status moves, the hand-in is still recorded.
  if (item.status === REVIEW) return appendTrail(id, session, (it) => { recorded(it); return { op: 'edit', note: [opts.note, 'handed in again'].filter(Boolean).join('; ') }; }, () => false);
  const before = item.status;
  const done = await appendTrail(id, session, (it) => {
    it.status = REVIEW;
    recorded(it);
    return { op: 'status', from: before, to: REVIEW, note: [opts.note, `handed in by ${session}`].filter(Boolean).join('; ') };
  }, () => false);
  const leads = team ? (await leadsOf(team)).filter((name) => name !== session) : [];
  if (!opts.desk) {
    for (const lead of leads) await notice(lead, `${id} '${item.title}' was handed in by ${session}; review and promote it.`);
  }
  await tellWatchers(done.item, `${id}: status ${before} → ${REVIEW} by ${session}.`, [session, ...leads]);
  return done;
}

/** A hand-in: from a desk (its receipts) or a checkout; `note` is the trail's, `forUser` the
 * Handed in note (at most NOTE_MAX characters). */
export interface HandInOptions { desk: boolean; note?: string; receipts?: string[]; forUser?: string }
export const handInItem = (id: string, session: string, opts: HandInOptions) => withIssuer(() => handInUnlocked(id, session, opts));

/** The promotion marks an item it carried on dev (6a): `on_dev`, one trail line naming the
 * promotion, no status change and nobody told. A paired item too: it is not a status. */
export function markOnDev(given: string, promotion: string, by: string): Promise<Acknowledged> {
  return withIssuer(() => appendTrail(given, by, (it) => {
    it.on_dev = { promotion, at: new Date().toISOString() };
    return { op: 'edit', note: `promotion ${promotion}; on dev` };
  }, () => false));
}

/** SEND BACK (Waiting on you): the item goes to In Progress with the comment, held by whoever
 * holds it, and each Agent holding it is told (notice 4). No holder moves: an item whose Agent
 * ended stays where its ending put it (KAN-269). One trail line. */
export function sendBack(given: string, words: string | undefined, by: string): Promise<Acknowledged> {
  return withIssuer(async () => {
    const item = await load(given);
    const id = item.id;
    oneOf('status', WORKING, spaceNames(item.campaign_id).statuses);
    const text = String(words ?? '').trim();
    // To whoever holds it (KAN-269): no holder moves; with nobody (its Agent ended) it stays.
    const to = labels(await holdersOf(id));
    const before = item.status;
    const done = await appendTrail(id, by, (it) => {
      it.status = WORKING;
      if (text) it.comments.push({ by: by.trim() || 'unknown', at: new Date().toISOString(), text });
      return { op: 'status', from: before, to: WORKING, note: `sent back to ${to}${text ? `: ${text}` : ''}` };
    }, () => false);
    const told = (await agentsOn(id)).filter((name) => name !== by);
    for (const name of told) await notice(name, `${id} '${item.title}' was sent back to you by ${by}${text ? `: ${text}` : ''}. It is In Progress again.`);
    return told.length ? { ...done, notified: told } : done;
  });
}

/** What session_end stops for (docs/using-ronin/project-management.md, How an item lives): the
 * items an Agent holds To Do, In Progress or In Review, each with the Team a handover gives it
 * to (null when no Team is found). session_end first settles To Do (settleToDo), so what it
 * names is what needs a handover. */
export async function unfinishedHolds(session: string): Promise<Array<WorkItem & { team: string | null }>> {
  const letter = await readLetterHolds(await sessionKey(session)).catch(() => null);
  const items = (await Promise.all((letter?.holds ?? []).map((id) => readItem(id))))
    .filter((item): item is WorkItem => Boolean(item) && [spaceNames(item!.campaign_id).statuses[0], WORKING, REVIEW].includes(item!.status));
  const teams = await endingTeams(session, letter?.teams ?? []);
  return Promise.all(items.map(async (item) => ({ ...item, team: await teamFor(item, teams) })));
}

/** An ending Agent's Teams: its letter's, and its live session's tags while it has one. */
async function endingTeams(session: string, lettered: string[]): Promise<string[]> {
  const tags = (await listSessions().catch(() => [])).find((one) => one.name === session)?.tags ?? [];
  return [...new Set([...lettered, ...tags])];
}

/** The leads of a Team: the live sessions that lead it. */
const leadsOf = (team: string): Promise<string[]> => namesOf([{ kind: 'team', name: team }]);

/** Move one id from an Agent's list to a Team's, under the issuer. */
async function toTeam(id: string, session: string, team: string): Promise<void> {
  for (const list of await heldLists()) {
    if (list.holder.kind === 'agent' && list.holder.name === session && list.holds.includes(id)) await list.set(list.holds.filter((one) => one !== id));
  }
  const target = await listFor({ kind: 'team', name: team });
  if (!target.holds.includes(id)) await target.set([...target.holds, id]);
}

/** TO DO SETTLES ITSELF at session_end: each To Do item the Agent holds goes back to its Team,
 * for the lead to give out again, one handoff line each, nobody told. One with no Team found
 * stays, and session_end names it. Answers what it moved. */
export function settleToDo(session: string): Promise<Acknowledged[]> {
  return withIssuer(async () => {
    const letter = await readLetterHolds(await sessionKey(session)).catch(() => null);
    const teams = await endingTeams(session, letter?.teams ?? []);
    const moved: Acknowledged[] = [];
    for (const id of letter?.holds ?? []) {
      const item = await readItem(id);
      if (!item || item.status !== spaceNames(item.campaign_id).statuses[0]) continue;
      const team = await teamFor(item, teams);
      if (!team) continue;
      await toTeam(item.id, session, team);
      moved.push(await appendTrail(item.id, session, () => ({ op: 'handoff', from: `agent:${session}`, to: `team:${team}`, note: `${item.status}, back to the Team at ${session}'s end` }), () => false));
    }
    return moved;
  });
}

/** THE HANDOVER (docs/using-ronin/project-management.md, How an item lives): an ending Agent
 * hands an item on with where it stands and what is next. The note is a comment headed
 * "Handover from <agent>", the caller comes off and the receiver goes on, the status stays,
 * in one handoff line; `toDo` puts In Progress back to To Do in the same line. `flag` is the
 * Agent's question when it can't decide: the item is flagged with it (a second line, the flag's),
 * and the lead of the receiving Team, with whoever helps above the item, is told (notice 2). */
export interface Handover { note?: string; toDo?: boolean; flag?: string }
export function handoverItem(given: string, to: Holder, by: string, opts: Handover): Promise<Acknowledged> {
  return withIssuer(async () => {
    const item = await load(given);
    const id = item.id;
    const note = String(opts.note ?? '').trim();
    const question = String(opts.flag ?? '').trim();
    if (!note && !question) throw new WorkItemBadInput(`a handover says where ${id} stands and what is next: item handover ${id} ${holderLabel(to)} "<note>", or --flag "<the question>".`);
    const giver: Holder = { kind: 'agent', name: by };
    const source = await listFor(giver).catch(() => null);
    if (source?.holds.includes(id)) await source.set(source.holds.filter((held) => held !== id));
    const target = await listFor(to);
    if (!target.holds.includes(id)) await target.set([...target.holds, id]);
    const first = spaceNames(item.campaign_id).statuses[0]!;
    const before = item.status;
    let done = await appendTrail(id, by, (it) => {
      if (note) it.comments.push({ by, at: new Date().toISOString(), text: `${HANDOVER_FROM}${by}: ${note}` });
      if (opts.toDo) it.status = first;
      const moved = opts.toDo && before !== first ? `; ${before} → ${first}` : '';
      return { op: 'handoff', from: holderLabel(giver), to: holderLabel(to), note: `handover${note ? `: ${note}` : ''}${moved}` };
    }, () => false);
    if (!question) return done;
    done = await appendTrail(id, by, (it) => {
      it.flagged = true;
      it.comments.push({ by, at: new Date().toISOString(), text: question });
      return { op: 'flag', to: 'true', note: question };
    }, () => false);
    const told = [...new Set([...(await helpOf(done.item)), ...(to.kind === 'team' ? await leadsOf(to.name) : [to.name])])].filter((name) => name !== by);
    for (const name of told) await notice(name, `${id} '${item.title}' needs help: ${question} (flagged by ${by} at its handover to ${holderLabel(to)}).`);
    return told.length ? { ...done, notified: told } : done;
  });
}

/** The bridge, in-process, sets a paired item's Jira fields; no route writes them. With a note
 * (a Sprint or Due date change) it is a trail line, told to nobody; without, it is saved with
 * no line, since Rank moves with every drag in the backlog. */
export function setJiraFields(id: string, fields: Record<string, string>, by: string, note?: string): Promise<unknown> {
  return withIssuer(async () => {
    if (note) return appendTrail(id, by, (item) => { item.jiraFields = fields; return { op: 'edit', note }; });
    const item = await load(id);
    item.jiraFields = fields;
    await save(item);
  });
}

/** A comment, as Jira's: who, when, what. One trail line; the Agent working the item hears it (notice 4). */
export async function addComment(id: string, words: string, by: string): Promise<Acknowledged> {
  const text = String(words ?? '').trim();
  if (!text) throw new WorkItemBadInput('a comment needs its text.');
  return withIssuer(() => appendTrail(id, by, (item) => {
    item.comments.push({ by: by.trim() || 'unknown', at: new Date().toISOString(), text });
    return { op: 'comment', note: text };
  }));
}

/** Jira's Add flag / Remove flag: the impediment set or cleared, a reason given becoming an
 * ordinary comment, in one trail line. A flag raised is a call for help (notice 2); the brief's
 * convention is "Waiting on <who>: <what>", not enforced. */
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

/** `plan:<name>` or `plan:<workspace>/<name>` (KAN-256): stored whole, `plan:<workspace>/<name>`,
 * the item's Campaign the third part. A new one must resolve; a removal takes what is stored. */
async function planAttachment(id: string, target: string, by: string, remove: boolean): Promise<string> {
  const { PlanBadInput: Bad, planTarget, resolvePlanRef } = await import('./plans.js');
  const item = await load(id);
  const ref = target.trim().slice('plan:'.length);
  if (remove && ref.includes('/')) return `plan:${ref}`;
  let full: string;
  try {
    const { workspace, name } = await planTarget({ campaign: item.campaign_id, by }, ref);
    full = `${workspace.name}/${name}`;
  } catch (e) {
    if (remove) { const kept = item.attachments.find((doc) => doc.endsWith(`/${ref}`) && doc.startsWith('plan:')); if (kept) return kept; }
    throw e instanceof Bad ? new WorkItemBadInput((e as Error).message) : new WorkItemRefused((e as Error).message);
  }
  if (!remove && !(await resolvePlanRef(item.campaign_id, full))) throw new WorkItemBadInput(`no plan ${full}; plan ls lists them.`);
  return `plan:${full}`;
}

export async function attachDoc(id: string, target: string, by: string, remove = false): Promise<Acknowledged> {
  const at = /^plan:/.test(String(target ?? '').trim()) ? await planAttachment(id, String(target), by, remove) : attachment(target, remove);
  const done = await withIssuer(() => appendTrail(id, by, (item) => {
    const kept = item.attachments.filter((doc) => doc !== at);
    item.attachments = remove ? kept : [at, ...kept];
    return { op: 'attach', to: at, ...(remove ? { from: 'removed' } : {}) };
  }));
  if (!remove && at.startsWith('plan:')) await takenUp(done.item.id, at).catch((e) => console.error('[icebox] taken up:', e));
  return done;
}

/** Jira's issue link, by the space's link type name (Blocks: this item blocks `to`). Kept on
 * this item; a read of the other shows it inward. */
export async function linkItem(id: string, type: string, other: string, by: string, remove = false): Promise<Acknowledged> {
  return withIssuer(async () => {
    oneOf('a link', type, spaceNames((await load(id)).campaign_id).links);
    const to = (await load(other)).id;
    return appendTrail(id, by, (item) => {
      const same = (link: Link) => link.type === type && link.to === to;
      if (remove) item.links = item.links.filter((link) => !same(link));
      else if (!item.links.some(same)) item.links.push({ type, to });
      return { op: 'link', to, note: `${type} ${to}${remove ? ': link removed' : ''}` };
    });
  });
}

/** Jira's delete (docs/using-ronin/project-management.md, Jira). The item goes, and with it
 * its subtasks (as Jira deletes an issue's subtasks); any other child is left with no parent (as
 * an epic's children are). Links to it go and every holder lets go of it. No flag: the bridge
 * decides what Jira does (an item made in Ronin goes there too; one that came from Jira stays
 * there). THE DELETE EVENT (agreed with the bridge, the only Jira writer): before any file goes,
 * one emitItemChanged per deleted item, the named item first, then its subtasks; the item as it
 * was, and a line { op: 'delete', by: the deleter, from: the named id on a subtask taken with
 * it }. */
export function deleteItem(given: string, by: string): Promise<{ deleted: string[]; orphaned: string[] }> {
  return withIssuer(async () => {
    const id = (await load(given)).id;
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
    }
    for (const at of deleted) {
      const item = all.find((one) => one.id === at)!;
      emitItemChanged({ item, line: lineOf(by, 'delete', { from: at === id ? undefined : id }) });
    }
    for (const at of deleted) {
      await takeOffEveryList(at);
      await rm(fileOf(at));
    }
    await rewriteWatches((watches) => watches.filter((watched) => !deleted.includes(watched)));
    return { deleted, orphaned };
  });
}

/** Keystone 3: a paired item's Ronin id is its Jira key. One call rewrites the item's file and
 * id, each child's parent, every link pointing at it, and each holder's holds; the item gets one
 * trail line, "renamed from <old>", and nobody is told: the old id still finds it (resolveId).
 * Trails, comments, receipts and the promotion ledger stay as written. */
export function renameItem(was: string, to: string, by: string): Promise<Acknowledged> {
  return withIssuer(async () => {
    const item = await load(was);
    const from = item.id;
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
    return answer(item, line);
  });
}

/* HOLDING — a list of item ids on each Team (roster.holds) and each Agent (the letter's
 * holds). Handoff removes the giver and adds the receiver; release removes it from every
 * list. Neither touches the item's content or parent, and both run under the issuer lock. */

/** A Workspace holds too (KAN-352): its Icebox and the ideas parked in it. Its name is the
 * Workspace's; `campaign` says which Campaign's, and the label leaves it out. */
export type Holder = { kind: 'team' | 'agent'; name: string } | { kind: 'workspace'; name: string; campaign: string };
export const holderLabel = (holder: Holder): string => `${holder.kind}:${holder.name}`;

interface HeldList { holder: Holder; holds: string[]; set(holds: string[]): Promise<unknown> }

/** A list's ids as the items go by now (KAN-261): an id from before the item took its Jira key
 * reads as the key, and the item is on the list once, however it was written (a write from
 * another process can bring back an id a rename replaced). An id no item has is kept as it is.
 * A list read otherwise is written back clean at once. */
async function canonical(ids: string[], write: (holds: string[]) => Promise<unknown>): Promise<string[]> {
  const out: string[] = [];
  for (const id of ids) {
    const now = await resolveId(id).catch(() => id);
    if (!out.includes(now)) out.push(now);
  }
  if (out.join() !== ids.join()) await write(out).catch((error) => console.error('[work-items] cleaning a holds list:', error));
  return out;
}

async function heldLists(): Promise<HeldList[]> {
  const teams = await Promise.all((await listTeamRosters()).map(async (roster): Promise<HeldList> => ({
    holder: { kind: 'team', name: roster.name },
    holds: await canonical(roster.holds, (holds) => writeTeamRoster(roster.name, { holds }, roster.campaign_id)),
    set: (holds) => writeTeamRoster(roster.name, { holds }, roster.campaign_id),
  })));
  const agents = await Promise.all((await listLetterHolds()).map(async (letter): Promise<HeldList> => ({
    holder: { kind: 'agent', name: letter.name },
    holds: await canonical(letter.holds, (holds) => writeLetterHolds(letter.key, holds)),
    set: (holds) => writeLetterHolds(letter.key, holds),
  })));
  const workspaces = await Promise.all((await listWorkspaceHolds()).map(async (w): Promise<HeldList> => ({
    holder: { kind: 'workspace', name: w.name, campaign: w.campaign_id },
    holds: await canonical(w.holds, (holds) => writeWorkspaceHolds(w.campaign_id, w.name, { holds })),
    set: (holds) => writeWorkspaceHolds(w.campaign_id, w.name, { holds }),
  })));
  return [...teams, ...agents, ...workspaces];
}

async function listFor(holder: Holder): Promise<HeldList> {
  if (holder.kind === 'workspace') {
    if (!(await readWorkspace(holder.campaign, holder.name))) throw new WorkItemBadInput(`Workspace "${holder.name}" has no record.`);
    const w = await readWorkspaceHolds(holder.campaign, holder.name);
    return { holder, holds: await canonical(w.holds, (holds) => writeWorkspaceHolds(holder.campaign, holder.name, { holds })), set: (holds) => writeWorkspaceHolds(holder.campaign, holder.name, { holds }) };
  }
  if (holder.kind === 'team') {
    const roster = await readTeamRoster(holder.name);
    if (!roster) throw new WorkItemBadInput(`Team "${holder.name}" has no roster.`);
    return { holder, holds: await canonical(roster.holds, (holds) => writeTeamRoster(roster.name, { holds }, roster.campaign_id)), set: (holds) => writeTeamRoster(roster.name, { holds }, roster.campaign_id) };
  }
  const letter = await letterOf(holder.name, 'hold work in');
  return { holder, holds: await canonical(letter.holds, (holds) => writeLetterHolds(letter.key, holds)), set: (holds) => writeLetterHolds(letter.key, holds) };
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

/** Handoff, the one tool (2026-11-06): the giver comes off and the receiver goes on, in the
 * same issuer step. The giver is `from` when named; else the caller, with any Team of the
 * caller's that holds the item and any Team of the receiver's that holds it (an Agent's Teams
 * are its session's tags). So a lead giving out Team work takes the Team off, and the owner or
 * traffic_control giving a Team's item to a member does too. `keepHolding`, the rare case, leaves
 * the giver on as well. Every other holder stays: a second Agent handed it leaves the first on.
 * There is no receiver none, as nothing goes to nobody: work given back goes to its Team; an ending is handover. */
export function handoffItem(given: string, to: Holder, by: string, options: { from?: Holder; keepHolding?: boolean; note?: string } = {}): Promise<Acknowledged> {
  return withIssuer(async () => {
    const id = (await load(given)).id;
    if (options.from) await listFor(options.from);
    const givers = new Set(options.keepHolding ? [] : (options.from ? [options.from] : await giversFor(by, to)).map(holderLabel));
    givers.delete(holderLabel(to));
    const removed: Holder[] = [];
    for (const list of await heldLists()) {
      if (!list.holds.includes(id) || !givers.has(holderLabel(list.holder))) continue;
      await list.set(list.holds.filter((held) => held !== id));
      removed.push(list.holder);
    }
    const target = await listFor(to);
    if (!target.holds.includes(id)) await target.set([...target.holds, id]);
    return appendTrail(id, by, () => ({ op: 'handoff', from: labels(removed), to: holderLabel(to), note: options.note }));
  });
}

/** The default giver: the caller and its Teams, and the receiver's Teams when it is an Agent. */
async function giversFor(by: string, to: Holder): Promise<Holder[]> {
  const sessions = await listSessions().catch(() => []);
  const tagsOf = (name: string) => sessions.find((one) => one.name === name)?.tags ?? [];
  const teams = [...tagsOf(by), ...(to.kind === 'agent' ? tagsOf(to.name) : [])];
  return [{ kind: 'agent', name: by }, ...teams.map((name): Holder => ({ kind: 'team', name }))];
}

/** Park: the id leaves every list. It is found again under its parent, or unassigned. */
export function releaseItem(given: string, by: string, note?: string): Promise<Acknowledged> {
  return withIssuer(async () => {
    const id = (await load(given)).id;
    const from = await takeOffEveryList(id);
    return appendTrail(id, by, () => ({ op: 'release', from: labels(from), to: 'none', note }));
  });
}

/* WATCHING — a list of item ids beside the holds, on each Agent's letter and each Team's
 * roster: what it tracks without holding. Watching changes no holds and no item, and adds no
 * trail line; the watcher (a Team's lead) hears a status change on the item itself, not on
 * items under it (tellWatchers). */

/** Watch adds the id to the watcher's watches; unwatch takes it off (a deleted item too). */
export function watchItem(given: string, watcher: Holder, watch: boolean): Promise<{ id: string; watches: string[] }> {
  return withIssuer(async () => {
    // Unwatch takes off a deleted item's id too, so only a watch needs the item to exist.
    const id = watch ? await resolveId(given) : await resolveId(given).catch(() => given);
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
 * "w9 moved to In Progress", "w9 is held by agent:x". Status, kind and level appear only when
 * the act changed them. Every acknowledgement is this one line. A create says it first, for
 * scripts and Agents to read: "created w12 under KAN-239", or "created w12 with no parent". */
export function didLine({ item, line }: Acknowledged): string {
  if (line.op === 'create') return `created ${item.id} ${item.parent ? `under ${item.parent}` : 'with no parent'}`;
  const what = line.op === 'status' ? `moved to ${line.to}`
    : line.op === 'move' ? (line.to === 'none' ? `moved to no parent, ${line.note}` : `moved under ${line.to}, ${line.note}`)
      : line.op === 'assign' ? `is held by ${line.to}`
        : line.op === 'handoff' ? (line.to === 'none' ? `${line.from} let go` : line.from && line.from !== 'none' ? `was handed from ${line.from} to ${line.to}` : `is held by ${line.to}`)
        : line.op === 'release' && line.note?.startsWith('archived') ? 'is archived'
        : line.op === 'release' || line.op === 'holder-ended' ? (line.to && line.to !== 'none' ? `went back to ${line.to}` : 'is held by nobody')
          : line.op === 'rename' ? `was renamed from ${line.from}`
              : line.op === 'comment' ? (line.from ? `comment ${line.from} was edited` : `has a comment from ${line.by}: ${line.note}`)
              : line.op === 'flag' ? `is ${line.to === 'true' ? 'flagged' : 'unflagged'}${line.note ? `: ${line.note}` : ''}`
              : line.op === 'attach' ? (line.from === 'removed' ? `has ${line.to} removed` : `has ${line.to} attached`)
              : line.op === 'link' ? `${line.note}`
              : `changed: ${line.note ?? 'no change'}`;
  return `${item.id} ${what}`;
}

/** AN ENDING WITH NO AGENT TO ASK (Shut down Agent, archive, a crash; docs/using-ronin/
 * project-management.md, How an item lives): the Agent watches nothing, and each item it held
 * goes by its status, never to nobody while a Team is found. Done goes to nobody; To Do goes to
 * the Team for its lead to give out again; anything else (In Progress, In Review) goes to the
 * Team flagged "Ended without handover: <agent>, <status>", and shows under Stuck. The flags are
 * one call for help (notice 2): each lead of a receiving Team is told once, every item listed
 * (with no Team found, whoever helps above the item). Restore does not reclaim. */
export function releaseHolder(session: string, key: string, how: string): Promise<Acknowledged[]> {
  return withIssuer(async () => {
    const letter = await readLetterHolds(key);
    if (letter?.watches.length) await writeLetterWatches(key, []);
    if (!letter?.holds.length) return [];
    const teams = letter.teams;
    const placed = new Map<string, string>();
    for (const id of letter.holds) {
      const item = await readItem(id);
      if (item && item.status !== DONE) { const team = await teamFor(item, teams); if (team) placed.set(id, team); }
    }
    await writeLetterHolds(key, []);
    const released: Acknowledged[] = [];
    const tell = new Map<string, string[]>(); // who -> the lines naming its items
    for (const id of letter.holds) {
      const item = await readItem(id);
      if (!item) continue;
      const team = placed.get(id) ?? null;
      if (team) { const list = await listFor({ kind: 'team', name: team }); if (!list.holds.includes(id)) await list.set([...list.holds, id]); }
      const to = team ? `team:${team}` : 'none';
      released.push(await appendTrail(id, 'ronin', () => ({ op: 'holder-ended', from: `agent:${session}`, to, note: how }), () => false));
      if (item.status === DONE || item.status === spaceNames(item.campaign_id).statuses[0]) continue;
      const reason = `Ended without handover: ${session}, ${item.status}`;
      released.push(await appendTrail(id, 'ronin', (it) => {
        it.flagged = true;
        it.comments.push({ by: 'ronin', at: new Date().toISOString(), text: reason });
        return { op: 'flag', to: 'true', note: reason };
      }, () => false));
      for (const name of team ? await leadsOf(team) : await helpOf(item)) tell.set(name, [...(tell.get(name) ?? []), `${id} '${item.title}' (${item.status}) on ${to}`]);
    }
    for (const [name, lines] of tell) {
      await notice(name, `${session} ended without a handover (${how}). Flagged, yours to decide (give it out, finish its review, delete it, or flag it to your user): ${lines.join('; ')}.`);
    }
    return released;
  });
}

/** A crash: an Agent whose session is gone without an end through Ronin still holds its items.
 * A sweep finds each record holding items whose session is not live, and on the second sweep in
 * a row that finds it so, releases it as an ending would. A sweep that sees no live session at
 * all (tmux unreadable) does nothing. */
const missing = new Map<string, number>();
export async function releaseEndedHolders(): Promise<string[]> {
  const live = new Set((await listSessions().catch(() => [])).map((one) => one.name));
  if (!live.size) return [];
  const ended: string[] = [];
  for (const letter of await listLetterHolds()) {
    if (!letter.holds.length || live.has(letter.name)) { missing.delete(letter.name); continue; }
    const seen = (missing.get(letter.name) ?? 0) + 1;
    missing.set(letter.name, seen);
    if (seen < 2) continue;
    await releaseHolder(letter.name, letter.key, 'session gone');
    missing.delete(letter.name);
    ended.push(letter.name);
  }
  return ended;
}

/** THE ARCHIVE (owner, 2026-11-05: "Jira can do what it likes. Ronin can do 5 ttl to archive";
 * KAN-266): an item Done for ARCHIVE_AFTER_MS since its move to Done is archived by a sweep
 * (every five minutes, beside releaseEndedHolders), however it went Done (Accept, item
 * transition, several ids, Jira): off every holder list, off the Epics workbench and default
 * search, in one trail line "archived: Done 5 days", told to nobody. Until then it shows "Done ·
 * <how long ago>". Ronin only: the Jira issue and the pair are never touched, and the item stays
 * in the store, so `item read` and its documents still find it. Answers the ids it archived. */
export const ARCHIVE_AFTER_MS = 5 * 24 * 60 * 60 * 1000;
/** When an item went Done: its last move there (a transition, or an edit that set it), else its birth. */
export function doneSince(item: Pick<WorkItem, 'trail' | 'created'>): string {
  const line = [...item.trail].reverse().find((one) => (one.op === 'status' && one.to === DONE) || (one.op === 'edit' && /(^|, |; )status Done(,|;|$)/.test(one.note ?? '')));
  return line?.at ?? item.created.at;
}
export function archiveDone(now = Date.now()): Promise<string[]> {
  return withIssuer(async () => {
    const archived: string[] = [];
    for (const item of await listItems()) {
      if (item.status !== DONE || item.archived || now - Date.parse(doneSince(item)) < ARCHIVE_AFTER_MS) continue;
      const from = await takeOffEveryList(item.id);
      await appendTrail(item.id, 'ronin', (it) => {
        it.archived = { at: new Date(now).toISOString() };
        return { op: 'release', from: labels(from), to: 'none', note: 'archived: Done 5 days' };
      }, () => false);
      archived.push(item.id);
    }
    return archived;
  });
}

/** Archive now (KAN-292, owner: "we shouldnt have to wait to clear the deck"): what archiveDone
 * does at five days, done at once by whoever asks: off every list, archived, one trail line
 * "archived: by <caller>", told to nobody, Jira untouched; `item read` still finds it. The archive
 * means Done, so an item not Done is refused, named; leaving Done brings it back (save). */
export function archiveItem(given: string, by: string): Promise<Acknowledged> {
  return withIssuer(() => archiveUnlocked(given, by));
}

async function archiveUnlocked(given: string, by: string): Promise<Acknowledged> {
  const item = await load(given);
  if (item.status !== DONE) throw new WorkItemRefused(`${item.id} is ${item.status}, not Done: only a Done item is archived.`);
  if (item.archived) throw new WorkItemRefused(`${item.id} is archived already.`);
  const from = await takeOffEveryList(item.id);
  return appendTrail(item.id, by, (it) => {
    it.archived = { at: new Date().toISOString() };
    return { op: 'release', from: labels(from), to: 'none', note: `archived: by ${by}` };
  }, () => false);
}

/** `item archive --done`: every Done item, not archived, that the caller or its Teams hold (an
 * Agent's Teams are its session's tags and the Teams it leads); `team` narrows it to that Team's.
 * Answers one acknowledgement per item archived, none when there is nothing to clear. */
export function archiveHeldDone(by: string, team?: string): Promise<Acknowledged[]> {
  return withIssuer(async () => {
    const session = (await listSessions().catch(() => [])).find((one) => one.name === by);
    const holders = new Set(team ? [`team:${team}`] : [`agent:${by}`, ...[...(session?.tags ?? []), ...(session?.leads ?? [])].map((name) => `team:${name}`)]);
    const ids = new Set((await heldLists()).filter((list) => holders.has(holderLabel(list.holder))).flatMap((list) => list.holds));
    const done: Acknowledged[] = [];
    for (const id of ids) {
      const item = await readItem(id);
      if (item && item.status === DONE && !item.archived) done.push(await archiveUnlocked(id, by));
    }
    return done;
  });
}

/** The Jira bridge's word to an item's holding Agents, when a change of theirs was not sent. */
export async function tellHolders(id: string, text: string): Promise<void> {
  const item = await readItem(id);
  if (item) for (const name of await agentsOn(item.id)) await notice(name, text);
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

/* THE ICEBOX (owner, 2026-11-10; KAN-352; docs/using-ronin/planning.md, Park it). Every
 * Workspace has one epic, made by Ronin and held by the Workspace: parked ideas only, never work
 * being done. Held by the Workspace, it and its items are on no Team's or Agent's work record,
 * not in anyone's put-back list (held by nobody) and never Jira's unheld notice. It is on the
 * Epics workbench and in Jira as an epic. One item per idea, "Draft the plan for <idea>", with
 * its Draft plan attached; it is finished when the plan is taken up (an epic attaches it: Ronin
 * moves the item to Done) or when the idea is dropped (the person moves it to Done). */
export const iceboxTitle = (workspace: string): string => `Icebox: ${workspace}`;

async function iceboxUnlocked(campaign: string, workspace: string): Promise<WorkItem> {
  const w = await readWorkspace(campaign, workspace);
  if (!w) throw new WorkItemMissing(`Workspace "${workspace}" has no record.`);
  const had = await readWorkspaceHolds(campaign, workspace);
  const found = had.icebox ? await readItem(had.icebox) : null;
  if (found) {
    if (found.id !== had.icebox) await writeWorkspaceHolds(campaign, workspace, { icebox: found.id });
    return found;
  }
  const holder: Holder = { kind: 'workspace', name: workspace, campaign };
  const made = await createItemUnlocked({
    title: iceboxTitle(workspace), campaign_id: campaign, kind: kindAt(spaceNames(campaign), 1), holder,
    objective: `Ideas parked for Workspace ${w.title || workspace}: one item each, "Draft the plan for <idea>", with its Draft plan. Never work being done.`,
  }, 'ronin');
  await writeWorkspaceHolds(campaign, workspace, { icebox: made.item.id });
  return made.item;
}

/** The Workspace's Icebox, made now if it has none (or its epic was deleted). */
export const ensureIcebox = (campaign: string, workspace: string): Promise<WorkItem> => withIssuer(() => iceboxUnlocked(campaign, workspace));

/** Every Icebox epic's id now, in every Campaign. */
export async function iceboxIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const w of await listWorkspaceHolds()) if (w.icebox) ids.add(await resolveId(w.icebox).catch(() => w.icebox));
  return ids;
}

/** Every Workspace given its Icebox: once at start, so a Workspace made before KAN-352 has one. */
export async function ensureEveryIcebox(): Promise<string[]> {
  const made: string[] = [];
  for (const w of await listWorkspaceHolds()) {
    if (w.icebox && await readItem(w.icebox)) continue;
    made.push((await ensureIcebox(w.campaign_id, w.name).catch((e) => { console.error(`[icebox] ${w.campaign_id}/${w.name}:`, e); return null; }))?.id ?? '');
  }
  return made.filter(Boolean);
}

/** Park it: the idea's item in the Workspace's Icebox, held by the Workspace, its plan attached
 * (`plan:<workspace>/<name>`, already written as a Draft by the caller). */
export function parkIdea(campaign: string, workspace: string, idea: string, plan: string, by: string): Promise<Acknowledged> {
  const what = String(idea ?? '').trim();
  if (!what) throw new WorkItemBadInput('park an idea: name it (--idea "<idea>"), or give the plan a title.');
  return withIssuer(async () => {
    const icebox = await iceboxUnlocked(campaign, workspace);
    return createItemUnlocked({
      title: `Draft the plan for ${what}`, campaign_id: campaign, parent: icebox.id,
      holder: { kind: 'workspace', name: workspace, campaign },
      objective: 'Finished when the plan is taken up (ordered, with its epic made) or the idea is dropped.',
      attachments: [`plan:${workspace}/${plan}`],
    }, by);
  });
}

/** Taken up: an epic outside the Icebox now carries the plan, so each open Icebox item carrying it
 * is Done, by Ronin, with the epic named. */
async function takenUp(epicId: string, plan: string): Promise<string[]> {
  const epic = await readItem(epicId);
  const iceboxes = await iceboxIds();
  if (!epic || epic.level !== 1 || iceboxes.has(epic.id)) return [];
  const done: string[] = [];
  for (const item of await listItems()) {
    if (item.status === DONE || !item.parent || !iceboxes.has(item.parent) || !item.attachments.includes(plan)) continue;
    await editItem(item.id, { status: DONE }, 'ronin', `taken up: ${epic.id} carries ${plan}`);
    done.push(item.id);
  }
  return done;
}
