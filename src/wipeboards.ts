import { link, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { readOwner } from './machine-state.js';
import { storeDir } from './resources.js';

/**
 * WIPEBOARDS — the transport a set of sessions talk across.
 *
 * A WIPEBOARD IS NOT HISTORY (owner, 2026-08-23). It is "just a means for communicating
 * back and forth", and "once everyone has seen the message, there's really no need to
 * keep it". So a post is DELIVERED and then REAPED: when every reader it was for has
 * read it, or when it ages past the TTL. Nothing here is a record — RIREKI's tape holds
 * what a tile printed, and a decision worth keeping belongs in TEGAMI or a docs/ page.
 *
 * THE LAYOUT IS A DIRECTORY, and reaping is why. Shortening one shared markdown file
 * means rewriting it under concurrent appends, which is exactly the whole-file write
 * that could already lose a post. One file per post instead:
 *
 *   <store>/<name>/
 *     brief.md                     the owner's statement. Not a post. Agents never edit it.
 *     posts/<id>.md                one post, one file. The id IS the filename.
 *     read/<session-key>           that session's cursor: the last post id it has read.
 *
 * Every write is temp+rename, so a reader sees a whole file or no file. Two writers
 * never touch the same bytes, and nothing needs a lock. Reaping is unlink.
 *
 * THE ID IS THE FILENAME and never a line inside the post, so a human editing the text
 * by hand cannot corrupt a post's identity or its place in the order.
 *
 * Legacy single-file wipeboards (`<name>.md`) are IGNORED, not read and not migrated —
 * the owner ruled a fresh start on 2026-08-23 and accepted the loss. The files are left
 * on disk untouched; removing one is the owner's own `rm`, as it has always been.
 */

/** Boards are the user's own work, so they live in the wipeboards STORE (user root) —
 * a board must survive an uninstall, and `rm -rf <repo>` must not be able to take it. */
export const WIPEBOARD_DIR = storeDir('wipeboards');

/**
 * The owner's watermark, so a steer from the owner is never mistaken for an agent's post.
 * The name comes from the owner's config, defaulting to this machine's own user — JUSHO:
 * nothing shipped names a person. `ronin_bin/tejun-wipeboard` reads the same value off
 * the tmux bus.
 */
export const ownerAuthor = async (): Promise<string> => `user: ${await readOwner()}`;

/** Board names are addresses people type, so keep them boring — same rule as tags. */
const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function isValidBoardName(name: string): boolean {
  return typeof name === 'string' && name.length > 0 && name.length <= 32 && NAME_RE.test(name);
}

/** The wipeboard's home. A DIRECTORY since 2026-08-23 — callers show it to a human. */
export function boardPath(name: string): string {
  return path.join(WIPEBOARD_DIR, name);
}

const postsDir = (name: string): string => path.join(boardPath(name), 'posts');
const readDir = (name: string): string => path.join(boardPath(name), 'read');
const briefPath = (name: string): string => path.join(boardPath(name), 'brief.md');

export interface Post {
  /** `<epoch-ms>-<4 hex>` — monotonic, lexically sortable, and the filename. */
  id: string;
  /** `@session` for an agent, `user: <name>` for the owner, `system` for a roster change. */
  author: string;
  /** HH:MM — what the header has always shown, kept for every existing reader. */
  time: string;
  /** The whole stamp, which HH:MM alone could never be: 42 posts on one live wipeboard
   *  shared a minute with another. */
  at: string;
  /** Who the post was aimed at. EMPTY MEANS EVERYONE — the ordinary post. */
  to: string[];
  /** `--to none`: nobody is notified, and no read can retire it. TTL alone does. */
  silent: boolean;
  text: string;
}

export interface Board {
  name: string;
  brief: string;
  posts: Post[];
  /** Newest post id, or 0 — the tile polls this and only re-renders when it moves. */
  mtime: number;
}

const STUB = (name: string) =>
  `# wipeboard: ${name}\n\n## Brief\n\n_(the owner writes what this wipeboard is for here)_\n`;

/** The stub a TEAM wipeboard materializes with — it says whose it is and how membership
 * works, because the first reader arrives with no enrolment step behind them. */
export const teamStub = (team: string): string =>
  `# wipeboard: ${team}\n\n## Brief\n\nThe ${team} team's wipeboard — membership follows the team.\n`;

/** Is this Brief still the one Ronin wrote? The lifecycle rule turns on it: a wipeboard
 * carrying the owner's own words is never removed by the machine, whatever else is true. */
export function isStubBrief(name: string, brief: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const b = norm(brief);
  if (!b) return true;
  return b === norm(briefOf(STUB(name))) || b === norm(briefOf(teamStub(name)));
}

/** Pull the Brief text out of a whole brief.md — everything under `## Brief`. */
function briefOf(raw: string): string {
  const lines = raw.split('\n');
  const head = lines.findIndex((l) => /^##\s+Brief\s*$/i.test(l));
  return (head < 0 ? lines : lines.slice(head + 1)).join('\n').trim();
}

/* ------------------------------------------------------------------ atomic writes */

/**
 * Write a file so a reader never sees half of it: a uniquely named temp beside the
 * target, then rename(2), which is atomic on one filesystem. Every write in this module
 * goes through here — a post, a cursor, the Brief.
 */
/**
 * Create a file that must NOT already exist — atomically, and refusing to clobber.
 *
 * `rename(2)` is atomic but it OVERWRITES, which is wrong for a post: two writers that
 * mint the same id would silently leave one post instead of two. `link(2)` is atomic and
 * fails with EEXIST rather than replacing, so the winner keeps the name and the loser is
 * told to pick another. Throws EEXIST for the caller to retry.
 *
 * Found by the unit floor under load, 2026-08-23: ids are floored to the same millisecond
 * for concurrent writers, so they differ only by two bytes of randomness — a birthday
 * collision at a hundred-odd concurrent posts is likely, not theoretical.
 */
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

/* ------------------------------------------------------------------------ the shell */

export async function boardExists(name: string): Promise<boolean> {
  try {
    return (await stat(boardPath(name))).isDirectory();
  } catch {
    return false;
  }
}

/** Create the wipeboard with its Brief stub if it has never been written to. Returns
 * whether THIS call created it — a team wipeboard materializing is the moment its
 * members get their one join notice, and only the creator knows the moment. */
export async function ensureBoard(name: string, stub?: string): Promise<boolean> {
  if (await boardExists(name)) return false;
  await mkdir(postsDir(name), { recursive: true });
  await mkdir(readDir(name), { recursive: true });
  // WHOEVER CREATES IT, IT SAYS WHOSE IT IS. A wipeboard a roster points at gets the
  // team stub even when the caller did not know to ask for one — a post straight to the
  // roster's id creates it just as a roster opening does, and its first reader arrives
  // with no enrolment step behind them either way.
  let text = stub;
  if (!text) {
    const team = await teamOfBoard(name).catch(() => null);
    text = team ? teamStub(team) : STUB(name);
  }
  await atomicWrite(briefPath(name), text);
  return true;
}

/**
 * The HOUSE board — the one wipeboard every install has, seeded at boot if missing and
 * never replaced after (same contract as the user catalogs: Ronin made this file, Ronin
 * never overwrites it). Every session may read and post; it is never reaped away.
 */
export async function seedHouseBoard(): Promise<void> {
  if (await boardExists('house')) return;
  await ensureBoard(
    'house',
    `# wipeboard: house\n\n## Brief\n\nThe house board — every session on this install may read and post here.\nStart a board of your own in the ▤ Wipeboard tab; this one is for whatever concerns the house.\n`,
  );
}

/** Every wipeboard that has a directory. Live membership comes from the sessions. */
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

/* ------------------------------------------------------------------------- the post */

const HEX = () => randomBytes(2).toString('hex');

/** The id of the newest post, or '' — the floor a new id must clear. */
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

/**
 * Mint the next id. Monotonic WITHIN a wipeboard whatever the clock does: a machine
 * whose time moved backwards would otherwise sort a new post before an old one, so the
 * millisecond is floored at one past the newest already there.
 */
async function nextId(name: string): Promise<string> {
  const newest = await newestId(name);
  const floor = newest ? Number(newest.split('-')[0]) + 1 : 0;
  const ms = Math.max(Date.now(), floor);
  return `${String(ms).padStart(13, '0')}-${HEX()}`;
}

const two = (n: number) => String(n).padStart(2, '0');

/** `2026-08-23 13:36` — the whole stamp, because HH:MM alone is not an identity. */
function stampOf(d: Date): { at: string; time: string } {
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`;
  return { at: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${time}`, time };
}

/** The header a post is stored under. The audience rides in it, where a human reading
 *  the thread can see it: `### @a → @b, @c · 2026-08-23 13:36`. */
export function postHeader(author: string, at: string, to: string[], silent: boolean): string {
  const aim = silent ? ' → (no notice)' : to.length ? ` → ${to.map((t) => (t.startsWith('@') ? t : '@' + t)).join(', ')}` : '';
  return `### ${author}${aim} · ${at}`;
}

/**
 * Append one watermarked post. O_EXCL-by-fresh-name plus temp+rename is the concurrency
 * story: two writers never choose the same filename, and neither ever rewrites shared
 * state, so nothing is lost and nothing needs a lock.
 */
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
  // CLAIM A NAME, DO NOT ASSUME ONE. Concurrent writers are floored to the same
  // millisecond, so two can mint the same id; the one that gets EEXIST mints another.
  // Nothing is lost and nothing is overwritten, which is the whole concurrency story.
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

/**
 * Parse one post file. Deliberately forgiving — the file is hand-editable by agents and
 * by the owner, so an odd line must never lose a post. AN UNREADABLE AUDIENCE MEANS
 * EVERYONE, never nobody: a post that loses its addressees becomes noisy, one that
 * silently loses its audience is lost.
 */
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

/** Every post still on the wipeboard, oldest first. */
export async function readPosts(name: string): Promise<Post[]> {
  const ids = await postIds(name);
  const out: Post[] = [];
  for (const id of ids) {
    try {
      out.push(parsePost(id, await readFile(path.join(postsDir(name), `${id}.md`), 'utf8')));
    } catch {
      // A post that vanished between the listing and the read was reaped under us.
    }
  }
  return out;
}

/** The whole wipeboard: its Brief and what it still holds. */
export async function readBoard(name: string): Promise<Board> {
  const [brief, posts] = await Promise.all([readBrief(name), readPosts(name)]);
  const newest = posts.length ? Number(posts[posts.length - 1].id.split('-')[0]) : 0;
  return { name, brief, posts, mtime: Number.isFinite(newest) ? newest : 0 };
}

/* ------------------------------------------------------------------------ the Brief */

export async function readBrief(name: string): Promise<string> {
  try {
    return briefOf(await readFile(briefPath(name), 'utf8'));
  } catch {
    return '';
  }
}

/**
 * Replace the Brief and nothing else. It is its own file now, so this can no longer
 * reach a post even in principle — the whole-file rewrite that could lose one is gone
 * rather than guarded.
 */
export async function setBrief(name: string, brief: string): Promise<void> {
  await ensureBoard(name);
  await atomicWrite(briefPath(name), `# wipeboard: ${name}\n\n## Brief\n\n${brief.trim()}\n`);
}

/* ----------------------------------------------------------------------- the cursor */

/**
 * A read cursor: the last post id one session has read on one wipeboard.
 *
 * "A read post is only read by a single session. If you have five sessions, each session
 * needs to read the post, so a post would then have five reads" (the owner). That count
 * is DERIVED and never stored: post P is read by session S iff cursor(S) >= id(P).
 *
 * The key is the session's `@ronin-key` (`<name>-<created-epoch>`), so a session
 * relaunched under the same name is correctly a different reader.
 */
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

/** Every cursor on this wipeboard, keyed by session key. */
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

/** What this session has not read yet, oldest first. Its OWN posts are never delivered —
 *  an agent that has just written does not need to be told it wrote. */
export async function unreadFor(name: string, sessionKey: string, author: string): Promise<Post[]> {
  const [cursor, posts] = await Promise.all([readCursor(name, sessionKey), readPosts(name)]);
  return posts.filter((p) => (!cursor || p.id > cursor) && p.author !== author);
}

/** The id to advance to after delivering: everything EXAMINED, not everything printed.
 *  Advancing only to the last printed post would re-examine your own post forever. */
export async function highWater(name: string, sessionKey: string): Promise<string | null> {
  const [cursor, ids] = await Promise.all([readCursor(name, sessionKey), postIds(name)]);
  const last = ids.length ? ids[ids.length - 1] : null;
  if (!last) return null;
  return !cursor || last > cursor ? last : null;
}

/* ----------------------------------------------------------------------- the reaper */

/** The shipped default. SETTEI — the owner's config overrides it per install, and a
 *  per-wipeboard key overrides it again. `ttl = 0` means never reap on age. */
export const DEFAULT_TTL_MS = 48 * 60 * 60 * 1000;

export interface ReapOpts {
  /** Live members, by session NAME. Membership is derived by the caller, never stored. */
  members: { name: string; key: string }[];
  ttlMs?: number;
  now?: number;
}

/**
 * Retire what has aged out. ONE RULE — the TTL (owner, 2026-08-25): a post lives its 48
 * hours whoever has read it, then goes. Read-reaping was dropped the day the owner met
 * a board that everyone ELSE had read: it looked empty to the one person who had not,
 * which reads as broken — and it killed scrolling back over what people had been
 * saying. Cursors still exist, but only for what they were always really for: handing
 * each session its own unread.
 *
 * Lazily called — on every check and every post — so there is no daemon and no timer.
 * That is cheap precisely because the TTL keeps the directory small.
 */
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
  // A cursor belonging to a session that is gone holds nothing back, and is swept.
  const live = new Set(opts.members.map((m) => m.key));
  for (const key of Object.keys(cursors)) {
    if (!live.has(key)) await dropCursor(name, key);
  }
  return reaped;
}

