/**
 * THE LIBRARY (owner, 2026-11-22; KAN-767; docs/using-ronin/library.md): a catalog, as behaviours
 * and tools are. The files are the library, read when asked: stock in ronin_catalogs/library/,
 * the person's own in ~/ronin/library_items/, which replaces stock by id, whole. One file per
 * item tree, its name its id (LIBRARY-1-onboarding.md is LIBRARY-1); a new one takes the next
 * free number. Nothing of it is in the work-item store.
 *
 *   # <the epic's title>
 *
 *   <the epic's text>
 *
 *   ## <a task's title>
 *   <its text>
 *
 *   ### <a subtask of that task>
 *   <its text>
 *
 * Checking one out makes plain live items from the file, held by the receiver: no link back.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { STOCK_DIR, storeDir } from './resources.js';
import { createItem, handedNotice, listItems, readItem, WorkItemBadInput, WorkItemMissing, type Holder, type WorkItem } from './work-items.js';
import { enqueueMessage } from './message-queue.js';
import { listSessions } from './tmux.js';
import { readTeamRoster } from './team-rosters.js';

export const stockLibraryDir = (): string => path.join(STOCK_DIR, 'library');
export const userLibraryDir = (): string => storeDir('library_items');

export const LIBRARY_ID = /^LIBRARY-[1-9][0-9]*$/;
export const isLibraryId = (id: string): boolean => LIBRARY_ID.test(String(id ?? '').trim());

export interface LibraryPart { title: string; text: string; under: LibraryPart[] }
export interface LibraryItem extends LibraryPart { id: string; file: string; origin: 'stock' | 'user' }

/** One file: the title, the epic's text up to the first `## `, then each `## ` task with its text
 * and the `### ` subtasks under it. */
export function parseLibrary(source: string): LibraryPart {
  type Open = LibraryPart & { body: string[]; under: Open[] };
  const epic: Open = { title: '', text: '', under: [], body: [] };
  let into: Open = epic;
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    const heading = /^(#|##|###)\s+(.+?)\s*$/.exec(line);
    if (heading?.[1] === '#' && !epic.title) { epic.title = heading[2]!; continue; }
    if (heading?.[1] === '##') { into = { title: heading[2]!, text: '', under: [], body: [] }; epic.under.push(into); continue; }
    if (heading?.[1] === '###' && epic.under.length) { into = { title: heading[2]!, text: '', under: [], body: [] }; epic.under.at(-1)!.under.push(into); continue; }
    into.body.push(line);
  }
  const done = (part: Open): LibraryPart => ({ title: part.title, text: part.body.join('\n').trim(), under: part.under.map(done) });
  return done(epic);
}

/** The file a tree is written as. */
export function libraryText(part: LibraryPart): string {
  const out = [`# ${part.title}`, '', ...(part.text ? [part.text, ''] : [])];
  for (const task of part.under) {
    out.push(`## ${task.title}`, ...(task.text ? [task.text] : []), '');
    for (const sub of task.under) out.push(`### ${sub.title}`, ...(sub.text ? [sub.text] : []), '');
  }
  return `${out.join('\n').trimEnd()}\n`;
}

const idOf = (file: string): string | null => /^(LIBRARY-[1-9][0-9]*)(-.*)?\.md$/.exec(file)?.[1] ?? null;
const numberOf = (id: string): number => Number(id.slice('LIBRARY-'.length));

async function filesIn(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try { for (const file of (await readdir(dir)).sort()) { const id = idOf(file); if (id && !out.has(id)) out.set(id, path.join(dir, file)); } } catch { /* none */ }
  return out;
}

/** Every library item, the person's own over stock by id, by number. */
export async function listLibrary(): Promise<LibraryItem[]> {
  const [stock, user] = await Promise.all([filesIn(stockLibraryDir()), filesIn(userLibraryDir())]);
  const ids = [...new Set([...stock.keys(), ...user.keys()])].sort((a, b) => numberOf(a) - numberOf(b));
  return Promise.all(ids.map(async (id) => {
    const file = user.get(id) ?? stock.get(id)!;
    return { id, file, origin: user.has(id) ? 'user' as const : 'stock' as const, ...parseLibrary(await readFile(file, 'utf8')) };
  }));
}

export async function readLibrary(id: string): Promise<LibraryItem> {
  const found = (await listLibrary()).find((one) => one.id === String(id).trim());
  if (!found) throw new WorkItemMissing(`No library item ${id}; item search --library lists them.`);
  return found;
}

const slug = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'item';

/** Write a tree as a new file in the person's store, at the next free number. */
async function writeNew(part: LibraryPart): Promise<LibraryItem> {
  const top = Math.max(0, ...(await listLibrary()).map((one) => numberOf(one.id)));
  const id = `LIBRARY-${top + 1}`;
  await mkdir(userLibraryDir(), { recursive: true });
  const file = path.join(userLibraryDir(), `${id}-${slug(part.title)}.md`);
  await writeFile(file, libraryText(part), 'utf8');
  return { id, file, origin: 'user', ...part };
}

