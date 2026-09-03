import { link, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { readOwner } from './machine-state.js';
import { storeDir } from './resources.js';

export const WIPEBOARD_DIR = storeDir('wipeboards');

export const ownerAuthor = async (): Promise<string> => `user: ${await readOwner()}`;

const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function isValidBoardName(name: string): boolean {
  return typeof name === 'string' && name.length > 0 && name.length <= 32 && NAME_RE.test(name);
}

export function boardPath(name: string): string {
  return path.join(WIPEBOARD_DIR, name);
}

const postsDir = (name: string): string => path.join(boardPath(name), 'posts');
const readDir = (name: string): string => path.join(boardPath(name), 'read');
const briefPath = (name: string): string => path.join(boardPath(name), 'brief.md');

export interface Post {
  id: string;
  author: string;
  time: string;
  at: string;
  to: string[];
  silent: boolean;
  text: string;
}

export interface Board {
  name: string;
  brief: string;
  posts: Post[];
  mtime: number;
}

const STUB = (name: string) =>
  `# wipeboard: ${name}\n\n## Brief\n\n_(the owner writes what this wipeboard is for here)_\n`;

export const teamStub = (team: string): string =>
  `# wipeboard: ${team}\n\n## Brief\n\nThe ${team} team's wipeboard — membership follows the team.\n`;

export function isStubBrief(name: string, brief: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const b = norm(brief);
  if (!b) return true;
  return b === norm(briefOf(STUB(name))) || b === norm(briefOf(teamStub(name)));
}

function briefOf(raw: string): string {
  const lines = raw.split('\n');
  const head = lines.findIndex((l) => /^##\s+Brief\s*$/i.test(l));
  return (head < 0 ? lines : lines.slice(head + 1)).join('\n').trim();
}

async function atomicCreate(file: string, body: string): Promise<void> {
  const tmp = path.join(path.dirname(file), `.tmp-${randomBytes(6).toString('hex')}`);
  await writeFile(tmp, body, 'utf8');
  try {
    await link(tmp, file); // EEXIST here means somebody else took the name
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

async function atomicWrite(file: string, body: string): Promise<void> {
  const tmp = path.join(path.dirname(file), `.tmp-${randomBytes(6).toString('hex')}`);
  await writeFile(tmp, body, 'utf8');
  try {
    await rename(tmp, file);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
}

export async function boardExists(name: string): Promise<boolean> {
  try {
    return (await stat(boardPath(name))).isDirectory();
  } catch {
    return false;
  }
}

export async function ensureBoard(name: string, stub?: string): Promise<boolean> {
  if (await boardExists(name)) return false;
  await mkdir(postsDir(name), { recursive: true });
  await mkdir(readDir(name), { recursive: true });
  let text = stub;
  if (!text) {
    const team = await teamOfBoard(name).catch(() => null);
    text = team ? teamStub(team) : STUB(name);
  }
  await atomicWrite(briefPath(name), text);
  return true;
}

export async function seedHouseBoard(): Promise<void> {
  if (await boardExists('house')) return;
  await ensureBoard(
    'house',
    `# wipeboard: house\n\n## Brief\n\nThe house board — every session on this install may read and post here.\nStart a board of your own in the ▤ Wipeboard tab; this one is for whatever concerns the house.\n`,
  );
}

export async function listBoardFiles(): Promise<string[]> {
  try {
    const entries = await readdir(WIPEBOARD_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && isValidBoardName(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return []; // no wipeboards yet — the directory appears with the first one
  }
}

const HEX = () => randomBytes(2).toString('hex');

async function newestId(name: string): Promise<string> {
  const ids = await postIds(name);
  return ids.length ? ids[ids.length - 1] : '';
}

async function postIds(name: string): Promise<string[]> {
  try {
    const files = await readdir(postsDir(name));
    return files
      .filter((f) => f.endsWith('.md') && !f.startsWith('.'))
      .map((f) => f.slice(0, -3))
      .sort();
  } catch {
    return [];
  }
}

async function nextId(name: string): Promise<string> {
  const newest = await newestId(name);
  const floor = newest ? Number(newest.split('-')[0]) + 1 : 0;
  const ms = Math.max(Date.now(), floor);
  return `${String(ms).padStart(13, '0')}-${HEX()}`;
}

const two = (n: number) => String(n).padStart(2, '0');

function stampOf(d: Date): { at: string; time: string } {
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`;
  return { at: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${time}`, time };
}

export function postHeader(author: string, at: string, to: string[], silent: boolean): string {
  const aim = silent ? ' → (no notice)' : to.length ? ` → ${to.map((t) => (t.startsWith('@') ? t : '@' + t)).join(', ')}` : '';
  return `### ${author}${aim} · ${at}`;
}

export async function appendPost(
  name: string,
  author: string,
  text: string,
  opts: { to?: string[]; silent?: boolean } = {},
): Promise<Post> {
  await ensureBoard(name);
  const { at, time } = stampOf(new Date());
  const to = (opts.to ?? []).map((t) => (t.startsWith('@') ? t : '@' + t));
  const silent = opts.silent === true;
  const body = text.replace(/\s+$/, '');
  const contents = `${postHeader(author, at, to, silent)}\n${body}\n`;
  for (let attempt = 0; ; attempt++) {
    const id = await nextId(name);
    try {
      await atomicCreate(path.join(postsDir(name), `${id}.md`), contents);
      return { id, author, time, at, to, silent, text: body };
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== 'EEXIST' || attempt >= 50) throw e;
    }
  }
}

function parsePost(id: string, raw: string): Post {
  const lines = raw.split('\n');
  const head = /^###\s+(.+?)\s+·\s+(.+?)\s*$/.exec(lines[0] ?? '');
  const rest = lines.slice(head ? 1 : 0).join('\n').replace(/\s+$/, '');
  const ms = Number(id.split('-')[0]);
  const fallback = stampOf(new Date(Number.isFinite(ms) ? ms : 0));
  if (!head) return { id, author: 'unknown', time: fallback.time, at: fallback.at, to: [], silent: false, text: rest };
  let author = head[1];
  let to: string[] = [];
  let silent = false;
  const aim = /^(.*?)\s+→\s+(.*)$/.exec(author);
  if (aim) {
    author = aim[1];
    if (/^\(no notice\)$/i.test(aim[2].trim())) silent = true;
    else to = aim[2].split(',').map((t) => t.trim()).filter(Boolean);
  }
  const at = head[2].trim();
  const time = /(\d{1,2}:\d{2})\s*$/.exec(at)?.[1] ?? fallback.time;
  return { id, author, time, at, to, silent, text: rest };
}

export async function readPosts(name: string): Promise<Post[]> {
  const ids = await postIds(name);
  const out: Post[] = [];
  for (const id of ids) {
    try {
      out.push(parsePost(id, await readFile(path.join(postsDir(name), `${id}.md`), 'utf8')));
    } catch {
    }
  }
  return out;
}

export async function readBoard(name: string): Promise<Board> {
  const [brief, posts] = await Promise.all([readBrief(name), readPosts(name)]);
  const newest = posts.length ? Number(posts[posts.length - 1].id.split('-')[0]) : 0;
  return { name, brief, posts, mtime: Number.isFinite(newest) ? newest : 0 };
}

export async function readBrief(name: string): Promise<string> {
  try {
    return briefOf(await readFile(briefPath(name), 'utf8'));
  } catch {
    return '';
  }
}

export async function setBrief(name: string, brief: string): Promise<void> {
  await ensureBoard(name);
  await atomicWrite(briefPath(name), `# wipeboard: ${name}\n\n## Brief\n\n${brief.trim()}\n`);
}

export async function readCursor(name: string, sessionKey: string): Promise<string | null> {
  try {
    const raw = await readFile(path.join(readDir(name), sessionKey), 'utf8');
    const id = raw.trim().split(/\s+/)[0] ?? '';
    return /^\d{13}-[0-9a-f]{4}$/.test(id) ? id : null; // unparseable = has read nothing
  } catch {
    return null; // no cursor = has read nothing. A value, not a gap.
  }
}

export async function writeCursor(name: string, sessionKey: string, id: string): Promise<void> {
  await mkdir(readDir(name), { recursive: true });
  await atomicWrite(path.join(readDir(name), sessionKey), `${id} ${new Date().toISOString()}\n`);
}

export async function dropCursor(name: string, sessionKey: string): Promise<void> {
  await unlink(path.join(readDir(name), sessionKey)).catch(() => {});
}

export async function allCursors(name: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let names: string[];
  try {
    names = await readdir(readDir(name));
  } catch {
    return out;
  }
  for (const key of names) {
    if (key.startsWith('.')) continue;
    const id = await readCursor(name, key);
    if (id) out[key] = id;
  }
  return out;
}

export async function unreadFor(name: string, sessionKey: string, author: string): Promise<Post[]> {
  const [cursor, posts] = await Promise.all([readCursor(name, sessionKey), readPosts(name)]);
  return posts.filter((p) => (!cursor || p.id > cursor) && p.author !== author);
}

export async function highWater(name: string, sessionKey: string): Promise<string | null> {
  const [cursor, ids] = await Promise.all([readCursor(name, sessionKey), postIds(name)]);
  const last = ids.length ? ids[ids.length - 1] : null;
  if (!last) return null;
  return !cursor || last > cursor ? last : null;
}

export const DEFAULT_TTL_MS = 48 * 60 * 60 * 1000;

export interface ReapOpts {
  members: { name: string; key: string }[];
  ttlMs?: number;
  now?: number;
}

export async function reapPosts(name: string, opts: ReapOpts): Promise<string[]> {
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const now = opts.now ?? Date.now();
  const [posts, cursors] = await Promise.all([readPosts(name), allCursors(name)]);
  const reaped: string[] = [];
  for (const p of posts) {
    const born = Number(p.id.split('-')[0]);
    if (!(ttl > 0 && Number.isFinite(born) && now - born > ttl)) continue;
    await unlink(path.join(postsDir(name), `${p.id}.md`)).catch(() => {});
    reaped.push(p.id);
  }
  const live = new Set(opts.members.map((m) => m.key));
  for (const key of Object.keys(cursors)) {
    if (!live.has(key)) await dropCursor(name, key);
  }
  return reaped;
}

export interface LifecycleOpts {
  teamMembers: string[];
  enrolled: string[];
  rosterPointsAtIt: boolean;
}

export async function reapBoard(name: string, opts: LifecycleOpts): Promise<boolean> {
  if (name === 'house') return false; // seeded at boot, never removed
  if (!(await boardExists(name))) return false;
  if (opts.teamMembers.length || opts.enrolled.length) return false;
  if (opts.rosterPointsAtIt) return false;
  if ((await postIds(name)).length) return false;
  if (!isStubBrief(name, await readBrief(name))) return false;
  await rm(boardPath(name), { recursive: true, force: true });
  return true;
}

export const checkLine = 'Run: tejun-wipeboard';

export function postNotice(board: string, author: string): string {
  return (
    `WIPEBOARD "${board}" — ${author} posted (automatic notice from the wipeboard, not the owner). ` +
    checkLine
  );
}

export function teamJoinNotice(team: string, _file: string, members: string[]): string {
  return (
    `You're on the "${team}" team, which has a wipeboard. ${checkLine} — it hands you whatever ` +
    `you have not read. Membership follows the team. ` +
    `On it: ${members.length ? members.join(', ') : 'nobody else yet'}.`
  );
}

export function teamLeaveNotice(team: string, _file: string): string {
  return `You've left the "${team}" team — its wipeboard will no longer reach you.`;
}

export async function teamOfBoard(board: string): Promise<string | null> {
  const { listTeamRosters } = await import('./team-rosters.js');
  const rosters = await listTeamRosters().catch(() => []);
  return rosters.find((r) => r.wipeboard === board)?.name ?? null;
}

export async function boardOfTeam(team: string): Promise<string> {
  const { readTeamRoster } = await import('./team-rosters.js');
  const roster = await readTeamRoster(team).catch(() => null);
  return roster?.wipeboard || team;
}

export async function ensureRosterBoard(team: string): Promise<string> {
  const id = await boardOfTeam(team);
  if (isValidBoardName(id)) await ensureBoard(id, teamStub(team));
  return id;
}
