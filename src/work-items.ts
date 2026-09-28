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
import { getTags } from './tmux.js';
import { listTeamRosters, readTeamRoster, writeTeamRoster } from './team-rosters.js';
import { listLetterHolds, readLetterHolds, seedTegami, writeLetterAt, writeLetterHolds } from './tegami.js';

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
  /** Held from birth by this Team or Agent, in the same call and the same trail line. */
  holder?: Holder;
  ladder?: Rung[];
  docs?: string[];
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
    ladder: input.ladder ?? [],
    docs: input.docs ?? [],
    external: {},
    trail: [],
    created: { at, by: by.trim() || 'unknown' },
  };
  if (input.holder) {
    const list = await listFor(input.holder);
    await save(item);
    await list.set([...list.holds, item.id]);
  }
  const line = lineOf(by, 'create', { to: input.holder ? holderLabel(input.holder) : 'none', note: item.parent ? `${item.title}; under ${item.parent}` : item.title });
  item.trail.push(line);
  await save(item);
  return { item, line };
}

export const createItem = (input: NewItem, by: string) => withIssuer(() => createItemUnlocked(input, by));

export interface ItemEdit { title?: string; objective?: string; stage?: string; exit?: string; status?: string; ladder?: unknown; evidence?: string }

/** One call, one trail line. Evidence names the line when given (the fact, plus what else
 * changed); a lone stage, status or exit change is named by its own op; a status set with
 * an exit (working, ready, stuck, blocked) is one status line; anything else is edit. */
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
    const evidence = edit.evidence?.trim();
    if (evidence) return { op: 'evidence', note: [evidence, changed.length ? `also ${changed.join(', ')}` : ''].filter(Boolean).join('; ') };
    if (changed.length === 1 && changed[0] === 'stage') return { op: 'stage', from: before.stage, to: item.stage, note: said };
    if (changed.length === 1 && changed[0] === 'exit') return { op: 'exit', from: before.exit, to: item.exit, note: said };
    if (changed.every((field) => field === 'status' || field === 'exit') && changed.includes('status')) {
      return { op: 'status', from: before.status, to: item.status, note: [said, changed.includes('exit') ? `exit ${before.exit} → ${item.exit}` : ''].filter(Boolean).join('; ') };
    }
    return { op: 'edit', note: [said, changed.length ? changed.join(', ') : 'no change'].filter(Boolean).join('; ') };
  }));
}

/** Documents live on the item. Paths are absolute and must exist when listed. */
function docsChange(change: { add?: string; remove?: string }): { target: string; add: boolean } {
  const add = change.add?.trim();
  const remove = change.remove?.trim();
  if (Boolean(add) === Boolean(remove)) throw new WorkItemBadInput('docs takes one of add or remove, one path at a time.');
  const target = (add || remove)!;
  if (!path.isAbsolute(target)) throw new WorkItemBadInput(`${target} is not an absolute path.`);
  if (add) {
    if (!existsSync(target)) throw new WorkItemBadInput(`no such file: ${target}`);
    if (statSync(target).isDirectory()) throw new WorkItemBadInput(`${target} is a directory; the list holds documents.`);
  }
  return { target, add: Boolean(add) };
}