/** A new library item from its whole file text, at the next free number in the person's store. */
export async function createLibraryText(source: string): Promise<LibraryItem> {
  const part = parseLibrary(source);
  if (!part.title) throw new WorkItemBadInput('A library item starts with its title: # <title>.');
  return writeNew(part);
}

/** Edit from the reading: the whole file text written as the person's own file for that id; a
 * stock one is copied there by this (Make my version), and theirs replaces stock from then on. */
export async function saveLibrary(id: string, source: string): Promise<LibraryItem> {
  const was = await readLibrary(id);
  const part = parseLibrary(source);
  if (!part.title) throw new WorkItemBadInput('A library item starts with its title: # <title>.');
  await mkdir(userLibraryDir(), { recursive: true });
  const file = path.join(userLibraryDir(), `${was.id}-${slug(part.title)}.md`);
  if (was.origin === 'user' && was.file !== file) await rm(was.file, { force: true });
  await writeFile(file, libraryText(part), 'utf8');
  return { id: was.id, file, origin: 'user', ...part };
}

/** The person's own file for that id goes: Ronin's comes back where there is one. Answers what
 * the id reads now, or null when it was theirs alone. */
export async function deleteLibrary(id: string): Promise<LibraryItem | null> {
  const was = await readLibrary(id);
  if (was.origin !== 'user') throw new WorkItemBadInput(`${was.id} is Ronin's; only your own version is deleted.`);
  await rm(was.file, { force: true });
  return (await listLibrary()).find((one) => one.id === was.id) ?? null;
}

/** item create --library --parent LIBRARY-n: a task added to that item, saved as the person's own
 * version of it (saveLibrary). */
export async function addLibraryTask(parent: string, title: string, text: string): Promise<LibraryItem> {
  if (!title.trim()) throw new WorkItemBadInput('A library task needs a title.');
  const into = await readLibrary(parent);
  return saveLibrary(into.id, libraryText({ ...into, under: [...into.under, { title: title.trim(), text: text.trim(), under: [] }] }));
}

/** item checkout <live epic> --library: the live item and its children, as a new file. */
export async function fileToLibrary(id: string): Promise<LibraryItem> {
  const top = await readItem(id);
  if (!top) throw new WorkItemMissing(`No work item ${id}.`);
  const all = await listItems();
  const tree = (item: WorkItem): LibraryPart => ({ title: item.title, text: item.objective, under: all.filter((one) => one.parent === item.id).map(tree) });
  return writeNew(tree(top));
}

/** item checkout LIBRARY-n: the file made as plain new live items, To Do, in its order: the epic,
 * its tasks, their subtasks, each held by the receiver, in the receiver's Campaign; an Agent other
 * than the caller told once. Answers the epic and every id made. */
export async function checkoutLibrary(id: string, to: Extract<Holder, { kind: 'agent' | 'team' }>, by: string): Promise<{ epic: WorkItem; made: string[] }> {
  const source = await readLibrary(id);
  const campaign_id = to.kind === 'team' ? (await readTeamRoster(to.name))?.campaign_id
    : (await listSessions().catch(() => [])).find((one) => one.name === to.name)?.campaign_id;
  const made: string[] = [];
  const make = async (part: LibraryPart, kind: string, parent: string | null): Promise<WorkItem> => {
    const { item } = await createItem({ title: part.title, objective: part.text, kind, parent, holder: to, ...(campaign_id ? { campaign_id } : {}) }, by);
    made.push(item.id);
    for (const child of part.under) await make(child, kind === 'Epic' ? 'Task' : 'Subtask', item.id);
    return item;
  };
  const epic = await make(source, 'Epic', null);
  if (to.kind === 'agent' && to.name !== by) await enqueueMessage(to.name, handedNotice(epic, by), 'house', 'Work items');
  return { epic, made };
}

/** A library item as an item reading shows it: the epic, and its tasks as children. `library`
 * carries its file's whole text and whose it is, for Make my version and Delete. */
export async function libraryReading(one: LibraryItem): Promise<{ item: Record<string, unknown>; children: Array<Record<string, unknown>> }> {
  const stock = (await filesIn(stockLibraryDir())).has(one.id);
  const library = { file: one.file, origin: one.origin, stock, text: await readFile(one.file, 'utf8') };
  return {
    item: {
      id: one.id, campaign_id: '', title: one.title, objective: one.text, level: 1, kind: 'Epic', status: 'Library', flagged: false, priority: '',
      // No author: the reading would show one as the Agent it was started in.
      comments: [], parent: null, attachments: [], links: [], external: {}, trail: [], created: { at: '', by: '' },
      library,
    },
    // Its tasks as the reading lists children; Setup reads each one's Open line from its objective.
    children: one.under.map((task) => ({ id: '', title: task.title, objective: task.text, kind: 'Task', level: 0, status: '', holders: [] })),
  };
}
