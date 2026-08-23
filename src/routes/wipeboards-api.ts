/* ---------- WIPEBOARDS — one file, one tag, one tile ----------
 * A shared text surface a set of sessions can all read and write, so several agents
 * working the same problem talk to each other instead of every message routing through
 * the owner. The file half is src/wipeboards.ts, the membership half is the
 * @ronin-wipeboards tmux option (tmux.ts) — this is just the thin REST over both.
 *
 * Touches no pty and no pipe: `ronin_bin/tejun-wipeboard` is the same surface from a shell,
 * and the two are interchangeable. See docs/wipeboards.md.
 */
import type express from 'express';
import {
  type Control,
  getControl,
  getWipeboards,
  isValidName,
  listSessions,
  sessionExists,
  setWipeboards,
  teamsInPlay,
} from '../tmux.js';
import { sendText } from '../send.js';
import {
  appendPost,
  boardExists,
  boardPath,
  dropCursor,
  ensureBoard,
  isValidBoardName,
  joinNotice,
  leaveNotice,
  listBoardFiles,
  ownerAuthor,
  postNotice,
  readBoard,
  reapBoard,
  reapPosts,
  setBrief,
  teamJoinNotice,
  teamLeaveNotice,
  teamStub,
  unreadFor,
  type Post,
} from '../wipeboards.js';
import { sessionKey } from '../session-dir.js';
import { listTeamRosters } from '../team-rosters.js';
import { readWipeboardSettings } from '../user-config.js';
import { count } from '../counts.js';

/**
 * Every live member of a wipeboard WITH the durable session key its cursor is filed
 * under. The reaper needs both: the name to match an addressee, the key to find the
 * cursor. Membership stays derived — this resolves it fresh, it never stores it.
 */
async function memberKeys(board: string): Promise<{ name: string; key: string }[]> {
  const out: { name: string; key: string }[] = [];
  for (const m of await boardMembers(board)) out.push({ name: m.name, key: await sessionKey(m.name) });
  return out;
}

/**
 * Retire what has been delivered, then remove the wipeboard itself if nothing points at
 * it any more. Called inline on every read and every post — that is what keeps the house
 * rule of no daemon and no timer, and it is cheap because the TTL keeps the directory
 * small. Never throws into a request: a wipeboard that could not be swept is not an
 * error the caller can do anything about.
 */
async function sweep(board: string): Promise<void> {
  try {
    const { ttlMs, graceMs } = await readWipeboardSettings(board);
    await reapPosts(board, { members: await memberKeys(board), ttlMs, graceMs });
    const sessions = await listSessions();
    const rosters = await listTeamRosters();
    await reapBoard(board, {
      teamMembers: sessions.filter((s) => s.tags.includes(board)).map((s) => s.name),
      enrolled: (await Promise.all(
        sessions.map(async (s) => ((await getWipeboards(s.name)).includes(board) ? s.name : '')),
      )).filter(Boolean),
      // The roster's `wipeboard:` TOKEN, never its name — a roster may point somewhere
      // else, and matching the name would remove a wipeboard a living team is using.
      rosterPointsAtIt: rosters.some((r) => r.wipeboard === board),
    });
  } catch {
    /* a sweep that could not run is not a caller's problem */
  }
}

/** The audience a post was aimed at, off the request body. Absent = everyone. */
function audienceOf(body: unknown): { to: string[]; silent: boolean } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.silent === true) return { to: [], silent: true };
  const raw = Array.isArray(b.to) ? b.to : typeof b.to === 'string' ? String(b.to).split(',') : [];
  return { to: raw.map((t) => String(t).trim()).filter(Boolean), silent: false };
}

/**
 * Tell the wipeboard's members that something landed. A POINTER, never a copy: the notice
 * names the wipeboard and the poster and sends the reader to the one action.
 *
 * Addressing filters the INTERRUPT, not the post — everyone still receives it on their
 * next check. The dial is law throughout: a 👤/👁 member is never typed into, that
 * refusal is reported rather than worked around, and no dial is ever flipped.
 */
async function fanOut(board: string, post: Post, from: string): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  if (post.silent) return results;
  const at = (s: string) => (s.startsWith('@') ? s.slice(1) : s);
  const aimed = post.to.length ? new Set(post.to.map(at)) : null;
  const notice = postNotice(board, post.author);
  let unaddressed = 0;
  for (const m of await boardMembers(board)) {
    if (at(m.name) === at(from)) continue; // never the poster
    if (aimed && !aimed.has(at(m.name))) {
      unaddressed++;
      continue;
    }
    if (m.control !== 'write') {
      results[m.name] = 'not notified (dial is not 🤖) — it gets this on its next check';
      continue;
    }
    const { started } = await sendText(m.name, notice);
    results[m.name] = started ? 'notified' : 'the pane did not react';
  }
  // Say who was deliberately not told. The poster learning what its post DID is half of
  // why addressing reduces noise rather than just moving it.
  if (unaddressed) results['(not addressed)'] = `${unaddressed} other(s) — they see it when they check`;
  return results;
}

