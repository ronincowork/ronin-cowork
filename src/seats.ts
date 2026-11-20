/* SEATS (KAN-734): a seat is on the office's roster with no terminal — a daimyo, the user's own
 * AI manager driving the office from outside. It joins Teams, leads and holds like an Agent:
 * tmux.ts lists it among the sessions and keeps its Teams and leads here, so every reader of
 * the roster (notices, holds, the board) sees it with no second path. What Ronin would type
 * into its terminal goes to its inbox instead (message-queue.ts), read with a cursor: each
 * read gives what came since the last one.
 *
 * A seat goes in and out only through the Sockets (putSeat, dropSeat): the Services part that
 * checks the daimyo's token owns it. The record stays this small. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './resources.js';

export interface Seat {
  name: string;
  kind: 'daimyo';
  /** The user's own line: how the office's Agents treat this seat ("treat as user"). */
  status: string;
  since: string;
  teams: string[];
  leads: string[];
}

export interface InboxEntry { at: string; from: string; channel: string; text: string }

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

/** In, or its status changed. A name a live Agent already has is refused: its notices would split. */
export async function putSeat(input: { name: string; status: string }, liveAgent: (name: string) => Promise<boolean>): Promise<Seat> {
  const name = String(input.name ?? '').trim();
  if (!NAME_RE.test(name)) throw new Error(`"${name}" is not a valid seat name.`);
  const before = await readSeat(name);
  if (!before && await liveAgent(name)) throw new Error(`${name} is already an Agent on this office.`);
  const seat: Seat = {
    name, kind: 'daimyo', status: String(input.status ?? '').trim().slice(0, 500),
    since: before?.since ?? new Date().toISOString(), teams: before?.teams ?? [], leads: before?.leads ?? [],
  };
  await writeAtomic(seatFile(name), JSON.stringify(seat, null, 2));
  return seat;
}

/** Out: the record goes; its inbox goes with it. Its items are released as an ending's are, by the sweep. */
export async function dropSeat(name: string): Promise<boolean> {
  if (!(await readSeat(name))) return false;
  await Promise.all([seatFile(name), inboxFile(name), cursorFile(name)].map((f) => fs.unlink(f).catch(() => {})));
  return true;
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

export async function toInbox(name: string, entry: Omit<InboxEntry, 'at'>): Promise<InboxEntry> {
  const line: InboxEntry = { at: new Date().toISOString(), ...entry };
  await fs.mkdir(dir(), { recursive: true });
  await fs.appendFile(inboxFile(name), `${JSON.stringify(line)}\n`);
  return line;
}

/** Since my last look: what came after the cursor, and the cursor moves to the newest. */
export async function readInbox(name: string): Promise<InboxEntry[]> {
  const cursor = Number(await fs.readFile(cursorFile(name), 'utf8').catch(() => '0')) || 0;
  const lines = (await fs.readFile(inboxFile(name), 'utf8').catch(() => '')).split('\n').filter(Boolean);
  const fresh = lines.slice(cursor).flatMap((line) => { try { return [JSON.parse(line) as InboxEntry]; } catch { return []; } });
  if (lines.length !== cursor) await writeAtomic(cursorFile(name), String(lines.length));
  return fresh;
}
