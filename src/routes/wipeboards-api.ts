/* ---------- WIPEBOARDS — one file, one tag, one tile ----------
 * A shared text surface a set of sessions can all read and write, so several agents
 * working the same problem talk to each other instead of every message routing through
 * the owner. The file half is src/wipeboards.ts, the membership half is the
 * @ronin-wipeboards tmux option (tmux.ts) — this is just the thin REST over both.
 *
 * Touches no pty and no pipe: `bin/tejun-wipeboard` is the same surface from a shell,
 * and the two are interchangeable. See docs/wipeboards.md.
 */
import type express from 'express';
import {
  type Control,
  getControl,
  getWipeboards,
  isValidName,
  listSessions,
  sendText,
  sessionExists,
  setWipeboards,
} from '../tmux.js';
import {
  appendPost,
  boardExists,
  boardPath,
  ensureBoard,
  isValidBoardName,
  joinNotice,
  leaveNotice,
  listBoardFiles,
  ownerAuthor,
  readBoard,
  setBrief,
} from '../wipeboards.js';
import { count } from '../counts.js';

/** Sessions currently on a board, with their dials — derived, never a stored roster. */
async function boardMembers(board: string): Promise<{ name: string; control: Control }[]> {
  const out: { name: string; control: Control }[] = [];
  for (const s of await listSessions()) {
    if ((await getWipeboards(s.name)).includes(board)) {
      out.push({ name: s.name, control: await getControl(s.name) });
    }
  }
  return out;
}

/**
 * Tag or untag one session and tell it, in that order. The dial is law: a session that
 * is not `write` is still enrolled (membership is the owner's call) but never typed
 * into, and the refusal is reported rather than worked around. Nothing here flips a dial.
 */
async function setMembership(board: string, session: string, join: boolean): Promise<string> {
  const cur = await getWipeboards(session);
  if (join && cur.includes(board)) return 'already a member';
  if (!join && !cur.includes(board)) return 'not a member';
  await setWipeboards(session, join ? [...cur, board] : cur.filter((b) => b !== board));
  // The board hears about every roster change, so members already reading learn who
  // joined without anyone being messaged twice. (Decision 5 — the one chat-like flourish.)
  await appendPost(board, 'system', `${await ownerAuthor()} ${join ? 'added' : 'removed'} @${session}`);
  if ((await getControl(session)) !== 'write') return 'enrolled, not notified (dial is not 🤖)';
  const file = boardPath(board);
  const notice = join
    ? joinNotice(board, file, (await boardMembers(board)).map((m) => m.name))
    : leaveNotice(board, file);
  const { started } = await sendText(session, notice);
  return started ? 'notified' : 'enrolled, but the pane did not react';
}

