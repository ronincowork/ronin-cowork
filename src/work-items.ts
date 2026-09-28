/**
 * THE WORK ITEM STORE — one item type, stored once, keyed by id.
 *
 * The only module that reads or writes an item file. Everything else reaches items through
 * the /api/work-items routes (src/routes/work-items-api.ts), and every change here appends
 * exactly one line to the item's trail, naming who called. Nothing is locked against
 * anyone: holding is discovery, never permission. The one refusal is a reparent that would
 * form a cycle, answered REFUSED with the chain named.
 *
 * One file per item, <store>/<id>.json, written beside and renamed over. Ids come from one
 * global issuer (w1, w2, …) under one in-process lock that every write shares, so a trail
 * append is read, push, write with nobody in between.
 */
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './resources.js';
import { sessionKey } from './session-dir.js';
import { listTeamRosters, readTeamRoster, writeTeamRoster } from './team-rosters.js';
import { listLetterHolds, readLetterHolds, seedTegami, writeLetterHolds } from './tegami.js';

export const ITEM_STAGES = ['IDEA', 'PLAN', 'BUILD', 'REVIEW', 'LAND', 'DONE'] as const;
export const ITEM_EXITS = ['none', 'agent', 'lead', 'user'] as const;
export const ITEM_STATUSES = ['green', 'yellow', 'red'] as const;
export const RUNG_STATUSES = ['PLANNED', 'ACTIVE', 'DONE'] as const;
export const TRAIL_OPS = ['create', 'assign', 'release', 'reparent', 'stage', 'status', 'exit', 'edit', 'evidence', 'holder-ended'] as const;

export type ItemStage = typeof ITEM_STAGES[number];
export type ItemExit = typeof ITEM_EXITS[number];
export type ItemStatus = typeof ITEM_STATUSES[number];
export type RungStatus = typeof RUNG_STATUSES[number];
export type TrailOp = typeof TRAIL_OPS[number];

export interface Leg { title: string; status: RungStatus }
/** A rung is a phase holding legs, or a gate. Phases and legs are never items. */
export interface Rung { phase?: string; gate?: string; status?: RungStatus; legs?: Leg[] }
export interface TrailLine { at: string; by: string; op: TrailOp; from?: string; to?: string; note?: string }
export interface External { trello?: string; jira?: string; github?: string }

export interface WorkItem {
  id: string;
  title: string;
  objective: string;
  stage: ItemStage;
  exit: ItemExit;
  status: ItemStatus;
  parent: string | null;
  ladder: Rung[];
  docs: string[];
  external: External;
  trail: TrailLine[];
  created: { at: string; by: string };
}

/** What every write answers: the item as it now is, and the line it appended. */
export interface Acknowledged { item: WorkItem; line: TrailLine }

export class WorkItemRefused extends Error {}
export class WorkItemMissing extends Error {}
export class WorkItemBadInput extends Error {}

const ID = /^w[1-9][0-9]*$/;
export const isItemId = (value: string): boolean => ID.test(value);

const dir = () => storeDir('work_items');
const fileOf = (id: string) => path.join(dir(), `${id}.json`);

const member = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

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

