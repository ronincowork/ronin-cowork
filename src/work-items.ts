/**
 * THE WORK ITEM STORE — one item type, stored once, keyed by id.
 *
 * The only module that reads or writes an item file. Everything else reaches items through
 * the /api/work-items routes (src/routes/work-items-api.ts), and every change here appends
 * exactly one line to the item's trail, naming who called. Nothing is locked against
 * anyone: holding is discovery, never permission. One refusal: nothing goes below -1 (follow).
 *
 * THE SHAPE MATCHES JIRA (samurai_lab JIRA_SHAPE.md). One object
 * at every level: `level` 1 epic · 0 story/task/bug · -1 subtask, stored; `kind` any work
 * type name; `status` the item's state; `flagged` an impediment; `priority` any name;
 * `comments` a list; `links` blocks or relates.
 *
 * One file per item, <store>/<id>.json, written beside and renamed over. Ids come from one
 * global issuer (w1, w2, …) under one in-process lock that every write shares, so a trail
 * append is read, push, write with nobody in between.
 */
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './resources.js';
import { sessionKey } from './session-dir.js';
import { enqueueMessage } from './message-queue.js';
import { findLeads } from './desks/lead.js';
import { listTeamRosters, readTeamRoster, writeTeamRoster } from './team-rosters.js';
import { ackRecord, listLetterHolds, teamChanged, readLetterHolds, seedTegami, writeLetterHolds } from './tegami.js';
import { initialCampaignId } from './campaign-scope.js';
import { listSessions } from './tmux.js';
import { emitItemChanged } from './sockets.js';

export const ITEM_STATUSES = ['IDEA', 'PLAN', 'BUILD', 'REVIEW', 'LAND', 'DONE'] as const;
export const ITEM_LEVELS = [1, 0, -1] as const;
export const LINK_TYPES = ['blocks', 'relates'] as const;
export const TRAIL_OPS = ['create', 'assign', 'handoff', 'release', 'move', 'status', 'edit', 'comment', 'flag', 'attach', 'link', 'holder-ended'] as const;

export type ItemStatus = typeof ITEM_STATUSES[number];
export type ItemLevel = typeof ITEM_LEVELS[number];
export type LinkType = typeof LINK_TYPES[number];
export type TrailOp = typeof TRAIL_OPS[number];

export interface TrailLine { at: string; by: string; op: TrailOp; from?: string; to?: string; note?: string }
/** The pair (JIRA_RONIN_BRIDGE keystone 3): the Jira issue's id, which never changes, and the
 * key it shows (PAY-123). Only the bridge writes it. */
export interface JiraPair { id: string; key: string }
export interface External { trello?: string; jira?: JiraPair; github?: string }
export interface Comment { by: string; at: string; text: string; edited?: string }
/** Jira's issue link, kept on the item it starts from: this item blocks, or relates to, `to`. */
export interface Link { type: LinkType; to: string }

export interface WorkItem {
  id: string;
  campaign_id: string;
  title: string;
  objective: string;
  /** 1 epic · 0 story, task or bug · -1 subtask. A default at birth, never derived. */
  level: ItemLevel;
  /** Any work type name (story, task, bug, feature, a site's own); absent reads as blank. */
  kind?: string;
  status: ItemStatus;
  flagged: boolean;
  /** Any priority name; absent reads as blank. */
  priority?: string;
  comments: Comment[];
  parent: string | null;
  /** Absolute paths, as Jira's attachments. */
  attachments: string[];
  links: Link[];
  external: External;
  trail: TrailLine[];
  created: { at: string; by: string };
}

/** What every write answers: the item as it now is, the line it appended, and who was told
 * of an arrival. What the act did is read from the line (didLine). */
export interface Acknowledged { item: WorkItem; line: TrailLine; notified?: string[] }

export class WorkItemRefused extends Error {}
export class WorkItemMissing extends Error {}
export class WorkItemBadInput extends Error {}

const ID = /^w[1-9][0-9]*$/;
export const isItemId = (value: string): boolean => ID.test(value);

const dir = () => storeDir('work_items');
const fileOf = (id: string) => path.join(dir(), `${id}.json`);

const member = <T extends readonly unknown[]>(values: T, value: unknown): value is T[number] =>
  (values as readonly unknown[]).includes(value);

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
  if (!isItemId(id)) throw new WorkItemMissing(`"${id}" is not a work item id; ids look like w12.`);
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
  return items.filter((item): item is WorkItem => item !== null).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