export function registerWipeboards(app: express.Express): void {
  // Every board in play: those with a file, plus any a live session claims membership of.
  app.get('/api/wipeboards', async (_req, res) => {
    try {
      const names = new Set(await listBoardFiles());
      const counts = new Map<string, number>();
      for (const s of await listSessions()) {
        for (const b of await getWipeboards(s.name)) {
          names.add(b);
          counts.set(b, (counts.get(b) ?? 0) + 1);
        }
      }
      res.json({
        boards: [...names].sort().map((name) => ({ name, members: counts.get(name) ?? 0 })),
      });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.post('/api/wipeboards', async (req, res) => {
    const name = String(req.body?.name ?? '').trim().toLowerCase();
    if (!isValidBoardName(name)) {
      return res.status(400).json({ error: 'Board names are lowercase letters, digits, - and _ (max 32).' });
    }
    if (await boardExists(name)) return res.status(409).json({ error: `Wipeboard "${name}" already exists.` });
    try {
      await ensureBoard(name);
      const brief = String(req.body?.brief ?? '').trim();
      if (brief) await setBrief(name, brief);
      res.json({ ok: true, name });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.get('/api/wipeboards/:name', async (req, res) => {
    const { name } = req.params;
    if (!isValidBoardName(name)) return res.status(400).json({ error: 'Invalid board name.' });
    if (!(await boardExists(name))) return res.status(404).json({ error: 'No such wipeboard.' });
    try {
      const [board, members] = await Promise.all([readBoard(name), boardMembers(name)]);
      res.json({ ...board, file: boardPath(name), members });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  // The owner's own line from the tile. Watermarked `user: <name>`, never a session name —
  // a steer must never be mistaken for an agent's post.
  app.post('/api/wipeboards/:name/post', async (req, res) => {
    const { name } = req.params;
    if (!isValidBoardName(name)) return res.status(400).json({ error: 'Invalid board name.' });
    if (!(await boardExists(name))) return res.status(404).json({ error: 'No such wipeboard.' });
    const text = String(req.body?.text ?? '').trim();
    if (!text) return res.status(400).json({ error: 'Nothing to post.' });
    try {
      count('board.post');
      await appendPost(name, String(req.body?.author ?? '').trim() || (await ownerAuthor()), text);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.put('/api/wipeboards/:name/brief', async (req, res) => {
    const { name } = req.params;
    if (!isValidBoardName(name)) return res.status(400).json({ error: 'Invalid board name.' });
    if (!(await boardExists(name))) return res.status(404).json({ error: 'No such wipeboard.' });
    try {
      await setBrief(name, String(req.body?.brief ?? '').slice(0, 8000));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  // Add a session or a whole group. Add and remove are equal citizens — an explicit ask.
  app.post('/api/wipeboards/:name/members', async (req, res) => {
    const { name } = req.params;
    if (!isValidBoardName(name)) return res.status(400).json({ error: 'Invalid board name.' });
    if (!(await boardExists(name))) return res.status(404).json({ error: 'No such wipeboard.' });
    const session = String(req.body?.session ?? '').trim();
    const group = String(req.body?.group ?? '').trim().toLowerCase();
    if (!session && !group) return res.status(400).json({ error: 'Name a session or a group.' });
    try {
      const targets = session
        ? [session]
        : (await listSessions()).filter((s) => s.tags.includes(group)).map((s) => s.name);
      if (!targets.length) return res.status(404).json({ error: `Nothing is tagged "${group}".` });
      const results: Record<string, string> = {};
      for (const t of targets) {
        if (!(await sessionExists(t))) {
          results[t] = 'no such session';
          continue;
        }
        results[t] = await setMembership(name, t, true);
      }
      res.json({ ok: true, results, members: await boardMembers(name) });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.delete('/api/wipeboards/:name/members/:session', async (req, res) => {
    const { name, session } = req.params;
    if (!isValidBoardName(name)) return res.status(400).json({ error: 'Invalid board name.' });
    if (!isValidName(session)) return res.status(400).json({ error: 'Invalid session name.' });
    if (!(await boardExists(name))) return res.status(404).json({ error: 'No such wipeboard.' });
    try {
      // A dead session needs no untagging — its membership died with it, which is the
      // whole point of storing the roster on the session.
      const result = (await sessionExists(session))
        ? await setMembership(name, session, false)
        : 'session is gone — nothing to untag';
      res.json({ ok: true, result, members: await boardMembers(name) });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  /**
   * Close a board: untag every member and tell them — but KEEP the file. Deleting
   * somebody's transcript on a button press is not KISS, it's just destructive (owner
   * decision, 2026-08-07). Removing the file is a deliberate `rm` the owner can do.
   */
  app.delete('/api/wipeboards/:name', async (req, res) => {
    const { name } = req.params;
    if (!isValidBoardName(name)) return res.status(400).json({ error: 'Invalid board name.' });
    if (!(await boardExists(name))) return res.status(404).json({ error: 'No such wipeboard.' });
    try {
      const results: Record<string, string> = {};
      for (const m of await boardMembers(name)) results[m.name] = await setMembership(name, m.name, false);
      res.json({ ok: true, results, file: boardPath(name), kept: true });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
}
