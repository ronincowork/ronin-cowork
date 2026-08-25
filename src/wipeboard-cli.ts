/**
 * wipeboard-cli — THE ONE ACTION, and the handful of things that are not it.
 *
 * "An agent should do nothing beyond CHECK WIPEBOARD" (owner, 2026-08-23). So the bare
 * form takes no arguments, names no wipeboard, and hands back only what this session has
 * not read. Agents never manage ids, timestamps, cursors, pagination, acknowledgements
 * or files — if a surface here asks one to, that surface is wrong.
 *
 * WHY THIS IS TYPESCRIPT AND NOT THE BASH TOOL. `ronin_bin/tejun-wipeboard` is a thin
 * wrapper that runs this through tsx, the same arrangement `tejun-rireki` already uses
 * for `scroll-cli.ts`. The alternative was bash re-implementing the post format, the id
 * rule and the cursor rule beside the server's copy — two implementations of one format,
 * free to drift, with the unit tests only ever covering one of them. One implementation,
 * one set of assertions.
 *
 * Run it with no tmux and it says so and changes nothing: the cursor is never advanced
 * for output that did not happen.
 */
import { listSessions } from './tmux.js';
import { sessionKey } from './session-dir.js';
import { readWipeboardSettings } from './user-config.js';
import {
  appendPost,
  boardExists,
  highWater,
  ensureRosterBoard,
  listBoardFiles,
  postHeader,
  postNotice,
  readBoard,
  reapPosts,
  teamOfBoard,
  unreadFor,
  writeCursor,
  type Post,
} from './wipeboards.js';

const out = (s = '') => process.stdout.write(s + '\n');
const die = (verdict: string, code: number): never => {
  process.stdout.write(verdict + '\n');
  process.exit(code);
};

/**
 * Which session is typing. A tile watching a session shares its pane through a grouped
 * viewer, so a pane resolves to its NON-viewer owner. RONIN_SESSION is the test seam —
 * the unit floor never shells tmux.
 */
async function whoami(): Promise<string> {
  if (process.env.RONIN_SESSION) return process.env.RONIN_SESSION;
  const pane = process.env.TMUX_PANE;
  if (!pane) return '';
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  try {
    const { stdout } = await promisify(execFile)('tmux', ['list-panes', '-a', '-F', '#{pane_id}\t#{session_name}']);
    for (const line of stdout.split('\n')) {
      const [id, name] = line.split('\t');
      if (id === pane && name && !name.startsWith('grid_')) return name;
    }
  } catch {
    /* no server */
  }
  return '';
}

/** The teams this session is on. RONIN_TEAMS is the test seam beside RONIN_SESSION —
 * the unit floor never shells tmux, and a tool whose main path cannot be exercised
 * without a live server is a tool whose main path is not covered. */
async function myTeams(session: string): Promise<string[]> {
  if (process.env.RONIN_TEAMS !== undefined) {
    return process.env.RONIN_TEAMS.split(',').map((t) => t.trim()).filter(Boolean);
  }
  const sessions = await listSessions().catch(() => []);
  return sessions.find((s) => s.name === session)?.tags ?? [];
}

/**
 * Every board this session reads: its TEAMS' boards, nothing else (owner, 2026-08-24 —
 * the team board is the unit; custom enrolment is cut). A team talks on its roster's
 * wipeboard id, and the roster implies the board — made here if it does not exist yet,
 * so a new team's board opens empty rather than missing.
 */
async function myBoards(session: string): Promise<string[]> {
  if (process.env.RONIN_BOARDS !== undefined) {
    return process.env.RONIN_BOARDS.split(',').map((b) => b.trim()).filter(Boolean).sort();
  }
  const teams: string[] = [];
  for (const t of await myTeams(session)) teams.push(await ensureRosterBoard(t));
  return [...new Set(teams)].sort();
}

/** The sessions DESIGNATED lead (人) of a team — read fresh, never stored. The seam
 * mirrors the others. */
async function leadsOf(team: string): Promise<string[]> {
  if (process.env.RONIN_LEADS !== undefined) {
    return process.env.RONIN_LEADS.split(',').map((t) => t.trim()).filter(Boolean);
  }
  const sessions = await listSessions().catch(() => []);
  return sessions.filter((s) => s.leads.includes(team)).map((s) => s.name);
}

/** Live members of one wipeboard, with the key each cursor is filed under. */
async function membersOf(board: string): Promise<{ name: string; key: string }[]> {
  if (process.env.RONIN_MEMBERS !== undefined) {
    const names = process.env.RONIN_MEMBERS.split(',').map((n) => n.trim()).filter(Boolean);
    return Promise.all(names.map(async (n) => ({ name: n, key: await sessionKey(n) })));
  }
  const sessions = await listSessions().catch(() => []);
  // Through the roster's id, so the reaper counts the team that actually talks here.
  // Teams only, and the key rides listSessions' single exec — one subprocess, not one
  // per member (the 2026-08-25 slowness lesson).
  const team = (await teamOfBoard(board)) ?? board;
  return sessions.filter((s) => s.tags.includes(team)).map((s) => ({ name: s.name, key: s.key }));
}