export interface LifecycleOpts {
  /** Live sessions carrying this wipeboard's name as a TEAM. */
  teamMembers: string[];
  /** Live sessions enrolled on it as a CUSTOM wipeboard. */
  enrolled: string[];
  /** Does any team roster point at this wipeboard? Tested on the roster's `wipeboard:`
   *  TOKEN, never on the name — a roster may point somewhere else, and matching the
   *  name would remove a wipeboard a living team is using. */
  rosterPointsAtIt: boolean;
}

/**
 * REMOVE A WIPEBOARD WHOLE when nothing points at it any more.
 *
 * The owner's question, 2026-08-23: a team dies, and we must not accumulate a directory
 * for every team that ever existed. The cost of keeping them is not disk — an empty one
 * is a few hundred bytes — it is THE LISTING, which nobody can read at two hundred rows.
 *
 * Six conditions, all of them. "Nothing on a button deletes a file" (owner, 2026-08-07)
 * survives intact: no button reaches this, dissolving a team still deletes only the
 * roster, and the reaper stays the only deleter in the house.
 */
export async function reapBoard(name: string, opts: LifecycleOpts): Promise<boolean> {
  if (name === 'house') return false; // seeded at boot, never removed
  if (!(await boardExists(name))) return false;
  if (opts.teamMembers.length || opts.enrolled.length) return false;
  if (opts.rosterPointsAtIt) return false;
  if ((await postIds(name)).length) return false;
  // If the owner ever wrote a Brief, that is the owner's writing and it stays —
  // permanently, and with no further argument.
  if (!isStubBrief(name, await readBrief(name))) return false;
  await rm(boardPath(name), { recursive: true, force: true });
  return true;
}

