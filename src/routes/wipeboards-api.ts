import type express from 'express';
import { type Control, isValidName, listSessions, sessionExists, teamsInPlay } from '../tmux.js';
import { attemptMessage, enqueueMessage } from '../message-queue.js';
import {
  appendPost,
  boardExists,
  boardPath,
  ensureBoard,
  isValidBoardName,
  listBoardFiles,
  ownerAuthor,
  postNotice,
  readBoard,
  reapBoard,
  reapPosts,
  setBrief,
  teamJoinNotice,
  teamLeaveNotice,
  boardOfTeam,
  teamOfBoard,
  teamStub,
  unreadFor,
  type Post,
} from '../wipeboards.js';
import { sessionKey } from '../session-dir.js';
import { listTeamRosters } from '../team-rosters.js';
import { readWipeboardSettings } from '../machine-state.js';
import { count } from '../counts.js';

async function memberKeys(board: string): Promise<{ name: string; key: string }[]> {
  const team = await teamBehind(board);
  if (!team) return [];
  return (await listSessions()).filter((s) => s.tags.includes(team)).map((s) => ({ name: s.name, key: s.key }));
}

const SWEEP_EVERY_MS = 45_000;
const lastSweep = new Map<string, number>();

async function sweep(board: string): Promise<void> {
  const last = lastSweep.get(board) ?? 0;
  if (Date.now() - last < SWEEP_EVERY_MS) return;
  lastSweep.set(board, Date.now());
  try {
    const { ttlMs } = await readWipeboardSettings(board);
    await reapPosts(board, { members: await memberKeys(board), ttlMs });
    const sessions = await listSessions();
    const rosters = await listTeamRosters();
    await reapBoard(board, {
      teamMembers: await (async () => {
        const t = await teamBehind(board);
        return t ? sessions.filter((s) => s.tags.includes(t)).map((s) => s.name) : [];
      })(),
      enrolled: [],
      rosterPointsAtIt: rosters.some((r) => r.wipeboard === board),
    });
  } catch {
  }
}

function audienceOf(body: unknown): { to: string[]; silent: boolean } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.silent === true) return { to: [], silent: true };
  const raw = Array.isArray(b.to) ? b.to : typeof b.to === 'string' ? String(b.to).split(',') : [];
  return { to: raw.map((t) => String(t).trim()).filter(Boolean), silent: false };
}

async function fanOut(board: string, post: Post, from: string): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  if (post.silent) return results; // parked — it lands and waits to be found
  const at = (s: string) => (s.startsWith('@') ? s.slice(1) : s);
  const team = await teamBehind(board);
  const sessions = team ? await listSessions() : [];
  const leads = new Set(sessions.filter((s) => s.leads.includes(team as string)).map((s) => s.name));
  const aimed = post.to.length ? new Set(post.to.map(at)) : null;
  const notice = postNotice(board, post.author);
  let unaddressed = 0;
  for (const m of await boardMembers(board)) {
    if (at(m.name) === at(from)) continue; // never the poster
    if (!leads.has(m.name) && aimed && !aimed.has(at(m.name))) {
      unaddressed++;
      continue;
    }
    const queued = await enqueueMessage(m.name, notice, 'wipeboard_notice');
    const retained = await attemptMessage(queued.id, 'safe');
    results[m.name] = retained ? `queued — ${retained.reason}` : 'notified';
  }
  if (unaddressed) results['(not addressed)'] = `${unaddressed} other(s) — they see it when they check`;
  return results;
}

async function teamBehind(board: string): Promise<string | null> {
  const owned = await teamOfBoard(board);
  if (owned) return owned;
  return (await teamsInPlay()).includes(board) ? board : null;
}

const isTeamBoard = async (name: string): Promise<boolean> => (await teamBehind(name)) !== null;

async function boardMembers(board: string): Promise<{ name: string; control: Control }[]> {
  const sessions = await listSessions();
  const team = await teamBehind(board);
  if (!team) return [];
  return sessions.filter((s) => s.tags.includes(team)).map((s) => ({ name: s.name, control: s.control }));
}