export function checkLadder(value: unknown): Rung[] {
  if (!Array.isArray(value)) throw new WorkItemBadInput('ladder must be a list of rungs.');
  return value.map((raw, index) => {
    const at = index + 1;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new WorkItemBadInput(`rung ${at} is not an object.`);
    const r = raw as Record<string, unknown>;
    if ((typeof r.gate === 'string') === (typeof r.phase === 'string')) throw new WorkItemBadInput(`rung ${at} must be a gate OR a phase — exactly one of them.`);
    if (r.status !== undefined && !member(RUNG_STATUSES, r.status)) throw new WorkItemBadInput(`rung ${at} status must be PLANNED, ACTIVE or DONE.`);
    if (typeof r.gate === 'string') return { gate: r.gate, status: (r.status as RungStatus | undefined) ?? 'PLANNED' };
    const rung: Rung = { phase: r.phase as string, ...(r.status ? { status: r.status as RungStatus } : {}) };
    if (r.legs !== undefined) {
      if (!Array.isArray(r.legs)) throw new WorkItemBadInput(`rung ${at} legs must be a list.`);
      rung.legs = r.legs.map((leg, j) => {
        const l = (leg ?? {}) as Record<string, unknown>;
        if (typeof l.title !== 'string') throw new WorkItemBadInput(`rung ${at} leg ${j + 1} needs a "title".`);
        const status = l.status ?? 'PLANNED';
        if (!member(RUNG_STATUSES, status)) throw new WorkItemBadInput(`rung ${at} leg ${j + 1} status must be PLANNED, ACTIVE or DONE.`);
        return { title: l.title, status };
      });
    }
    return rung;
  });
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
export async function appendTrail(id: string, by: string, change: (item: WorkItem) => Omit<TrailLine, 'at' | 'by'>): Promise<Acknowledged> {
  const item = await load(id);
  const { op, ...extra } = change(item);
  const line = lineOf(by, op, extra);
  item.trail.push(line);
  await save(item);
  return { item, line };
}

export interface NewItem {
  title: string;
  objective?: string;
  stage?: string;
  exit?: string;
  status?: string;
  parent?: string | null;
}

function checkFields(fields: { stage?: unknown; exit?: unknown; status?: unknown }): void {
  if (fields.stage !== undefined && !member(ITEM_STAGES, fields.stage)) throw new WorkItemBadInput(`stage must be one of ${ITEM_STAGES.join(', ')}.`);
  if (fields.exit !== undefined && !member(ITEM_EXITS, fields.exit)) throw new WorkItemBadInput(`exit must be one of ${ITEM_EXITS.join(', ')}.`);
  if (fields.status !== undefined && !member(ITEM_STATUSES, fields.status)) throw new WorkItemBadInput(`status must be one of ${ITEM_STATUSES.join(', ')}.`);
}

/** Issue an id and write the item. Unlocked: callers hold the issuer. */
export async function createItemUnlocked(input: NewItem, by: string): Promise<Acknowledged> {
  const title = String(input.title ?? '').trim();
  if (!title) throw new WorkItemBadInput('A work item needs a title.');
  checkFields(input);
  if (input.parent) await load(input.parent);
  const at = new Date().toISOString();
  const item: WorkItem = {
    id: await nextId(),
    title,
    objective: String(input.objective ?? '').trim(),
    stage: (input.stage as ItemStage | undefined) ?? 'IDEA',
    exit: (input.exit as ItemExit | undefined) ?? 'none',
    status: (input.status as ItemStatus | undefined) ?? 'yellow',
    parent: input.parent || null,
    ladder: [],
    docs: [],
    external: {},
    trail: [],
    created: { at, by: by.trim() || 'unknown' },
  };
  const line = lineOf(by, 'create', { note: item.title, ...(item.parent ? { to: item.parent } : {}) });
  item.trail.push(line);
  await save(item);
  return { item, line };
}

export const createItem = (input: NewItem, by: string) => withIssuer(() => createItemUnlocked(input, by));

export interface ItemEdit { title?: string; objective?: string; stage?: string; exit?: string; status?: string; ladder?: unknown }

/** One call, one trail line. A lone stage, status or exit change is named by its own op;
 * a status set with an exit (working, ready, stuck, blocked) is one status line. */
export function editItem(id: string, edit: ItemEdit, by: string, note?: string): Promise<Acknowledged> {
  checkFields(edit);
  const ladder = edit.ladder === undefined ? undefined : checkLadder(edit.ladder);
  if (edit.title !== undefined && !String(edit.title).trim()) throw new WorkItemBadInput('title cannot be empty.');
  return withIssuer(() => appendTrail(id, by, (item) => {
    const changed: string[] = [];
    const before = { stage: item.stage, status: item.status, exit: item.exit };
    if (edit.title !== undefined && edit.title.trim() !== item.title) { item.title = edit.title.trim(); changed.push('title'); }
    if (edit.objective !== undefined && edit.objective.trim() !== item.objective) { item.objective = edit.objective.trim(); changed.push('objective'); }
    if (ladder !== undefined) { item.ladder = ladder; changed.push('ladder'); }
    if (edit.stage !== undefined && edit.stage !== item.stage) { item.stage = edit.stage as ItemStage; changed.push('stage'); }
    if (edit.status !== undefined && edit.status !== item.status) { item.status = edit.status as ItemStatus; changed.push('status'); }
    if (edit.exit !== undefined && edit.exit !== item.exit) { item.exit = edit.exit as ItemExit; changed.push('exit'); }
    const said = note || undefined;
    if (changed.length === 1 && changed[0] === 'stage') return { op: 'stage', from: before.stage, to: item.stage, note: said };
    if (changed.length === 1 && changed[0] === 'exit') return { op: 'exit', from: before.exit, to: item.exit, note: said };
    if (changed.every((field) => field === 'status' || field === 'exit') && changed.includes('status')) {
      return { op: 'status', from: before.status, to: item.status, note: [said, changed.includes('exit') ? `exit ${before.exit} → ${item.exit}` : ''].filter(Boolean).join('; ') };
    }
    return { op: 'edit', note: [said, changed.length ? changed.join(', ') : 'no change'].filter(Boolean).join('; ') };
  }));
}

export function addEvidence(id: string, text: string, by: string): Promise<Acknowledged> {
  const note = String(text ?? '').trim();
  if (!note) throw new WorkItemBadInput('evidence needs its text: a fact with a receipt.');
  return withIssuer(() => appendTrail(id, by, () => ({ op: 'evidence', note })));
}

/** Documents live on the item. Paths are absolute and must exist when listed. */
export function editDocs(id: string, change: { add?: string; remove?: string }, by: string): Promise<Acknowledged> {
  const add = change.add?.trim();
  const remove = change.remove?.trim();
  if (Boolean(add) === Boolean(remove)) throw new WorkItemBadInput('docs takes one of add or remove, one path at a time.');
  const target = (add || remove)!;
  if (!path.isAbsolute(target)) throw new WorkItemBadInput(`${target} is not an absolute path.`);
  if (add) {
    if (!existsSync(target)) throw new WorkItemBadInput(`no such file: ${target}`);
    if (statSync(target).isDirectory()) throw new WorkItemBadInput(`${target} is a directory; the list holds documents.`);
  }
  return withIssuer(() => appendTrail(id, by, (item) => {
    const kept = item.docs.filter((doc) => doc !== target);
    item.docs = add ? [target, ...kept] : kept;
    return { op: 'edit', note: `${add ? 'doc listed' : 'doc unlisted'}: ${target}` };
  }));
}

/** The one refusal: a parent chain may never come back to the item. */
export function reparentItem(id: string, parent: string | null, by: string): Promise<Acknowledged> {
  return withIssuer(async () => {
    await load(id);
    if (parent) {
      const chain = [id];
      let at: string | null = parent;
      while (at) {
        chain.push(at);
        if (at === id) throw new WorkItemRefused(`REFUSED: ${id} under ${parent} would form a cycle: ${chain.join(' → ')}.`);
        at = (await load(at)).parent;
      }
    }
    return appendTrail(id, by, (item) => {
      const from = item.parent ?? undefined;
      item.parent = parent;
      return { op: 'reparent', from: from ?? 'none', to: parent ?? 'none' };
    });
  });
}

/* HOLDING — a list of item ids on each Team (roster.holds) and each Agent (the letter's
 * holds). Assignment moves an id between lists and never touches the item's content or
 * parent; release takes it off every list. Both run under the issuer lock, so two
 * concurrent assigns leave the id on exactly one list. */

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

/** Who holds this id now: nobody, or (after any old race) everyone found with it. */
export async function holdersOf(id: string): Promise<Holder[]> {
  return (await heldLists()).filter((list) => list.holds.includes(id)).map((list) => list.holder);
}

export async function holdsOf(holder: Holder): Promise<string[]> {
  if (holder.kind === 'team') return (await readTeamRoster(holder.name))?.holds ?? [];
  return (await readLetterHolds(await sessionKey(holder.name)))?.holds ?? [];
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

export async function assignUnlocked(id: string, to: Holder, by: string, note?: string): Promise<Acknowledged> {
  await load(id);
  const target = await listFor(to);
  const from = await takeOffEveryList(id, to);
  if (!target.holds.includes(id)) await target.set([...target.holds, id]);
  return appendTrail(id, by, () => ({ op: 'assign', from: labels(from), to: holderLabel(to), note }));
}

export const assignItem = (id: string, to: Holder, by: string, note?: string) => withIssuer(() => assignUnlocked(id, to, by, note));

/** Park: the id leaves every list. It is found again under its parent, or unassigned. */
export function releaseItem(id: string, by: string, note?: string): Promise<Acknowledged> {
  return withIssuer(async () => {
    await load(id);
    const from = await takeOffEveryList(id);
    return appendTrail(id, by, () => ({ op: 'release', from: labels(from), to: 'none', note }));
  });
}
