/* ---------- WIPEBOARDS — the team's board, over REST ----------
 * THE TEAM BOARD IS THE UNIT (owner, 2026-08-24): every team has one, membership is the
 * team's, and the leads see everything that hits it. Custom wipeboards — a board over an
 * arbitrary grouping outside a team — are CUT for now; a later generalist wipeboard is a
 * second utility to design on its own day, not a branch in this one. The storage half is
 * src/wipeboards.ts; `ronin_bin/tejun-wipeboard` is the same surface from a shell.
 * See docs/wipeboards.md.
 */
import type express from 'express';
import { type Control, getControl, isValidName, listSessions, sessionExists, teamsInPlay } from '../tmux.js';
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
import { readWipeboardSettings } from '../user-config.js';
import { count } from '../counts.js';

/**
 * Every live member of a wipeboard WITH the durable session key its cursor is filed
 * under. The reaper needs both: the name to match an addressee, the key to find the
 * cursor. Membership stays derived — this resolves it fresh, it never stores it.
 */
async function memberKeys(board: string): Promise<{ name: string; key: string }[]> {
  // The key rides listSessions' single exec — never one subprocess per member.
  const team = await teamBehind(board);
  if (!team) return [];
  return (await listSessions()).filter((s) => s.tags.includes(team)).map((s) => ({ name: s.name, key: s.key }));
}

/**
 * Retire what has been delivered, then remove the wipeboard itself if nothing points at
 * it any more. Called inline on every read and every post — that is what keeps the house
 * rule of no daemon and no timer, and it is cheap because the TTL keeps the directory
 * small. Never throws into a request: a wipeboard that could not be swept is not an
 * error the caller can do anything about.
 */
const SWEEP_EVERY_MS = 45_000;
const lastSweep = new Map<string, number>();

async function sweep(board: string): Promise<void> {
  // THROTTLED. The browser polls every couple of seconds; housekeeping on every poll is
  // how one tab made the whole server crawl. Once a minute per board keeps the lazy
  // no-daemon design without doing the work 30x over.
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
      // Custom enrolment is cut (owner, 2026-08-24) — nothing is enrolled on anything.
      enrolled: [],
      // The roster's `wipeboard:` TOKEN, never its name — a roster may point somewhere
      // else, and matching the name would remove a wipeboard a living team is using.
      // A roster's wipeboard is never removed: the roster implies it, and it must open
      // even when empty. This is the same id match teamBehind() uses.
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
  if (post.silent) return results; // parked — it lands and waits to be found
  const at = (s: string) => (s.startsWith('@') ? s.slice(1) : s);
  // THIS IS THE OWNER'S SURFACE, and an owner post interrupts EVERYONE by default —
  // "if the owner types a message, then all agents should see that" (owner, 2026-08-23).
  // The AGENT default is the opposite, deliberately: an agent's bare post interrupts the
  // lead alone (owner, 2026-08-24 — the board must be efficient, not a spam machine),
  // and that quiet default lives in src/wipeboard-cli.ts. The leads ride every list here
  // too; `to` narrows the members, never the leads.
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
    if (m.control !== 'write') {
      results[m.name] = 'not notified (dial is not 🤖) — it gets this on its next check';
      continue;
    }
    const queued = await enqueueMessage(m.name, notice, 'wipeboard_notice');
    const retained = await attemptMessage(queued.id, 'safe');
    results[m.name] = retained ? `queued — ${retained.reason}` : 'notified';
  }
  // Say who was deliberately not told. The poster learning what its post DID is half of
  // why addressing reduces noise rather than just moving it.
  if (unaddressed) results['(not addressed)'] = `${unaddressed} other(s) — they see it when they check`;
  return results;
}

/**
 * Whose wipeboard is this? THE ROSTER'S WIPEBOARD ID DECIDES, not the name (owner,
 * 2026-08-23) — a roster may point its wipeboard anywhere, and matching on the name sent
 * such a team to a wipeboard it was not a member of. A tag-only team with no roster
 * behind it still owns a wipeboard of its own name; it has no roster to carry an id.
 * Returns the TEAM NAME, or null for a custom wipeboard.
 */
async function teamBehind(board: string): Promise<string | null> {
  const owned = await teamOfBoard(board);
  if (owned) return owned;
  return (await teamsInPlay()).includes(board) ? board : null;
}

const isTeamBoard = async (name: string): Promise<boolean> => (await teamBehind(name)) !== null;

/**
 * Sessions currently on a board, with their dials — derived, never a stored roster.
 * The union view: a team wipeboard's members ARE the team, read off the tags; a custom
 * wipeboard's are whoever is enrolled in @ronin-wipeboards. One question, one answer,
 * whichever kind is asked about.
 */
async function boardMembers(board: string): Promise<{ name: string; control: Control }[]> {
  const sessions = await listSessions();
  // The team is found through the roster's wipeboard id, so members are the sessions
  // tagged into THAT TEAM — which is not necessarily the wipeboard's own name. Teams
  // only: custom enrolment is cut (owner, 2026-08-24), so a teamless board has nobody.
  const team = await teamBehind(board);
  if (!team) return [];
  // The dial rides listSessions' single exec — never one subprocess per member.
  return sessions.filter((s) => s.tags.includes(team)).map((s) => ({ name: s.name, control: s.control }));
}

export function registerWipeboards(app: express.Express): void {
  // Every board in play: each live team (kind 'team', whether or not its file exists
  // yet), then the customs — files plus any live option claims. A team wins its name:
  // an option claim on a team's name is superseded, not double-listed.
  app.get('/api/wipeboards', async (_req, res) => {
    try {
      // Every live team's board (through its roster's id — a team's board is real before
      // its directory is), then any directory no team owns, e.g. `house`. Enrolment is
      // gone, so an unowned board simply has no members.
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
        // OPENING A TEAM'S BOARD CREATES IT (owner, 2026-08-24: "should always have a
        // board — if there isn't one at team open it should fall back to create one").
        // No phantom answers: the surface that opens gets a real, empty board, which is
        // a normal state — the conversation that has not started yet.
        await ensureBoard(name, teamStub(team));
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
    const team = await teamBehind(name);
    if (!team && !(await boardExists(name))) return res.status(404).json({ error: 'No such wipeboard.' });
    const text = String(req.body?.text ?? '').trim();
    if (!text) return res.status(400).json({ error: 'Nothing to post.' });
    try {
      count('board.post');
      // Usually the board already exists — opening the team page creates it (owner,
      // 2026-08-24). A post reaching an uncreated one still materializes it, stubbed
      // with the TEAM's name (the roster's id need not be the team's name), and that
      // birth moment sends the members their one join notice.
      const born = !!team && (await ensureBoard(name, teamStub(team)));
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
      // Writing a Brief is authoring, so it MAY materialize a team's board — stubbed
      // with the TEAM's name, so the board says whose it is even before the brief lands.
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
      const q = await enqueueMessage(session, notice, 'wipeboard_notice');
      const retained = await attemptMessage(q.id, 'safe');
      results[t] = retained ? `queued — ${retained.reason}` : 'notified';
    }
  }
  return results;
}