/** Does a live team bear this name? Then the board is a TEAM wipeboard and the team is
 * its membership; @ronin-wipeboards is not consulted for it. See docs/wipeboards.md. */
const isTeamBoard = async (name: string): Promise<boolean> => (await teamsInPlay()).includes(name);

/**
 * Sessions currently on a board, with their dials — derived, never a stored roster.
 * The union view: a team wipeboard's members ARE the team, read off the tags; a custom
 * wipeboard's are whoever is enrolled in @ronin-wipeboards. One question, one answer,
 * whichever kind is asked about.
 */
async function boardMembers(board: string): Promise<{ name: string; control: Control }[]> {
  const sessions = await listSessions();
  const team = sessions.some((s) => s.tags.includes(board));
  const out: { name: string; control: Control }[] = [];
  for (const s of sessions) {
    const on = team ? s.tags.includes(board) : (await getWipeboards(s.name)).includes(board);
    if (on) out.push({ name: s.name, control: await getControl(s.name) });
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
  // Every board in play: each live team (kind 'team', whether or not its file exists
  // yet), then the customs — files plus any live option claims. A team wins its name:
  // an option claim on a team's name is superseded, not double-listed.
  app.get('/api/wipeboards', async (_req, res) => {
    try {
      const sessions = await listSessions();
      const teams = new Map<string, number>();
      for (const s of sessions) for (const t of s.tags) teams.set(t, (teams.get(t) ?? 0) + 1);
      const names = new Set(await listBoardFiles());
      const counts = new Map<string, number>();
      for (const s of sessions) {
        for (const b of await getWipeboards(s.name)) {
          if (teams.has(b)) continue;
          names.add(b);
          counts.set(b, (counts.get(b) ?? 0) + 1);
        }
      }
      const boards = [
        ...[...teams.entries()].map(([name, members]) => ({ name, members, kind: 'team' as const })),
        ...[...names].filter((n) => !teams.has(n)).map((name) => ({ name, members: counts.get(name) ?? 0, kind: 'custom' as const })),
      ].sort((a, b) => a.name.localeCompare(b.name));
      res.json({ boards });
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
    // The team wins its name (owner decision, 2026-08-22): its wipeboard already exists
    // because the team does, so there is nothing to create and nothing to enroll.
    if (await isTeamBoard(name)) {
      return res.status(409).json({ error: `"${name}" is the ${name} team's wipeboard — it exists because the team does. Just open it.` });
    }
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
    try {
      const team = await isTeamBoard(name);
      if (!(await boardExists(name))) {
        if (!team) return res.status(404).json({ error: 'No such wipeboard.' });
        // A team wipeboard is real before its file is: it exists because the team does,
        // and the tile can open it. The file materializes on first post.
        return res.json({
          name, brief: '', posts: [], newest: '', file: boardPath(name),
          members: await boardMembers(name), kind: 'team', more: false,
        });
      }
      // Retire what has been delivered before answering — inline, so there is no daemon.
      await sweep(name);
      if (!(await boardExists(name))) {
        // The sweep removed it: nothing pointed at it any more. An ordinary outcome.
        return res.json({
          name, brief: '', posts: [], newest: '', file: boardPath(name),
          members: [], kind: team ? 'team' : 'custom', reaped: true,
        });
      }
      const [board, members] = await Promise.all([readBoard(name), boardMembers(name)]);
      const since = String(req.query.since ?? '');
      const limit = Math.max(0, Math.min(500, Number(req.query.limit ?? 0) || 0));
      let posts = since ? board.posts.filter((p) => p.id > since) : board.posts;
      // A page is the NEWEST n — the tab loads what is current and pulls older on scroll.
      const older = limit && posts.length > limit;
      if (limit) posts = posts.slice(-limit);
      res.json({
        name: board.name,
        brief: board.brief,
        posts,
        /** The newest post id, or ''. Replaces `mtime`: a directory of posts has no file
         *  mtime, and a derived one would only exist to humour a client we also own. */
        newest: board.posts.length ? board.posts[board.posts.length - 1].id : '',
        file: boardPath(name),
        members,
        kind: team ? 'team' : 'custom',
        /** Older posts exist beyond this page, or have cleared. The tab says so rather
         *  than letting a thread silently shorten itself, which reads as data loss. */
        more: older,
      });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  // The owner's own line from the tile. Watermarked `user: <name>`, never a session name —
  // a steer must never be mistaken for an agent's post.
  app.post('/api/wipeboards/:name/post', async (req, res) => {
    const { name } = req.params;
    if (!isValidBoardName(name)) return res.status(400).json({ error: 'Invalid board name.' });
    const team = await isTeamBoard(name);
    if (!team && !(await boardExists(name))) return res.status(404).json({ error: 'No such wipeboard.' });
    const text = String(req.body?.text ?? '').trim();
    if (!text) return res.status(400).json({ error: 'Nothing to post.' });
    try {
      count('board.post');
      // A team wipeboard materializes on first post. That moment — and only that
      // moment — sends the current members their join notice: they were never
      // enrolled, so nothing else has ever told them this wipeboard exists. This is
      // the JOIN notice, not a post echo; owner posts stay unannounced as ever.
      const born = team && (await ensureBoard(name, teamStub(name)));
      const author = String(req.body?.author ?? '').trim() || (await ownerAuthor());
      const { to, silent } = audienceOf(req.body);
      const post = await appendPost(name, author, text, { to, silent });
      // THE OWNER'S LINE NOW REACHES THE MEMBERS. It used to stay silent on the reasoning
      // that the owner already has the tile dials — but the dial route is one-to-one and
      // this is the broadcast case: "if the owner types a message, then all agents should
      // see that" (owner, 2026-08-23). Same one tejun-send fan-out, never a second path.
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
          const { started } = await sendText(m.name, teamJoinNotice(name, boardPath(name), roll));
          results[m.name] = started ? 'notified' : 'the pane did not react';
        }
      }
      res.json({ ok: true, id: post.id, results });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  /**
   * WHAT ONE SESSION HAS NOT READ — the shape behind the one action.
   *
   * OWNER-SCOPE, not session-scope. The browser is the owner, so it may ask about any
   * session; that is exactly why it is READ-ONLY and never advances a cursor. No
   * agent-facing path reaches another session's cursor — a session reads only its own
   * unread and advances only its own, the same asymmetry write_tegami already has.
   */
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
      // Writing a Brief is authoring, so it MAY materialize a team wipeboard — with
      // the team stub, so the file says whose it is even before the brief lands.
      if (!(await isTeamBoard(name))) return res.status(404).json({ error: 'No such wipeboard.' });
      await ensureBoard(name, teamStub(name));
    }
    try {
      await setBrief(name, String(req.body?.brief ?? '').slice(0, 8000));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  // Add a session or a whole team (a COPY of its membership at this moment — custom
  // boards are the one place that copy is legitimate, and it is said out loud). Add and
  // remove are equal citizens — an explicit ask.
  app.post('/api/wipeboards/:name/members', async (req, res) => {
    const { name } = req.params;
    if (!isValidBoardName(name)) return res.status(400).json({ error: 'Invalid board name.' });
    // A team wipeboard has no enrolment to edit: membership is the team's.
    if (await isTeamBoard(name)) {
      return res.status(409).json({ error: `"${name}" is a team wipeboard — membership is the team's. Tag sessions in the ⌂ Roster (or the tile's 🏷).` });
    }
    if (!(await boardExists(name))) return res.status(404).json({ error: 'No such wipeboard.' });
    const session = String(req.body?.session ?? '').trim();
    const team = String(req.body?.team ?? req.body?.group ?? '').trim().toLowerCase();
    if (!session && !team) return res.status(400).json({ error: 'Name a session or a team.' });
    try {
      const targets = session
        ? [session]
        : (await listSessions()).filter((s) => s.tags.includes(team)).map((s) => s.name);
      if (!targets.length) return res.status(404).json({ error: `No team "${team}" — nothing carries that tag.` });
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
    if (await isTeamBoard(name)) {
      return res.status(409).json({ error: `"${name}" is a team wipeboard — membership is the team's. Untag the session in the ⌂ Roster (or the tile's 🏷).` });
    }
    if (!(await boardExists(name))) return res.status(404).json({ error: 'No such wipeboard.' });
    try {
      // A dead session needs no untagging — its membership died with it, which is the
      // whole point of storing the roster on the session.
      const result = (await sessionExists(session))
        ? await setMembership(name, session, false)
        : 'session is gone — nothing to untag';
      // Its cursor goes with it: a member that has left must not hold a post back from
      // reaping, and a rejoin should see what is currently on the wipeboard.
      await dropCursor(name, await sessionKey(session)).catch(() => {});
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
    // Closing a team wipeboard would mean untagging the whole team — that is team
    // editing through the wrong door, and the wipeboard exists as long as the team does.
    if (await isTeamBoard(name)) {
      return res.status(409).json({ error: `"${name}" is a team wipeboard — it lives as long as the team. Untag its sessions in the ⌂ Roster to dissolve the team.` });
    }
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

/**
 * THE MEMBERSHIP EVENT FOR A TEAM WIPEBOARD IS THE TAG CHANGE — this announces it.
 * Called by whatever writes tags (the tags route, launch-time tagging), with the team
 * lists before and after. Per changed team it fires IFF that team's wipeboard file
 * exists: a team never posted to has no conversation to announce (docs/wipeboards.md);
 * the file's own birth notifies instead (see the post route). The board hears the
 * system line either way a member is told or not; the dial is law as ever, and a
 * refusal is reported, never worked around.
 */
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
      if ((await getControl(session)) !== 'write') {
        results[t] = join ? 'on the team, not notified (dial is not 🤖)' : 'off the team, not notified (dial is not 🤖)';
        continue;
      }
      const file = boardPath(t);
      const notice = join
        ? teamJoinNotice(t, file, (await boardMembers(t)).map((m) => m.name))
        : teamLeaveNotice(t, file);
      const { started } = await sendText(session, notice);
      results[t] = started ? 'notified' : 'the pane did not react';
    }
  }
  return results;
}
