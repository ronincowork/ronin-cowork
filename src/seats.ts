/* SEATS (KAN-734): a seat is on the office's roster with no terminal — a gecko, the user's own
 * AI manager driving the office from outside. It joins Teams, leads and holds like an Agent:
 * tmux.ts lists it among the sessions and keeps its Teams and leads here, so every reader of
 * the roster (notices, holds, the board) sees it with no second path. What Ronin would type
 * into its terminal goes to its inbox instead (message-queue.ts), read with a cursor: each
 * read gives what came since the last one.
 *
 * A seat goes in and out only through the Sockets (setSeats): the Services part that checks the
 * gecko's token follows the unit's geckos.json with it. The record stays this small. */
import { watch as fsWatch } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './resources.js';

export interface Seat {
  name: string;
  kind: 'gecko';
  /** The user's own line: how the office's Agents treat this seat ("treat as user"). */
  status: string;
  since: string;
  teams: string[];
  leads: string[];
}

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const dir = () => storeDir('seats');
const seatFile = (name: string) => path.join(dir(), `${name}.json`);
const inboxFile = (name: string) => path.join(dir(), `${name}.inbox.jsonl`);
const cursorFile = (name: string) => path.join(dir(), `${name}.cursor`);

async function writeAtomic(file: string, text: string): Promise<void> {
  await fs.mkdir(dir(), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, text);
  await fs.rename(tmp, file);
}

export async function readSeat(name: string): Promise<Seat | null> {
  if (!NAME_RE.test(name)) return null;
  try { return JSON.parse(await fs.readFile(seatFile(name), 'utf8')) as Seat; } catch { return null; }
}

export async function listSeats(): Promise<Seat[]> {
  let names: string[];
  try { names = await fs.readdir(dir()); } catch { return []; }
  const seats = await Promise.all(names.filter((n) => n.endsWith('.json')).map((n) => readSeat(n.slice(0, -5))));
  return seats.filter((s): s is Seat => Boolean(s)).sort((a, b) => a.name.localeCompare(b.name));
}

/** THE SEATS ARE THE LIST (geckos.json, via the Services part): each listed seat is put in or
 * has its status line changed; every seat not listed goes, with its inbox, and its items are
 * released by the sweep as an ending's are. A name a live Agent already has is skipped (its
 * notices would split) and logged. Returns the names that changed. */
export async function setSeats(list: Array<{ name: string; status: string }>, liveAgent: (name: string) => Promise<boolean>): Promise<string[]> {
  const changed: string[] = [];
  const wanted = new Map(list.map((s) => [String(s.name ?? '').trim(), String(s.status ?? '').trim().slice(0, 500)]));
  for (const seat of await listSeats()) {
    if (wanted.has(seat.name)) continue;
    await Promise.all([seatFile(seat.name), inboxFile(seat.name), cursorFile(seat.name)].map((f) => fs.unlink(f).catch(() => {})));
    changed.push(seat.name);
  }
  for (const [name, status] of wanted) {
    if (!NAME_RE.test(name)) { console.error(`[seats] "${name}" is not a valid seat name; skipped.`); continue; }
    const before = await readSeat(name);
    if (before?.status === status) continue;
    if (!before && await liveAgent(name)) { console.error(`[seats] ${name} is already an Agent on this office; skipped.`); continue; }
    await writeAtomic(seatFile(name), JSON.stringify({
      name, kind: 'gecko', status, since: before?.since ?? new Date().toISOString(), teams: before?.teams ?? [], leads: before?.leads ?? [],
    } satisfies Seat, null, 2));
    changed.push(name);
  }
  return changed;
}

export async function setSeatField(name: string, field: 'teams' | 'leads', values: string[]): Promise<void> {
  const seat = await readSeat(name);
  if (!seat) return;
  await writeAtomic(seatFile(name), JSON.stringify({ ...seat, [field]: values }, null, 2));
}

/** ACTING AS THE SEAT: a token call is the seat's, whatever the tools named. Each route names its
 * caller in its own field: by (items, plans, canvases, notes), caller (launch), author
 * (wipeboard), from on the Team page (on an item it is the holder handed from), and session on
 * the command line (on an item it is the holder). All of them become the seat here, once. */
export function asSeat(req: { path: string; body?: unknown }, name: string): void {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  Object.assign(body, { by: name, caller: name, author: name });
  if (/^\/api\/teams\/[^/]+\/page$/.test(req.path)) body.from = name;
  if (req.path.startsWith('/api/cli/')) Object.assign(body, { session: name, pane: '' });
  req.body = body;
}

/** `to` marks the seat's own Tell (message-queue.ts): its tile's thread shows both ways; the
 * gecko's inbox read leaves its own out. */
export interface InboxEntry { at: string; from: string; channel: string; text: string; to?: string }

export async function toInbox(name: string, entry: Omit<InboxEntry, 'at'>): Promise<InboxEntry> {
  const line: InboxEntry = { at: new Date().toISOString(), ...entry };
  await fs.mkdir(dir(), { recursive: true });
  await fs.appendFile(inboxFile(name), `${JSON.stringify(line)}\n`);
  return line;
}

const parsed = (lines: string[]): InboxEntry[] => lines.flatMap((line) => { try { return [JSON.parse(line) as InboxEntry]; } catch { return []; } });
const inboxLines = async (name: string): Promise<string[]> => (await fs.readFile(inboxFile(name), 'utf8').catch(() => '')).split('\n').filter(Boolean);

/** The tile's thread: the newest entries both ways, oldest first. */
export async function readThread(name: string, last = 200): Promise<InboxEntry[]> {
  return parsed((await inboxLines(name)).slice(-last));
}

/** Since my last look: what came after the cursor, and the cursor moves to the newest. With
 * nothing new it waits up to `waitSeconds` (at most 90: Cloudflare drops a silent request at
 * about 100) for the first entry, by watching the store, so every writer wakes it. */
export async function readInbox(name: string, waitSeconds = 0): Promise<InboxEntry[]> {
  const until = Date.now() + Math.min(Math.max(Number(waitSeconds) || 0, 0), 90) * 1000;
  await fs.mkdir(dir(), { recursive: true });
  for (;;) {
    const fresh = await sinceCursor(name);
    if (fresh.length || Date.now() >= until) return fresh;
    await new Promise<void>((resolve) => {
      const watcher = fsWatch(dir(), (_event, file) => { if (String(file) === path.basename(inboxFile(name))) done(); });
      const timer = setTimeout(done, until - Date.now());
      function done(): void { clearTimeout(timer); watcher.close(); resolve(); }
    });
  }
}

async function sinceCursor(name: string): Promise<InboxEntry[]> {
  const cursor = Number(await fs.readFile(cursorFile(name), 'utf8').catch(() => '0')) || 0;
  const lines = await inboxLines(name);
  if (lines.length !== cursor) await writeAtomic(cursorFile(name), String(lines.length));
  return parsed(lines.slice(cursor)).filter((entry) => !entry.to);
}
