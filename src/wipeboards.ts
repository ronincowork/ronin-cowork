import { readFile, writeFile, appendFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { readOwner } from './user-config.js';
import { storeDir } from './stores.js';

/**
 * WIPEBOARDS — a shared text surface a set of sessions can all read and write.
 *
 * A wipeboard is TWO things and nothing else: a markdown file, and a tmux user option
 * (`@ronin-wipeboards`) naming who is on it. This module owns the FILE half; the tag
 * half lives in tmux.ts alongside the group tags it is modelled on. No database, no
 * daemon, no message protocol, no locking — posts are appended (O_APPEND) and that is
 * the whole concurrency story.
 *
 * Vendor neutrality holds by construction: "agents can read and write it" is ordinary
 * file I/O every CLI already has. Ronin announces a path and renders a file; it never
 * reaches into an agent. `ronin_bin/tejun-wipeboard` is the same surface from a shell.
 *
 * The two are no longer symmetrical, and the asymmetry is deliberate rather than a gap
 * nobody noticed. A post from `tejun-wipeboard` NOTIFIES the rest of the board (2026-08-21:
 * agent posts "went unheard" — the file moved and nobody was told); a post from this
 * module does not, because it is the OWNER's line from the tile, and the owner already has
 * the tile dials for reaching a session on purpose. If that changes, the notice belongs
 * behind the same tejun-send the shell tool uses — never a second delivery path.
 */

/** Boards are the user's own work, so they live in the wipeboards STORE (user root) —
 * a board must survive an uninstall, and `rm -rf <repo>` must not be able to take it.
 * They lived inside the repo tree until 2026-08-14; that was the owner's ruling to end. */
export const WIPEBOARD_DIR = storeDir('wipeboards');

/**
 * The owner's watermark, so a steer from the owner is never mistaken for an agent's post.
 *
 * This was `user: glen` — a literal, "hardcoded by decision (2026-08-07) until a profile
 * exists". The profile exists now (`src/user-config.ts`), so this is that one line
 * changing: the name comes from the owner's config, defaulting to this machine's own
 * user, and no install signs its posts with somebody else's name. JUSHO — nothing shipped
 * names a person. `ronin_bin/tejun-wipeboard` reads the same value off the tmux bus.
 */
export const ownerAuthor = async (): Promise<string> => `user: ${await readOwner()}`;

/** Board names are addresses people type, so keep them boring — same rule as tags. */
const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function isValidBoardName(name: string): boolean {
  return typeof name === 'string' && name.length > 0 && name.length <= 32 && NAME_RE.test(name);
}

export function boardPath(name: string): string {
  return path.join(WIPEBOARD_DIR, `${name}.md`);
}

export interface Post {
  /** `@session` for an agent, `user: <name>` for the owner, `system` for a roster change. */
  author: string;
  time: string;
  text: string;
}

export interface Board {
  name: string;
  brief: string;
  posts: Post[];
  /** File mtime in ms — the tile polls this and only re-renders when it moves. */
  mtime: number;
}

const STUB = (name: string) =>
  `# wipeboard: ${name}\n\n## Brief\n\n_(the owner writes what this board is for here)_\n`;

/** Create the file with its Brief stub if this board has never been written to. */
export async function ensureBoard(name: string): Promise<void> {
  await mkdir(WIPEBOARD_DIR, { recursive: true });
  try {
    await stat(boardPath(name));
  } catch {
    await writeFile(boardPath(name), STUB(name), 'utf8');
  }
}

/**
 * The HOUSE board — the one board every install has, seeded at boot if missing and
 * never replaced after (same contract as the user catalogs: Ronin made this file,
 * Ronin never overwrites it). Every session may read and post; the owner adds the
 * rest of the boards, which are theirs from the first byte.
 */
export async function seedHouseBoard(): Promise<void> {
  if (await boardExists('house')) return;
  await mkdir(WIPEBOARD_DIR, { recursive: true });
  await writeFile(
    boardPath('house'),
    `# wipeboard: house\n\n## Brief\n\nThe house board — every session on this install may read and post here.\nStart a board of your own in the ▤ Wipeboard tab; this one is for whatever concerns the house.\n`,
    'utf8',
  );
}

export async function boardExists(name: string): Promise<boolean> {
  try {
    await stat(boardPath(name));
    return true;
  } catch {
    return false;
  }
}

/** Every board that has a file. Live membership comes from the sessions (see tmux.ts). */
export async function listBoardFiles(): Promise<string[]> {
  try {
    const files = await readdir(WIPEBOARD_DIR);
    return files
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3))
      .filter(isValidBoardName)
      .sort();
  } catch {
    return []; // no boards yet — the directory appears with the first one
  }
}

