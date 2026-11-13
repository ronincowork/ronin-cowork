/**
 * THE LIVE INDEX (owner, 2026-11-11; w418; docs/architecture/project-management.md, The live
 * index). One JSON file of the live items, everything not archived: one flat row per item with
 * only what lists filter on or show. No objective, comments, trail or attachments: those are the
 * item's own file, read when the item is opened. The tree comes from `parent`.
 *
 * Lists, the Epics board, the work record, Waiting on you and the pills read rows only; opening an
 * item reads its row and its own file. Archived items and ended sessions are never read for live
 * work: archive takes the row out, and leaving Done puts it back.
 *
 * UPKEEP. Every item write (work-items.ts save, and each file removed) puts or drops its row, and
 * every holds-list write (a roster, a letter, a Workspace's holds; holds-hook.ts) sets that list,
 * in the same step as the write. The file is saved whole, through a temp file and a rename. It is
 * rebuilt from the item files and the holds lists at every start (the first read in a process),
 * and a process that sees another's save reads it back.
 */
import { statSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './resources.js';
import { letterListKey, onHoldsWritten, rosterListKey, workspaceListKey } from './holds-hook.js';
import { listTeamRosters } from './team-rosters.js';
import { listLetterHolds } from './tegami.js';
import { listWorkspaceHolds } from './workspaces.js';
import type { HandIn, ItemLevel, Link, WorkItem } from './work-items.js';

/** One live item as every list reads it. */
export interface ItemRow {
  id: string;
  campaign_id: string;
  kind: string;
  level: ItemLevel;
  status: string;
  flagged: boolean;
  parent: string | null;
  links: Link[];
  /** Every holder with it on its list (team:, agent:, workspace:<name>), Teams first. */
  holders: string[];
  title: string;
  /** Its Jira key when paired, else ''. */
  jira: string;
  /** The last hand-in only, as the pills and Waiting on you read it. */
  hand_ins: HandIn[];
  handed_in?: { by: string; at: string };
  on_dev?: { promotion: string; at: string };
  /** When it last changed: its last trail line, else its creation. */
  moved: string;
}

type Core = Omit<ItemRow, 'holders'>;
interface HoldsList { label: string; ids: string[] }
interface State { rows: Map<string, Core>; lists: Map<string, HoldsList>; on: Map<string, Set<string>>; aliases: Map<string, string> }

const ID = /^(w[1-9][0-9]*|[A-Z][A-Z0-9_]+-[1-9][0-9]*)$/;
const order = (id: string): [string, number] => { const [, prefix, n] = /^(.*?)-?([0-9]+)$/.exec(id)!; return [prefix!, Number(n)]; };
export const byRowId = (a: { id: string }, b: { id: string }): number => {
  const [pa, na] = order(a.id);
  const [pb, nb] = order(b.id);
  return pa === pb ? na - nb : pa === 'w' ? -1 : pb === 'w' ? 1 : pa.localeCompare(pb);
};

const itemsDir = () => storeDir('work_items');
/** Beside the item files; not an item id, so no item scan reads it. */
export const indexFile = () => path.join(itemsDir(), 'live-index.json');

export function rowOf(item: WorkItem): Core {
  return {
    id: item.id, campaign_id: item.campaign_id, kind: item.kind, level: item.level, status: item.status,
    flagged: Boolean(item.flagged), parent: item.parent ?? null, links: item.links ?? [], title: item.title,
    jira: item.external?.jira?.key ?? '',
    hand_ins: item.hand_ins?.length ? [item.hand_ins.at(-1)!] : [],
    ...(item.handed_in ? { handed_in: item.handed_in } : {}),
    ...(item.on_dev ? { on_dev: item.on_dev } : {}),
    moved: item.trail?.at(-1)?.at ?? item.created?.at ?? '',
  };
}

const rank = (label: string): number => label.startsWith('team:') ? 0 : label.startsWith('agent:') ? 1 : 2;
const holdersIn = (state: State, id: string): string[] =>
  [...new Set([...(state.on.get(id) ?? [])].map((key) => state.lists.get(key)!.label))]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

function setList(state: State, key: string, label: string, given: string[]): void {
  const ids = [...new Set(given.map((id) => state.aliases.get(id) ?? id))];
  for (const id of state.lists.get(key)?.ids ?? []) state.on.get(id)?.delete(key);
  if (!label) { state.lists.delete(key); return; } // the list itself is gone
  state.lists.set(key, { label, ids });
  for (const id of ids) { if (!state.on.has(id)) state.on.set(id, new Set()); state.on.get(id)!.add(key); }
}

function putCore(state: State, item: WorkItem): void {
  for (const line of item.trail ?? []) if (line.op === 'rename' && line.from) state.aliases.set(line.from, item.id);
  if (item.archived) state.rows.delete(item.id); else state.rows.set(item.id, rowOf(item));
}

/** The index as the files say now: every item file read once, every holds list read once. */
export async function buildState(): Promise<State> {
  const state: State = { rows: new Map(), lists: new Map(), on: new Map(), aliases: new Map() };
  let names: string[] = [];
  try { names = await readdir(itemsDir()); } catch { /* no store yet */ }
  const items = await Promise.all(names.filter((name) => name.endsWith('.json') && ID.test(name.slice(0, -5))).map((name) =>
    readFile(path.join(itemsDir(), name), 'utf8').then((text) => JSON.parse(text) as WorkItem).catch(() => null)));
  for (const item of items) if (item) putCore(state, item);
  for (const roster of await listTeamRosters()) setList(state, rosterListKey(roster.campaign_id, roster.name), `team:${roster.name}`, roster.holds);
  for (const letter of await listLetterHolds()) setList(state, letterListKey(letter.key), `agent:${letter.name}`, letter.holds);
  for (const w of await listWorkspaceHolds()) setList(state, workspaceListKey(w.campaign_id, w.name), `workspace:${w.name}`, w.holds);
  return state;
}

export const rowsOf = (state: State): ItemRow[] =>
  [...state.rows.values()].map((core) => ({ ...core, holders: holdersIn(state, core.id) })).sort(byRowId);

/* ---- the one index of this process ---- */

let live: State | null = null;
let building: Promise<State> | null = null;
/** Writes that came while a build was reading the files: applied to it when it lands. */
let during: Array<(state: State) => void> = [];
let savedStamp = '';
let saving: Promise<void> = Promise.resolve();
let dirty = false;

const stampOf = (file: string): string => { try { const st = statSync(file); return `${st.ino}:${st.size}:${st.mtimeMs}`; } catch { return ''; } };

function save(): void {
  if (dirty) return;
  dirty = true;
  saving = saving.then(async () => {
    dirty = false;
    if (!live) return;
    const file = indexFile();
    const body = { rows: rowsOf(live), lists: [...live.lists].map(([key, list]) => ({ key, ...list })), aliases: [...live.aliases] };
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    await writeFile(tmp, `${JSON.stringify(body)}\n`, 'utf8');
    await rename(tmp, file);
    savedStamp = stampOf(file);
  }).catch((error) => console.error('[work-items] saving the live index:', error));
}

function fromFile(text: string): State {
  const body = JSON.parse(text) as { rows: ItemRow[]; lists: Array<{ key: string; label: string; ids: string[] }>; aliases?: Array<[string, string]> };
  const state: State = { rows: new Map(), lists: new Map(), on: new Map(), aliases: new Map(body.aliases ?? []) };
  for (const { holders: _, ...core } of body.rows) state.rows.set(core.id, core);
  for (const list of body.lists) setList(state, list.key, list.label, list.ids);
  return state;
}

/** Rebuild from the files now: what a start does. Answers the rows. */
export async function rebuildIndex(): Promise<ItemRow[]> {
  if (building) await building.catch(() => null);
  during = [];
  building = buildState();
  try {
    const state = await building;
    for (const apply of during) apply(state);
    live = state;
  } finally { building = null; during = []; }
  save();
  await saving;
  return rowsOf(live!);
}

async function current(): Promise<State> {
  if (building) return building;
  if (!live) { await rebuildIndex(); return live!; }
  // Another process saved since this one did: its file is the newer truth.
  const stamp = stampOf(indexFile());
  if (stamp && savedStamp && stamp !== savedStamp && !dirty) {
    try { live = fromFile(await readFile(indexFile(), 'utf8')); savedStamp = stamp; } catch { /* keep what is in memory */ }
  }
  return live;
}

function change(apply: (state: State) => void): void {
  if (building) during.push(apply);
  if (!live) return; // not read yet in this process: the build reads the files
  apply(live);
  save();
}

/** Every live row, by id. */
export const liveRows = async (): Promise<ItemRow[]> => rowsOf(await current());
/** One live row, or null (archived, or no such item); any id it has had finds it. */
export async function liveRow(id: string): Promise<ItemRow | null> {
  const state = await current();
  const core = state.rows.get(state.aliases.get(id) ?? id);
  return core ? { ...core, holders: holdersIn(state, core.id) } : null;
}
/** Who holds this id now, by the index: the same answer the holds lists give. */
export async function holderLabels(id: string): Promise<string[]> {
  const state = await current();
  return holdersIn(state, state.aliases.get(id) ?? id);
}
/** Ids as the items go by now: an id from before a rename reads as the Jira key. */
export async function currentIds(ids: string[]): Promise<string[]> {
  const state = await current();
  return ids.map((id) => state.aliases.get(id) ?? id);
}
/** Every held id with its holders. */
export async function heldLabels(): Promise<Map<string, string[]>> {
  const state = await current();
  return new Map([...state.on.keys()].map((id) => [id, holdersIn(state, id)] as [string, string[]]).filter(([, labels]) => labels.length));
}

/** An item was saved: its row now (out when archived, back when it leaves archive). */
export const itemWritten = (item: WorkItem): void => change((state) => putCore(state, item));
/** An item file was removed (a delete, or the old file of a rename). */
export const itemRemoved = (id: string): void => change((state) => { state.rows.delete(id); });

onHoldsWritten((key, label, ids) => change((state) => setList(state, key, label, ids)));

/** Every holds list, as HeldList reads them: its key, its holder label, its ids (empty kept). */
export async function holdsLists(): Promise<Array<{ key: string; label: string; ids: string[] }>> {
  return [...(await current()).lists].map(([key, list]) => ({ key, label: list.label, ids: [...list.ids] }));
}

/** Tests and the index check: wait for the last save. */
export const indexSaved = (): Promise<void> => saving;