const render = (p: Post): string => `${postHeader(p.author, p.at, p.to, p.silent)}\n${p.text}`;

/**
 * THE ONE ACTION. Everything unread, oldest first, wipeboard by wipeboard — and only
 * THEN the cursors move.
 *
 * The order is the contract: output is written and flushed before any cursor advances,
 * so a run that dies half way redelivers rather than swallowing. At-least-once beats
 * at-most-once — a repeated post is noise, a dropped one is the failure this exists to
 * prevent.
 */
async function check(): Promise<number> {
  const me = await whoami();
  if (!me) return die('NO-SESSION: not inside a Ronin session — cannot say whose cursor to move', 3);
  const key = await sessionKey(me);
  const boards = await myBoards(me);
  if (!boards.length) return die('nothing unread — you are on no wipeboard', 0);

  // Gather first, print second, advance third. Nothing is claimed read before it is out.
  const found: { board: string; posts: Post[] }[] = [];
  for (const b of boards) {
    if (!(await boardExists(b))) continue;
    const posts = await unreadFor(b, key, `@${me}`);
    if (posts.length) found.push({ board: b, posts });
  }
  if (!found.length) {
    return die(`nothing unread — ${boards.length} wipeboard${boards.length === 1 ? '' : 's'}, all caught up`, 0);
  }

  let total = 0;
  for (const { board, posts } of found) {
    out(`WIPEBOARD ${board} — ${posts.length} unread`);
    out();
    for (const p of posts) {
      out(render(p));
      out();
    }
    total += posts.length;
  }
  out(`read: ${total} post${total === 1 ? '' : 's'} on ${found.length} wipeboard${found.length === 1 ? '' : 's'}`);

  // The cursor moves LAST, and to everything EXAMINED rather than everything printed —
  // your own posts are not delivered back to you but must not sit ahead of the cursor
  // forever. A cursor that will not save is said out loud: those posts arrive again.
  let stuck = '';
  for (const { board } of found) {
    const hw = await highWater(board, key);
    if (!hw) continue;
    try {
      await writeCursor(board, key, hw);
    } catch (e) {
      stuck += `\nCURSOR-FAILED: ${board} — ${String((e as Error)?.message ?? e)}; these posts will arrive again`;
    }
  }
  if (stuck) {
    out(stuck.trim());
    return 1;
  }
  // Retire what has now been delivered. Inline, so there is no daemon and no timer.
  for (const { board } of found) {
    const { ttlMs, graceMs } = await readWipeboardSettings(board);
    await reapPosts(board, { members: await membersOf(board), ttlMs, graceMs }).catch(() => {});
  }
  return 0;
}

/* -------------------------------------------------------- the explicit, secondary few */

/** Which wipeboards exist. NOT the default, and it moves no cursor. */
async function boards(): Promise<number> {
  const names = await listBoardFiles();
  if (!names.length) return die("NO-WIPEBOARDS: none yet — a team's exists the moment the team does", 3);
  const sessions = await listSessions().catch(() => []);
  for (const n of names) {
    const team = (await teamOfBoard(n)) ?? (sessions.some((s) => s.tags.includes(n)) ? n : null);
    const live = team ? sessions.filter((s) => s.tags.includes(team)).length : 0;
    const posts = (await readBoard(n)).posts.length;
    const whose = team ? `team ${team}` : 'custom';
    out(`${n.padEnd(24)} ${whose.padEnd(20)} ${live} member(s)  ${posts} post(s)`);
  }
  return 0;
}

/** History, asked for on purpose. It never advances a cursor — that is the whole point
 *  of it being a different command. */
async function read(board: string, n: number): Promise<number> {
  if (!(await boardExists(board))) return die(`NO-WIPEBOARD: '${board}' has nothing on it`, 3);
  const b = await readBoard(board);
  if (b.brief) {
    out(`brief: ${b.brief}`);
    out();
  }
  const posts = n > 0 ? b.posts.slice(-n) : b.posts;
  if (!posts.length) return die('EMPTY: nothing on it right now', 0);
  if (posts.length < b.posts.length) out('…');
  for (const p of posts) {
    out(render(p));
    out();
  }
  return 0;
}

async function find(board: string, needle: string): Promise<number> {
  if (!(await boardExists(board))) return die(`NO-WIPEBOARD: '${board}' has nothing on it`, 3);
  const hits = (await readBoard(board)).posts.filter((p) =>
    (p.text + p.author).toLowerCase().includes(needle.toLowerCase()),
  );
  if (!hits.length) return die(`no match for "${needle}" in what '${board}' still holds`, 0);
  for (const p of hits) {
    out(render(p));
    out();
  }
  return 0;
}