async function nextId(): Promise<string> {
  let names: string[] = [];
  try { names = await readdir(dir()); } catch { /* an empty store issues w1 */ }
  const top = names.reduce((max, name) => {
    const match = /^w([1-9][0-9]*)\.json$/.exec(name);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `w${top + 1}`;
}

const lineOf = (by: string, op: TrailOp, extra: Omit<TrailLine, 'at' | 'by' | 'op'> = {}): TrailLine => ({
  at: new Date().toISOString(), by: by.trim() || 'unknown', op,
  ...Object.fromEntries(Object.entries(extra).filter(([, value]) => value !== undefined && value !== '')),
});

/** Read, change, append one trail line, write. Runs inside the issuer lock. */
const answer = (item: WorkItem, line: TrailLine): Acknowledged => ({ item, line });

/** A change by anyone but the holding Agent pushes that Agent the one work-record ack
 * (ackRecord skips the Agent's own writes). */
export async function appendTrail(id: string, by: string, change: (item: WorkItem) => Omit<TrailLine, 'at' | 'by'>): Promise<Acknowledged> {
  const item = await load(id);
  const { op, ...extra } = change(item);
  const line = lineOf(by, op, extra);
  item.trail.push(line);
  await save(item);
  emitItemChanged({ item, line });
  await ackHolders(id, by);
  return answer(item, line);
}

async function ackHolders(id: string, by: string): Promise<void> {
  for (const holder of await holdersOf(id)) if (holder.kind === 'agent') await ackRecord(holder.name, by);
}

export interface NewItem {
  title: string;
  campaign_id?: string;
  objective?: string;
  status?: string;
  parent?: string | null;
  level?: number;
  kind?: string;
  /** Held from birth by this Team or Agent, in the same call and the same trail line. */
  holder?: Holder;
  priority?: string;
  attachments?: string[];
}

function checkFields(fields: { status?: unknown; level?: unknown }): void {
  if (fields.status !== undefined && !member(ITEM_STATUSES, fields.status)) throw new WorkItemBadInput(`status must be one of ${ITEM_STATUSES.join(', ')}.`);
  if (fields.level !== undefined && !member(ITEM_LEVELS, fields.level)) throw new WorkItemBadInput('level must be 1, 0 or -1.');
}

/** One below the parent, 0 with none (Jira's hierarchy). A default, never a guard. */
const levelUnder = (parent: WorkItem | null): ItemLevel => parent ? (parent.level - 1) as ItemLevel : 0;

/** THE ONE RULE (owner, 2026-10-22): nothing goes below -1. On a create, move or level
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

/** The children follow: each takes its new level, with one trail line saying why. */
async function settle(moved: Array<{ child: WorkItem; level: number }>, item: WorkItem, by: string): Promise<void> {
  for (const { child, level } of moved) {
    const next = await load(child.id);
    next.level = level as ItemLevel;
    const line = lineOf(by, 'edit', { note: `level ${level}, following ${item.id}` });
    next.trail.push(line);
    await save(next);
    emitItemChanged({ item: next, line });
  }
}

const blank = (title: string, by: string): WorkItem => ({
  id: '', campaign_id: '', title, objective: '', level: 0, status: 'IDEA', flagged: false, comments: [], parent: null,
  attachments: [], links: [], external: {}, trail: [], created: { at: new Date().toISOString(), by: by.trim() || 'unknown' },
});

/** An arrival under a held item is announced to its holder, one queued message: to the
 * Agent, or to a holding Team's lead, never to whoever made the change. An item held by
 * nobody notifies nobody. */
async function announceArrival(item: WorkItem, by: string): Promise<string[]> {
  if (!item.parent) return [];
  const told: string[] = [];
  for (const holder of await holdersOf(item.parent)) {
    const targets = holder.kind === 'agent' ? [holder.name] : await findLeads(holder.name);
    for (const target of targets.filter((name) => name !== by)) {
      await enqueueMessage(target, `${item.id} ${item.title} was added under ${item.parent}, which you hold. Handle it as you see fit.`, 'house', 'Work items');
      told.push(target);
    }
  }
  return told;
}

/** An unheld item belongs on its Campaign's unheld list: every Coordinator in the Campaign is
 * told, in one message naming the item. With no Coordinator, nobody is told. */
async function announceUnheld(item: WorkItem, by: string): Promise<string[]> {
  if ((await holdersOf(item.id)).length) return [];
  const sessions = (await listSessions()).filter((session) => session.campaign_id === item.campaign_id && session.name !== by);
  const { readAgentComposition } = await import('./agent-composition.js');
  const told: string[] = [];
  for (const session of sessions) {
    const role = await readAgentComposition(session.name).then((found) => found.current.role).catch(() => 'coworker');
    if (role !== 'coordinator') continue;
    const key = item.external.jira ? ` ${item.external.jira.key}` : '';
    await enqueueMessage(session.name, `${item.id}${key} '${item.title}' has no holders; place it (item read ${item.id}).`, 'house', 'Work items');
    told.push(session.name);
  }
  return told;
}

/** Issue an id and write the item. Unlocked: callers hold the issuer. */
export async function createItemUnlocked(input: NewItem, by: string): Promise<Acknowledged> {
  const title = String(input.title ?? '').trim();
  if (!title) throw new WorkItemBadInput('A work item needs a title.');
  checkFields(input);
  const parent = input.parent ? await load(input.parent) : null;
  const item: WorkItem = {
    ...blank(title, by),
    id: await nextId(),
    campaign_id: input.campaign_id ?? (await listSessions()).find((session) => session.name === by)?.campaign_id ?? await initialCampaignId(),
    objective: String(input.objective ?? '').trim(),
    level: (input.level as ItemLevel | undefined) ?? levelUnder(parent),
    ...(input.kind?.trim() ? { kind: input.kind.trim() } : {}),
    status: (input.status as ItemStatus | undefined) ?? 'IDEA',
    ...(input.priority?.trim() ? { priority: input.priority.trim() } : {}),
    parent: parent?.id ?? null,
    attachments: input.attachments ?? [],
  };
  await follow(item, item.parent, item.level);
  const list = input.holder ? await listFor(input.holder) : null;
  await save(item);
  if (list) { await list.set([...list.holds, item.id]); await ackHolds([input.holder ?? null], by); }
  const line = lineOf(by, 'create', { to: input.holder ? holderLabel(input.holder) : 'none', note: [item.title, item.parent ? `under ${item.parent}` : 'no parent'].join('; ') });
  item.trail.push(line);
  await save(item);
  emitItemChanged({ item, line });
  const notified = [...new Set([...await announceArrival(item, by), ...await announceUnheld(item, by)])];
  return { ...answer(item, line), notified };
}

export const createItem = (input: NewItem, by: string) => withIssuer(() => createItemUnlocked(input, by));

export interface ItemEdit {
  title?: string; objective?: string; status?: string; level?: number; kind?: string; priority?: string;
  /** A new parent id, or null for none; absent leaves it. Parent is a field, as in Jira. */
  parent?: string | null;
  external?: { trello?: string; github?: string };
  /** The pair, or null to drop it; absent leaves it. */
  jira?: JiraPair | null;
}

/** One call, one trail line. A lone status change is named by its own op (a transition), a
 * lone parent change by move ("w39 moved under w40, level -1"); anything else is edit. A new
 * parent sets the level one below it, or leaves it with none (Jira's convert/move), unless
 * the level is named too; the children follow under the one rule (follow). */
export function editItem(id: string, edit: ItemEdit, by: string, note?: string): Promise<Acknowledged> {
  checkFields(edit);
  if (edit.title !== undefined && !String(edit.title).trim()) throw new WorkItemBadInput('title cannot be empty.');
  return withIssuer(async () => {
    const current = await load(id);
    const reparent = edit.parent !== undefined && edit.parent !== current.parent;
    const under = reparent && edit.parent ? await load(edit.parent) : null;
    const parent = reparent ? under?.id ?? null : current.parent;
    const level = (edit.level as ItemLevel | undefined) ?? (under ? levelUnder(under) : current.level);
    const children = reparent || edit.level !== undefined ? await follow(current, parent, level) : [];
    const done = await appendTrail(id, by, (item) => {
      const changed: string[] = [];
      const before = item.status;
      const from = item.parent ?? 'none';
      if (reparent) { item.parent = parent; changed.push(`parent ${parent ?? 'none'}`); }
      if (level !== item.level) { item.level = level; changed.push(`level ${item.level}`); }
      if (edit.title !== undefined && edit.title.trim() !== item.title) { item.title = edit.title.trim(); changed.push('title'); }
      if (edit.objective !== undefined && edit.objective.trim() !== item.objective) { item.objective = edit.objective.trim(); changed.push('objective'); }
      if (edit.status !== undefined && edit.status !== item.status) { item.status = edit.status as ItemStatus; changed.push(`status ${item.status}`); }
      for (const key of ['kind', 'priority'] as const) {
        const value = edit[key]?.trim();
        if (value === undefined || value === (item[key] ?? '')) continue;
        if (value) item[key] = value; else delete item[key];
        changed.push(`${key} ${item[key] ?? 'blank'}`);
      }
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
      if (changed.length === 1 && changed[0]!.startsWith('status ')) return { op: 'status', from: before, to: item.status, note: said };
      if (reparent && changed.every((what) => /^(parent|level) /.test(what))) return { op: 'move', from, to: parent ?? 'none', note: `level ${item.level}` };
      return { op: 'edit', note: [said, changed.length ? changed.join(', ') : 'no change'].filter(Boolean).join('; ') };
    });
    await settle(children, done.item, by);
    return reparent ? { ...done, notified: await announceArrival(done.item, by) } : done;
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

/** Attachments live on the item, as paths. A path is absolute and must exist when attached. */
function attachment(target: string, remove: boolean): string {
  const at = String(target ?? '').trim();
  if (!at) throw new WorkItemBadInput('name the document to attach.');
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

/** Jira's issue link: this item blocks, or relates to, another. Kept on this item; a read of
 * the other shows it inward. */
export async function linkItem(id: string, type: string, to: string, by: string, remove = false): Promise<Acknowledged> {
  if (!member(LINK_TYPES, type)) throw new WorkItemBadInput('a link is blocks or relates.');
  return withIssuer(async () => {
    await load(to);
    return appendTrail(id, by, (item) => {
      const same = (link: Link) => link.type === type && link.to === to;
      if (remove) item.links = item.links.filter((link) => !same(link));
      else if (!item.links.some(same)) item.links.push({ type, to });
      const phrase = type === 'blocks' ? `blocks ${to}` : `relates to ${to}`;
      return { op: 'link', to, note: remove ? `${phrase}: link removed` : phrase };
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
      await ackHolders(other.id, by);
    }
    for (const at of deleted) {
      await ackHolds(await takeOffEveryList(at), by);
      await rm(fileOf(at));
    }
    return { deleted, orphaned };
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
  const key = await sessionKey(holder.name);
  const letter = await readLetterHolds(key) ?? (await seedTegami(holder.name) ? await readLetterHolds(key) : null);
  if (!letter) throw new WorkItemBadInput(`Agent "${holder.name}" has no work record to hold work in.`);
  return { holder, holds: letter.holds, set: (holds) => writeLetterHolds(key, holds) };
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

/** What the act did, read from its trail line alone: "w39 moved under w40, level -1",
 * "w9 moved to BUILD", "w9 is held by agent:x", "w12 was created". Status, kind and level
 * appear only when the act changed them. Every acknowledgement is this one line. */
export function didLine({ item, line }: Acknowledged): string {
  const what = line.op === 'status' ? `moved to ${line.to}`
    : line.op === 'move' ? (line.to === 'none' ? `moved to no parent, ${line.note}` : `moved under ${line.to}, ${line.note}`)
      : line.op === 'assign' ? `is held by ${line.to}`
        : line.op === 'handoff' ? (line.to === 'none' ? `${line.from} let go` : `was handed from ${line.from} to ${line.to}`)
        : line.op === 'release' || line.op === 'holder-ended' ? 'is held by nobody'
          : line.op === 'create' ? 'was created'
              : line.op === 'comment' ? (line.from ? `comment ${line.from} was edited` : `has a comment from ${line.by}: ${line.note}`)
              : line.op === 'flag' ? `is ${line.to === 'true' ? 'flagged' : 'unflagged'}${line.note ? `: ${line.note}` : ''}`
              : line.op === 'attach' ? (line.from === 'removed' ? `has ${line.to} removed` : `has ${line.to} attached`)
              : line.op === 'link' ? `${line.note}`
              : `changed: ${line.note ?? 'no change'}`;
  return `${item.id} ${what}`;
}

/** An Agent going away takes its list with it: each item it held gets one holder-ended
 * line and is found again under its parent or unassigned. Restore does not reclaim. */
export function releaseHolder(session: string, key: string, how: string): Promise<Acknowledged[]> {
  return withIssuer(async () => {
    const letter = await readLetterHolds(key);
    if (!letter?.holds.length) return [];
    const released: Acknowledged[] = [];
    // Off the list first, so the ended Agent is not acked for its own release.
    await writeLetterHolds(key, []);
    for (const id of letter.holds) {
      if (!(await readItem(id))) continue;
      released.push(await appendTrail(id, 'ronin', () => ({ op: 'holder-ended', from: `agent:${session}`, to: 'none', note: how })));
    }
    return released;
  });
}

/** The one place that knows the shape items had before 2026-10-22, for the migration
 * (Lab JIRA_SHAPE.md): `stage` is the status, a red colour is flagged, `exit`, the other colours and the
 * ladder are dropped, `docs` is `attachments`, an evidence line on the trail is a comment,
 * no level reads 0. */
function toShape(raw: Record<string, unknown>, campaign_id: string): WorkItem {
  const { stage, exit: _exit, ladder: _ladder, docs, attachments, status, flagged, level, kind, priority, comments, links, trail, ...rest } = raw;
  void _exit; void _ladder;
  const lines = (Array.isArray(trail) ? trail : []) as TrailLine[];
  const evidence = lines.filter((line) => (line.op as string) === 'evidence');
  return {
    ...(rest as unknown as WorkItem),
    campaign_id,
    level: member(ITEM_LEVELS, level) ? level : 0,
    ...(typeof kind === 'string' && kind ? { kind } : {}),
    ...(typeof priority === 'string' && priority ? { priority } : {}),
    comments: [...(Array.isArray(comments) ? comments as Comment[] : []), ...evidence.map((line) => ({ by: line.by, at: line.at, text: line.note ?? '' }))],
    attachments: (Array.isArray(attachments) ? attachments : Array.isArray(docs) ? docs : []) as string[],
    links: Array.isArray(links) ? links as Link[] : [],
    status: member(ITEM_STATUSES, status) ? status : member(ITEM_STATUSES, stage) ? stage : 'IDEA',
    flagged: typeof flagged === 'boolean' ? flagged : status === 'red',
    external: externalOf(rest.external),
    trail: lines.map((line) => (line.op as string) === 'evidence' ? { ...line, op: 'comment' } : line),
  };
}

/** A jira key stored as a string becomes the pair with no id yet: { id: '', key }. */
function externalOf(raw: unknown): External {
  const external = (raw && typeof raw === 'object' ? { ...raw } : {}) as Record<string, unknown>;
  if (typeof external.jira === 'string') external.jira = { id: '', key: external.jira };
  return external as External;
}

const inJiraShape = (raw: Record<string, unknown>): boolean =>
  'level' in raw && 'flagged' in raw && Array.isArray(raw.comments) && Array.isArray(raw.links) && Array.isArray(raw.attachments)
  && !('docs' in raw) && !('stage' in raw) && !('exit' in raw) && !('ladder' in raw)
  && !(Array.isArray(raw.trail) && raw.trail.some((line) => (line as TrailLine | null)?.op as string === 'evidence'))
  && typeof (raw.external as External | undefined)?.jira !== 'string';

/* THE ONE MIGRATION (Lab JIRA_SHAPE.md and JIRA_RONIN_BRIDGE.md), at first start: every item file in the Jira
 * shape (toShape); an item with children gets level 1, every other 0; the Unfiled epic (or
 * the "Common" root) goes and its items have no parent; kind stays as stored. An item
 * already in shape is stamped home_machine once. After it, only the current shape exists;
 * a second run changes nothing. Holder lists are not touched: an id left on one names nothing. */
export function migrateItems(by = 'ronin', campaign_id = 'home_machine'): Promise<{ before: number; after: number; migrated: string[]; removed: string[] }> {
  return withIssuer(async () => {
    let names: string[] = [];
    try { names = await readdir(dir()); } catch { return { before: 0, after: 0, migrated: [], removed: [] }; }
    const raws = new Map<string, Record<string, unknown>>();
    for (const name of names) {
      const id = name.endsWith('.json') ? name.slice(0, -5) : '';
      if (isItemId(id)) raws.set(id, JSON.parse(await readFile(fileOf(id), 'utf8')) as Record<string, unknown>);
    }
    const before = raws.size;
    const removed = [...raws].filter(([, raw]) => raw.parent === null && (raw.title === 'Unfiled' || raw.title === 'Common') && !('level' in raw)).map(([id]) => id);
    for (const id of removed) { await rm(fileOf(id)); raws.delete(id); }
    const parents = new Set([...raws.values()].map((raw) => raw.parent));
    const migrated: string[] = [];
    for (const [id, raw] of raws) {
      const unfiled = removed.includes(String(raw.parent));
      if (inJiraShape(raw) && 'campaign_id' in raw && !unfiled) continue;
      const item = toShape(
        { ...raw, ...('level' in raw ? {} : { level: parents.has(id) ? 1 : 0 }) },
        typeof raw.campaign_id === 'string' ? raw.campaign_id : campaign_id,
      );
      if (unfiled) item.parent = null;
      item.trail.push(lineOf(by, 'edit', { note: `migrated to the Jira shape${unfiled ? `; ${raw.parent} (Unfiled) was removed, so no parent` : ''}` }));
      await save(item);
      migrated.push(id);
    }
    return { before, after: raws.size, migrated, removed };
  });
}
