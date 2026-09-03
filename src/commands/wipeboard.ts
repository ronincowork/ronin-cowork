import { listSessions } from '../tmux.js';
import { sessionKey } from '../session-dir.js';
import { readWipeboardSettings } from '../machine-state.js';
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
} from '../wipeboards.js';

const out = (s = '') => process.stdout.write(s + '\n');
const die = (verdict: string, code: number): never => {
  process.stdout.write(verdict + '\n');
  process.exit(code);
};

let claimedSession = '';
const claimSession = (name: string): void => { claimedSession = name; };

async function whoami(): Promise<string> {
  if (claimedSession) return claimedSession;
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
  }
  return '';
}

async function myTeams(session: string): Promise<string[]> {
  if (process.env.RONIN_TEAMS !== undefined) {
    return process.env.RONIN_TEAMS.split(',').map((t) => t.trim()).filter(Boolean);
  }
  const sessions = await listSessions().catch(() => []);
  return sessions.find((s) => s.name === session)?.tags ?? [];
}

async function myBoards(session: string): Promise<string[]> {
  if (process.env.RONIN_BOARDS !== undefined) {
    return process.env.RONIN_BOARDS.split(',').map((b) => b.trim()).filter(Boolean).sort();
  }
  const teams: string[] = [];
  for (const t of await myTeams(session)) teams.push(await ensureRosterBoard(t));
  return [...new Set(teams)].sort();
}

async function leadsOf(team: string): Promise<string[]> {
  if (process.env.RONIN_LEADS !== undefined) {
    return process.env.RONIN_LEADS.split(',').map((t) => t.trim()).filter(Boolean);
  }
  const sessions = await listSessions().catch(() => []);
  return sessions.filter((s) => s.leads.includes(team)).map((s) => s.name);
}

async function membersOf(board: string): Promise<{ name: string; key: string }[]> {
  if (process.env.RONIN_MEMBERS !== undefined) {
    const names = process.env.RONIN_MEMBERS.split(',').map((n) => n.trim()).filter(Boolean);
    return Promise.all(names.map(async (n) => ({ name: n, key: await sessionKey(n) })));
  }
  const sessions = await listSessions().catch(() => []);
  const team = (await teamOfBoard(board)) ?? board;
  return sessions.filter((s) => s.tags.includes(team)).map((s) => ({ name: s.name, key: s.key }));
}

const render = (p: Post): string => `${postHeader(p.author, p.at, p.to, p.silent)}\n${p.text}`;

async function check(): Promise<number> {
  const me = await whoami();
  if (!me) return die('NO-SESSION: not inside a Ronin session — cannot say whose cursor to move', 3);
  const key = await sessionKey(me);
  const boards = await myBoards(me);
  if (!boards.length) return die('nothing unread — you are on no wipeboard', 0);

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
  for (const { board } of found) {
    const { ttlMs } = await readWipeboardSettings(board);
    await reapPosts(board, { members: await membersOf(board), ttlMs }).catch(() => {});
  }
  return 0;
}

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

async function post(named: string | null, argv: string[]): Promise<number> {
  let me = await whoami();
  let to: string[] = [];
  let toAll = false;
  let silent = false;
  const words: string[] = [];
  let leading = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (leading && arg === '--to') {
      const v = (argv[++i] ?? '').trim();
      if (!v) return die('BAD-ADDRESSEE: --to needs names, or the word none. Leave it off to reach everyone', 2);
      if (v === 'none') silent = true;
      else if (v === 'all') toAll = true;
      else to = v.split(',').map((t) => t.trim()).filter(Boolean);
      continue;
    }
    if (leading && arg === '--session') {
      const v = (argv[++i] ?? '').trim();
      if (!v) return die('BAD-SESSION: --session needs a session name — it signs the post', 2);
      claimSession(v);
      me = v;
      continue;
    }
    if (leading && /^--[a-z][a-z0-9-]*$/.test(arg)) {
      process.stderr.write(`WARNING: '${arg}' is not a wipeboard flag; including it in the post.\n`);
      leading = false;
      words.push(arg);
      continue;
    }
    leading = false;
    words.push(arg);
  }
  const text = words.join(' ').trim();
  if (!text) return die('usage: tejun-wipeboard post [--to a,b|all|none] <text…>   (a board name only for a board that is not your team\'s)', 2);

  let board = named;
  let team: string | null = named ? await teamOfBoard(named) : null;
  if (!board) {
    if (!me) return die('NO-SESSION: not inside a Ronin session — cannot say whose board this goes to', 3);
    const teams = await myTeams(me);
    if (!teams.length) return die('NO-TEAM: you are on no team, so there is no board to assume — name one', 3);
    if (teams.length > 1) {
      process.stderr.write(`WARNING: you are on ${teams.join(', ')}; posting to ${teams[0]}.\n`);
    }
    team = teams[0];
    board = await ensureRosterBoard(team);
  }

  const author = me ? `@${me}` : 'shell';
  const p = await appendPost(board, author, text, { to, silent });
  out(`POSTED to '${board}' as ${postHeader(author, p.at, p.to, p.silent).replace(/^### /, '').replace(/ · .*$/, '')}`);

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

async function notify(session: string, message: string): Promise<string> {
  if (process.env.RONIN_NO_NOTIFY) return 'not notified (test seam)';
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const send = path.join(path.dirname(fileURLToPath(import.meta.url)), 'message-cli.ts');
  const tsx = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin', 'tsx');
  try {
    const { stdout } = await promisify(execFile)(tsx, [send, 'wipeboard_notice', session, message]);
    return stdout.trim().startsWith('DELIVERED') ? 'notified' : stdout.trim();
  } catch (e) {
    const line = String((e as { stdout?: string })?.stdout ?? '').trim().split('\n').pop() ?? '';
    return `not notified — ${line || 'tejun-send failed'}`;
  }
}

const argv = process.argv.slice(2);
if (argv[0] === '--session') {
  const name = (argv[1] ?? '').trim();
  if (!name) die('BAD-SESSION: --session needs a session name', 2);
  claimSession(name);
  argv.splice(0, 2);
}
let code = 0;
if (!argv.length) code = await check();
else if (argv[0] === 'boards') code = await boards();
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