/**
 * Post, and say what the post DID.
 *
 * THE BOARD IS ASSUMED (owner, 2026-08-24): `tejun-wipeboard post <text>` goes to YOUR
 * TEAM'S board, no name needed — a session should not have to be told its board exists.
 * A name is for the explicit case only. On several teams, the tool refuses and names
 * them rather than guessing.
 *
 * The audience is the writer's call — but it decides who is INTERRUPTED, never who may
 * read, and THE DEFAULT IS QUIET (owner, 2026-08-24): "it should be the default that
 * it's only the leader, and if they want to include everyone else, they need to say so"
 * — the board must be efficient, not a spam machine. Every member still RECEIVES every
 * post on its next check; interrupts are what this narrows. So:
 *   (nothing)     the leads alone — the default
 *   --to a,b      those, plus the leads
 *   --to all      every member — the explicit loud case
 *   --to none     nobody at all — it lands and waits to be found
 *
 * AN EMPTY --to IS REFUSED, never interpreted — one keystroke sits between four
 * different audiences, and this is the one place where being forgiving would be
 * dangerous.
 */
async function post(named: string | null, argv: string[]): Promise<number> {
  const me = await whoami();
  let to: string[] = [];
  let toAll = false;
  let silent = false;
  const words: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--to') {
      const v = (argv[++i] ?? '').trim();
      if (!v) return die('BAD-ADDRESSEE: --to needs names, or the word none. Leave it off to reach everyone', 2);
      if (v === 'none') silent = true;
      else if (v === 'all') toAll = true;
      else to = v.split(',').map((t) => t.trim()).filter(Boolean);
      continue;
    }
    words.push(argv[i]);
  }
  const text = words.join(' ').trim();
  if (!text) return die('usage: tejun-wipeboard post [--to a,b|all|none] <text…>   (a board name only for a board that is not your team\'s)', 2);

  // Which board. Named wins; otherwise it is the team's, resolved through the roster.
  let board = named;
  let team: string | null = named ? await teamOfBoard(named) : null;
  if (!board) {
    if (!me) return die('NO-SESSION: not inside a Ronin session — cannot say whose board this goes to', 3);
    const teams = await myTeams(me);
    if (!teams.length) return die('NO-TEAM: you are on no team, so there is no board to assume — name one', 3);
    if (teams.length > 1) {
      return die(`WHICH-TEAM: you are on ${teams.join(', ')} — say which: tejun-wipeboard <team> post …`, 2);
    }
    team = teams[0];
    board = await ensureRosterBoard(team);
  }

  const author = me ? `@${me}` : 'shell';
  const p = await appendPost(board, author, text, { to, silent });
  out(`POSTED to '${board}' as ${postHeader(author, p.at, p.to, p.silent).replace(/^### /, '').replace(/ · .*$/, '')}`);

  // THE INTERRUPTS — quiet by default. The leads, plus whoever was named; every member
  // only on an explicit --to all; nobody on --to none. Never the poster. The dial stays
  // law — tejun-send enforces it and its verdict is reported, not worked around. A
  // failed notice never fails the post, which is already in the file.
  const at = (x: string) => (x.startsWith('@') ? x.slice(1) : x);
  const leads = team && !silent ? await leadsOf(team) : [];
  const members = (await membersOf(board)).map((m) => m.name);
  const wanted = silent ? [] : toAll ? members : to.map(at);
  const targets = [...new Set([...leads, ...wanted])].filter((n) => n !== at(author) && members.includes(n));
  const skipped = members.filter((n) => n !== at(author) && !targets.includes(n)).length;
  for (const t of targets) {
    const verdict = await notify(t, postNotice(board, author));
    out(`${t.padEnd(24)} ${verdict}`);
  }
  if (skipped) out(`${skipped} other(s) on the board were not interrupted — they see it when they check (--to all to reach everyone)`);
  return 0;
}

/**
 * One notice to one session, through tejun-send so the dial is enforced and the message
 * arrives watermarked as the wipeboard, not the owner. RONIN_NO_NOTIFY is the unit
 * floor's seam: tests never aim keystrokes at the live tmux server.
 */
async function notify(session: string, message: string): Promise<string> {
  if (process.env.RONIN_NO_NOTIFY) return 'not notified (test seam)';
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const send = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ronin_bin', 'tejun-send');
  try {
    await promisify(execFile)(send, [session, message]);
    return 'notified';
  } catch (e) {
    const line = String((e as { stdout?: string })?.stdout ?? '').trim().split('\n').pop() ?? '';
    return `not notified — ${line || 'tejun-send failed'}`;
  }
}

/* ------------------------------------------------------------------------------ main */

const argv = process.argv.slice(2);
let code = 0;
if (!argv.length) code = await check();
else if (argv[0] === 'boards') code = await boards();
// THE DEFAULT BOARD IS YOUR TEAM'S: `tejun-wipeboard post <text…>` names nothing.
else if (argv[0] === 'post') code = await post(null, argv.slice(1));
else {
  const board = argv[0].toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(board)) {
    code = die(`BAD-NAME: '${board}' — lowercase letters, digits, - and _ only (max 32)`, 2);
  }
  const verb = argv[1] ?? '';
  if (verb === 'post') code = await post(board, argv.slice(2));  // the explicit-name case
  else if (verb === 'read') code = await read(board, Number(argv[2] ?? 0) || 0);
  else if (verb === 'find') code = await find(board, argv.slice(2).join(' '));
  else code = await read(board, 0);
}
process.exit(code);