/**
 * Parse a board file: everything under `## Brief` up to the first post is the brief,
 * and each `### <author> · HH:MM` starts a post. Deliberately forgiving — the file is
 * hand-editable by agents and by the owner, so an odd line must never lose a thread.
 */
export async function readBoard(name: string): Promise<Board> {
  const file = boardPath(name);
  const [raw, st] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
  const lines = raw.split('\n');
  const briefLines: string[] = [];
  const posts: Post[] = [];
  let cur: Post | null = null;
  let inBrief = false;
  for (const line of lines) {
    const head = /^###\s+(.*?)\s+·\s+(\d{1,2}:\d{2})\s*$/.exec(line);
    if (head) {
      if (cur) posts.push(cur);
      cur = { author: head[1], time: head[2], text: '' };
      inBrief = false;
      continue;
    }
    if (cur) {
      cur.text += (cur.text ? '\n' : '') + line;
      continue;
    }
    if (/^##\s+Brief\s*$/i.test(line)) {
      inBrief = true;
      continue;
    }
    if (inBrief) briefLines.push(line);
  }
  if (cur) posts.push(cur);
  for (const p of posts) p.text = p.text.replace(/\s+$/, '');
  return { name, brief: briefLines.join('\n').trim(), posts, mtime: st.mtimeMs };
}

/**
 * Append one watermarked entry. O_APPEND (flag 'a') is the concurrency story: writes
 * from several agents interleave as whole posts, so nothing is lost and nothing needs
 * a lock. Never rewrites what is already in the file.
 */
export async function appendPost(name: string, author: string, text: string): Promise<void> {
  await ensureBoard(name);
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  await appendFile(boardPath(name), `\n### ${author} · ${hhmm}\n${text.replace(/\s+$/, '')}\n`, 'utf8');
}

/**
 * Replace the Brief block and nothing else. The thread below it is other people's
 * writing and is never touched — the owner edits the subject, not the conversation.
 */
export async function setBrief(name: string, brief: string): Promise<void> {
  await ensureBoard(name);
  const raw = await readFile(boardPath(name), 'utf8');
  const lines = raw.split('\n');
  const head = lines.findIndex((l) => /^##\s+Brief\s*$/i.test(l));
  const firstPost = lines.findIndex((l) => /^###\s+.*·\s+\d{1,2}:\d{2}\s*$/.test(l));
  const tail = firstPost >= 0 ? lines.slice(firstPost) : [];
  const body = [`# wipeboard: ${name}`, '', '## Brief', '', brief.trim(), ''];
  // A file that somehow lost its Brief heading gets one back rather than a second copy.
  if (head < 0 && firstPost < 0) body.push(...lines.filter(Boolean));
  await writeFile(boardPath(name), [...body, ...tail].join('\n'), 'utf8');
}

/** The join notice — one line, no ceremony. The shell tool sends the same sentence. */
export function joinNotice(name: string, file: string, members: string[]): string {
  return (
    `You've been added to wipeboard "${name}" — ${file}. Read it, and append your own posts as ` +
    `"### @<your session> · HH:MM" (>> append, never rewrite another agent's post, never edit the Brief). ` +
    `Members: ${members.length ? members.join(', ') : 'none'}.`
  );
}

export function leaveNotice(name: string, file: string): string {
  return `You've been removed from wipeboard "${name}" — stop posting to ${file}.`;
}