export function registerWipeboards(app: express.Express): void {
  app.get('/api/wipeboards', async (_req, res) => {
    try {
      const sessions = await listSessions();
      const live = new Map<string, number>(); // team -> member count
      for (const s of sessions) for (const t of s.tags) live.set(t, (live.get(t) ?? 0) + 1);
      const rows = new Map<string, { name: string; members: number; kind: 'team' | 'custom'; team?: string }>();
      for (const [team, members] of live) {
        const id = await boardOfTeam(team);
        rows.set(id, { name: id, members, kind: 'team', team });
      }
      for (const n of await listBoardFiles()) {
        if (rows.has(n)) continue;
        const team = await teamOfBoard(n);
        rows.set(n, team
          ? { name: n, members: live.get(team) ?? 0, kind: 'team', team }
          : { name: n, members: 0, kind: 'custom' });
      }
      const boards = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
      res.json({ boards });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.get('/api/wipeboards/:name', async (req, res) => {
    const { name } = req.params;
    if (!isValidBoardName(name)) return res.status(400).json({ error: 'Invalid board name.' });
    try {
      const team = await teamBehind(name);
      if (!(await boardExists(name))) {
        if (!team) return res.status(404).json({ error: 'No such wipeboard.' });
        await ensureBoard(name, teamStub(team));
      }
      await sweep(name);
      if (!(await boardExists(name))) {
        return res.json({
          name, brief: '', posts: [], newest: '', file: boardPath(name),
          members: [], kind: team ? 'team' : 'custom', reaped: true,
        });
      }
      const [board, members] = await Promise.all([readBoard(name), boardMembers(name)]);
      const since = String(req.query.since ?? '');
      const limit = Math.max(0, Math.min(500, Number(req.query.limit ?? 0) || 0));
      let posts = since ? board.posts.filter((p) => p.id > since) : board.posts;
      const older = limit && posts.length > limit;
      if (limit) posts = posts.slice(-limit);
      res.json({
        name: board.name,
        brief: board.brief,
        posts,
        newest: board.posts.length ? board.posts[board.posts.length - 1].id : '',
        file: boardPath(name),
        members,
        kind: team ? 'team' : 'custom',
        more: older,
      });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.post('/api/wipeboards/:name/post', async (req, res) => {
    const { name } = req.params;
    if (!isValidBoardName(name)) return res.status(400).json({ error: 'Invalid board name.' });
    const team = await teamBehind(name);
    if (!team && !(await boardExists(name))) return res.status(404).json({ error: 'No such wipeboard.' });
    const text = String(req.body?.text ?? '').trim();
    if (!text) return res.status(400).json({ error: 'Nothing to post.' });
    try {
      count('board.post');
      const born = !!team && (await ensureBoard(name, teamStub(team)));
      const author = String(req.body?.author ?? '').trim() || (await ownerAuthor());
      const { to, silent } = audienceOf(req.body);
      const post = await appendPost(name, author, text, { to, silent });
      const results: Record<string, string> = await fanOut(name, post, author);
      await sweep(name);
      if (born) {
        const members = await boardMembers(name);
        const roll = members.map((m) => m.name);
        for (const m of members) {
          if (m.control !== 'write') {
            results[m.name] = 'on the team, not notified (dial is not 🤖)';
            continue;
          }
          const q = await enqueueMessage(m.name, teamJoinNotice(name, boardPath(name), roll), 'wipeboard_notice');
          const retained = await attemptMessage(q.id, 'safe');
          results[m.name] = retained ? `queued — ${retained.reason}` : 'notified';
        }
      }
      res.json({ ok: true, id: post.id, results });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.get('/api/wipeboards/:name/unread', async (req, res) => {
    const { name } = req.params;
    const session = String(req.query.session ?? '').trim();
    if (!isValidBoardName(name)) return res.status(400).json({ error: 'Invalid board name.' });
    if (!isValidName(session)) return res.status(400).json({ error: 'Name a session.' });
    try {
      if (!(await boardExists(name))) return res.json({ name, session, posts: [] });
      const posts = await unreadFor(name, await sessionKey(session), `@${session}`);
      res.json({ name, session, posts });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.put('/api/wipeboards/:name/brief', async (req, res) => {
    const { name } = req.params;
    if (!isValidBoardName(name)) return res.status(400).json({ error: 'Invalid board name.' });
    if (!(await boardExists(name))) {
      const team = await teamBehind(name);
      if (!team) return res.status(404).json({ error: 'No such wipeboard.' });
      await ensureBoard(name, teamStub(team));
    }
    try {
      await setBrief(name, String(req.body?.brief ?? '').slice(0, 8000));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

}

export async function announceTeamChanges(
  session: string,
  before: string[],
  after: string[],
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  const moves: [string[], boolean][] = [
    [after.filter((t) => !before.includes(t)), true],
    [before.filter((t) => !after.includes(t)), false],
  ];
  for (const [teams, join] of moves) {
    for (const t of teams) {
      if (!(await boardExists(t))) continue;
      await appendPost(t, 'system', `${await ownerAuthor()} ${join ? 'tagged' : 'untagged'} @${session} ${join ? 'into' : 'out of'} the "${t}" team`);
      if (!(await sessionExists(session))) {
        results[t] = 'session is gone — the board was told';
        continue;
      }
      const file = boardPath(t);
      const notice = join
        ? teamJoinNotice(t, file, (await boardMembers(t)).map((m) => m.name))
        : teamLeaveNotice(t, file);
      const q = await enqueueMessage(session, notice, 'wipeboard_notice');
      const retained = await attemptMessage(q.id, 'safe');
      results[t] = retained ? `queued — ${retained.reason}` : 'notified';
    }
  }
  return results;
}