function applyDocs(item: WorkItem, { target, add }: { target: string; add: boolean }): Omit<TrailLine, 'at' | 'by'> {
  const kept = item.docs.filter((doc) => doc !== target);
  item.docs = add ? [target, ...kept] : kept;
  return { op: 'edit', note: `${add ? 'doc listed' : 'doc unlisted'}: ${target}` };
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

/** Back from DONE to the stage it left, held by the Team again: one call, one line. */
export function restoreItem(id: string, team: string, by: string): Promise<Acknowledged> {
  return withIssuer(async () => {
    const before = await load(id);
    const left = [...before.trail].reverse().find((line) => line.op === 'stage' && line.to === 'DONE')?.from;
    const stage: ItemStage = before.stage !== 'DONE' ? before.stage : member(ITEM_STAGES, left) && left !== 'DONE' ? left : 'BUILD';
    const to: Holder = { kind: 'team', name: team };
    const target = await listFor(to);
    const from = await takeOffEveryList(id, to);
    if (!target.holds.includes(id)) await target.set([...target.holds, id]);
    return appendTrail(id, by, (item) => {
      const note = item.stage === stage ? 'restored' : `restored; stage ${item.stage} → ${stage}`;
      item.stage = stage;
      return { op: 'assign', from: labels(from), to: holderLabel(to), note };
    });
  });
}

/** An Agent gives an item back: to the named Team, or to its one Team; with no Team to
 * give it to, the item is released and is found under its parent or unassigned. */
export async function returnItem(id: string, session: string, by: string, team?: string): Promise<Acknowledged> {
  const teams = team ? [team] : (await getTags(session).catch(() => [] as string[]));
  if (teams.length === 1) return assignItem(id, { kind: 'team', name: teams[0]! }, by, `returned by ${session}`);
  return releaseItem(id, by, teams.length ? `returned by ${session}; on ${teams.length} Teams, so released — name one with --team` : `returned by ${session}; on no Team, so released`);
}

/** Point an Agent's focus at an item it holds. The focus is the letter's, not the item's. */
export async function focusItem(session: string, id: string): Promise<boolean> {
  return withIssuer(async () => {
    const key = await sessionKey(session);
    const letter = await readLetterHolds(key);
    if (!letter?.holds.includes(id)) return false;
    await writeLetterHolds(key, letter.holds, id);
    return true;
  });
}

/** Acknowledgements nag, tools do not: every acknowledgement that touches an item ends
 * with this line, naming the item and the write that keeps its words current. */
export function keepCurrentLine({ item, line }: Acknowledged): string {
  const what = line.op === 'stage' ? `moved to ${String(line.to).toLowerCase()}`
    : line.op === 'assign' ? `is held by ${line.to}`
      : line.op === 'release' || line.op === 'holder-ended' ? 'is held by nobody'
        : line.op === 'create' ? 'was created'
          : `changed (${line.op})`;
  return `${item.id} ${what}. Keep it current: work-record project write ${item.id} --objective "<what it is now>" --evidence "<a fact with its receipt>"`;
}

/* THE LADDER LIVES ON THE ITEM. An Agent's ladder is the ladder of its focus item (the
 * letter's at.item, else the first item it holds). A write with nothing held creates one
 * item for it, held by the Agent, titled from its objective: no break. Phases and legs are
 * never items. */

export type LadderEdit = string[];

const shapeOf = (ladder: Rung[]): string => JSON.stringify(ladder.map((r) =>
  r.gate !== undefined ? ['gate', r.gate] : ['phase', r.phase, (r.legs ?? []).map((leg) => leg.title)]));

/** The field verbs, applied in order: phase, gate, rung, leg, status, drop. Positions are
 * N or N.M as the rung sits on the ladder. Returns what each did. */
export function applyLadderEdits(ladder: Rung[], edits: LadderEdit[]): string[] {
  const said: string[] = [];
  const pos = (word: string, verb: string, want?: 'rung' | 'leg'): { rung: Rung; leg: Leg | null } => {
    const parts = String(word ?? '').split('.');
    if (parts.length > 2 || !parts.every((part) => /^\d+$/.test(part))) throw new WorkItemBadInput(`${verb} takes a position as work-record read --rungs prints it — N or N.M — not "${word}".`);
    const ri = Number(parts[0]);
    const li = parts[1] === undefined ? null : Number(parts[1]);
    if (ri < 1 || ri > ladder.length) throw new WorkItemBadInput(`${verb}: rung ${ri} is out of range (1..${ladder.length}).`);
    const rung = ladder[ri - 1]!;
    if (li === null) {
      if (want === 'leg') throw new WorkItemBadInput(`${verb}: rung ${ri} is a ${rung.gate !== undefined ? 'gate' : 'phase'} — name a leg, N.M.`);
      return { rung, leg: null };
    }
    if (rung.gate !== undefined) throw new WorkItemBadInput(`${verb}: rung ${ri} is a gate and has no legs.`);
    const legs = rung.legs ?? [];
    if (li < 1 || li > legs.length) throw new WorkItemBadInput(`${verb}: rung ${ri} has ${legs.length} leg(s); ${li} is out of range.`);
    return { rung, leg: legs[li - 1]! };
  };
  for (const [verb, a = '', b = ''] of edits) {
    if (verb === 'phase') { ladder.push({ phase: a.trim(), status: 'PLANNED', legs: [] }); said.push(`phase ${ladder.length} added`); }
    else if (verb === 'gate') { ladder.push({ gate: a.trim(), status: 'PLANNED' }); said.push(`gate ${ladder.length} added`); }
    else if (verb === 'rung') {
      const { rung } = pos(a, '--rung', 'rung');
      if (rung.gate !== undefined) rung.gate = b.trim(); else rung.phase = b.trim();
      said.push(`rung ${a} retitled`);
    } else if (verb === 'leg') {
      if (a.includes('.')) { pos(a, '--leg', 'leg').leg!.title = b.trim(); said.push(`leg ${a} retitled`); }
      else {
        const { rung } = pos(a, '--leg', 'rung');
        if (rung.gate !== undefined) throw new WorkItemBadInput(`--leg: rung ${a} is a gate; legs belong to a phase.`);
        (rung.legs ??= []).push({ title: b.trim(), status: 'PLANNED' });
        said.push(`leg ${a}.${rung.legs.length} added`);
      }
    } else if (verb === 'status') {
      const status = b.trim().toUpperCase();
      if (!member(RUNG_STATUSES, status)) throw new WorkItemBadInput(`--status takes PLANNED, ACTIVE or DONE, not "${b}".`);
      const { rung, leg } = pos(a, '--status');
      (leg ?? rung).status = status;
      said.push(`${a} -> ${status}`);
    } else if (verb === 'drop') {
      const { rung, leg } = pos(a, '--drop');
      if (leg) rung.legs = (rung.legs ?? []).filter((x) => x !== leg);
      else ladder.splice(ladder.indexOf(rung), 1);
      said.push(`${a} dropped`);
    } else throw new WorkItemBadInput(`unknown ladder verb "${verb}".`);
  }
  return said;
}

interface Focus { key: string; objective: string; id: string | null }

async function focusUnlocked(session: string): Promise<Focus> {
  const key = await sessionKey(session);
  const letter = await readLetterHolds(key) ?? (await seedTegami(session) ? await readLetterHolds(key) : null);
  if (!letter) throw new WorkItemBadInput(`Agent "${session}" has no work record.`);
  const at = typeof letter.at?.item === 'string' && letter.holds.includes(letter.at.item) ? letter.at.item : null;
  return { key, objective: letter.objective, id: at ?? letter.holds[0] ?? null };
}

/** The item a write with nothing held makes: held by the Agent, titled from its objective. */
async function firstItem(session: string, focus: Focus, by: string, fill: Pick<NewItem, 'ladder' | 'docs'>, said: string): Promise<Acknowledged> {
  const made = await createItemUnlocked({
    title: focus.objective.trim() || `${session}'s work`, objective: focus.objective, stage: 'BUILD', holder: { kind: 'agent', name: session }, ...fill,
  }, by);
  made.line.note = `${made.line.note}; ${said}`;
  await save(made.item);
  return made;
}

export interface LadderWrite { edits?: LadderEdit[]; ladder?: unknown }

export function writeFocusLadder(session: string, change: LadderWrite, by: string): Promise<Acknowledged & { said: string[] }> {
  return withIssuer(async () => {
    const focus = await focusUnlocked(session);
    const apply = (ladder: Rung[]): { ladder: Rung[]; said: string[] } => {
      if (change.ladder !== undefined) {
        const whole = checkLadder(change.ladder);
        return { ladder: whole, said: [`ladder saved (${whole.length} rungs)`] };
      }
      const next = structuredClone(ladder);
      return { ladder: next, said: applyLadderEdits(next, change.edits ?? []) };
    };
    if (!focus.id) {
      const { ladder, said } = apply([]);
      return { ...(await firstItem(session, focus, by, { ladder }, said.join('; '))), said };
    }
    let said: string[] = [];
    let moved = false;
    const done = await appendTrail(focus.id, by, (item) => {
      const next = apply(item.ladder);
      moved = shapeOf(item.ladder) !== shapeOf(next.ladder);
      item.ladder = next.ladder;
      said = next.said;
      return { op: 'edit', note: `ladder: ${said.join('; ')}` };
    });
    // A position is an index into this ladder's shape: when the shape moves, it goes.
    if (moved) await writeLetterAt(focus.key, { item: focus.id });
    return { ...done, said };
  });
}

export function writeFocusDocs(session: string, change: { add?: string; remove?: string }, by: string): Promise<Acknowledged> {
  const docs = docsChange(change);
  return withIssuer(async () => {
    const focus = await focusUnlocked(session);
    if (focus.id) return appendTrail(focus.id, by, (item) => applyDocs(item, docs));
    if (!docs.add) throw new WorkItemBadInput(`@${session} holds no work item, so no documents are listed.`);
    return firstItem(session, focus, by, { docs: [docs.target] }, `doc listed: ${docs.target}`);
  });
}

/** A monitor or lead places the Agent on its focus ladder. The marker carries the ladder:
 * everything before it reads DONE (never downgrading what the Agent marked), the marked
 * leg reads ACTIVE. `none` clears the position. */
export function placeFocus(session: string, want: string, by: string): Promise<Acknowledged> {
  return withIssuer(async () => {
    const focus = await focusUnlocked(session);
    if (!focus.id) throw new WorkItemBadInput(`@${session} holds no work item, so there is no ladder to place it on.`);
    const id = focus.id;
    let at: { item: string; rung?: number; leg?: number } = { item: id };
    const done = await appendTrail(id, by, (item) => {
      if (want === 'none') return { op: 'edit', note: 'position cleared' };
      if (!/^\d+(\.\d+)?$/.test(want)) throw new WorkItemBadInput('--at takes a position from work-record read --rungs — N or N.M — or none.');
      const [ri, li] = want.split('.').map(Number) as [number, number | undefined];
      const rung = item.ladder[ri - 1];
      if (!rung) throw new WorkItemBadInput(`rung ${ri} is out of range (1..${item.ladder.length}).`);
      if (rung.gate !== undefined && li !== undefined) throw new WorkItemBadInput(`rung ${ri} is a gate — it has no legs, use --at ${ri}.`);
      if (rung.gate === undefined && li === undefined) throw new WorkItemBadInput(`rung ${ri} is a phase — point at one of its legs, e.g. --at ${ri}.1.`);
      if (li !== undefined && (li < 1 || li > (rung.legs ?? []).length)) throw new WorkItemBadInput(`rung ${ri} has ${(rung.legs ?? []).length} leg(s); ${li} is out of range.`);
      item.ladder.forEach((r, i) => {
        if (r.gate !== undefined) { if (i + 1 < ri) r.status = 'DONE'; return; }
        (r.legs ?? []).forEach((leg, j) => {
          if (i + 1 === ri && li === j + 1) leg.status = 'ACTIVE';
          else if (leg.status !== 'DONE' && (i + 1 < ri || (i + 1 === ri && li !== undefined && j + 1 < li))) leg.status = 'DONE';
        });
      });
      at = li === undefined ? { item: id, rung: ri } : { item: id, rung: ri, leg: li };
      return { op: 'edit', note: `position ${want}` };
    });
    await writeLetterAt(focus.key, at);
    return done;
  });
}

/** An Agent going away takes its list with it: each item it held gets one holder-ended
 * line and is found again under its parent or unassigned. Restore does not reclaim. */
export function releaseHolder(session: string, key: string, how: string): Promise<Acknowledged[]> {
  return withIssuer(async () => {
    const letter = await readLetterHolds(key);
    if (!letter?.holds.length) return [];
    const released: Acknowledged[] = [];
    for (const id of letter.holds) {
      if (!(await readItem(id))) continue;
      released.push(await appendTrail(id, 'ronin', () => ({ op: 'holder-ended', from: `agent:${session}`, to: 'none', note: how })));
    }
    await writeLetterHolds(key, []);
    return released;
  });
}