/* ---------------------------------------------------------------------- the notices */

/**
 * THE NOTICE IS A POINTER, NEVER A COPY, and it now names no path and no wipeboard to
 * carry: there is one action, it takes no arguments, and an agent that has read only the
 * boot shelf can run it. It never asks for a reply — the cursor is the only
 * acknowledgement there is, and it is mechanical.
 */
export const checkLine = 'Run: tejun-wipeboard';

export function postNotice(board: string, author: string): string {
  return (
    `WIPEBOARD "${board}" — ${author} posted (automatic notice from the wipeboard, not the owner). ` +
    checkLine
  );
}

/** The TEAM flavor: same rules, but it says membership follows the team, so nobody goes
 *  looking for an enrolment that does not exist. */
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

/* ------------------------------------------------------- the roster owns the wipeboard */

/**
 * A TEAM ROSTER HAS A WIPEBOARD ID, AND THAT ID IS THE IDENTITY (owner, 2026-08-23).
 *
 * "Every team roster should have a whiteboard ID, and that whiteboard ID should match
 * with a single whiteboard. I don't care what the names are." So a wipeboard is a team's
 * because a roster POINTS at it, not because the two happen to share a name. A roster
 * whose id matches nothing on disk gets one made: "if there is no whiteboard that matches
 * this ID, we create a new one", and it opens even when empty — a new team's wipeboard
 * with nothing on it is a normal state, not a missing one.
 *
 * What this replaces: `isTeamBoard()` asked "does a live tag bear this NAME?", so a
 * roster pointing its wipeboard somewhere else produced a wipeboard with no members at
 * all — the team was sent to a wipeboard it was not on. Matching the id cannot do that,
 * and it makes the roster's own field mean something.
 *
 * A tag-only team — sessions carrying a tag with no roster behind it — keeps working on
 * a wipeboard of its own name. It has no roster to carry an id, and stranding it would
 * be a second change nobody asked for.
 */

/** The team whose roster points at this wipeboard, or null when no roster does. */
export async function teamOfBoard(board: string): Promise<string | null> {
  const { listTeamRosters } = await import('./team-rosters.js');
  const rosters = await listTeamRosters().catch(() => []);
  return rosters.find((r) => r.wipeboard === board)?.name ?? null;
}

/** The wipeboard id a team talks on: its roster's, or its own name when it has no roster. */
export async function boardOfTeam(team: string): Promise<string> {
  const { readTeamRoster } = await import('./team-rosters.js');
  const roster = await readTeamRoster(team).catch(() => null);
  return roster?.wipeboard || team;
}

/**
 * Every roster's wipeboard exists. Called wherever a roster is about to be shown or
 * talked on — the wipeboard is not something the owner creates, it is something the
 * roster implies.
 */
export async function ensureRosterBoard(team: string): Promise<string> {
  const id = await boardOfTeam(team);
  if (isValidBoardName(id)) await ensureBoard(id, teamStub(team));
  return id;
}
