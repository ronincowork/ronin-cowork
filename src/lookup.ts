/**
 * LOOKUP MACROS — the ones Ronin can answer itself, resolved at send time so the
 * receiving agent gets the ANSWER, not an errand. `+tag: ronin` arrives as the roster
 * already resolved: no compile, no tool call, no shelling out before it can reply.
 *
 * Only lookups belong here — read-only questions whose answer Ronin already holds.
 * Anything that CHANGES something stays a real macro the agent performs, where the
 * step tracking and the dial checks live. This is a shortcut past busywork, not past doctrine.
 *
 * Sends that don't come through Ronin (you typing into the pane yourself) are untouched
 * — the `tag` macro in MACROS.md is the fallback path for those, and says so.
 */
import { getControl, listSessions } from './tmux.js';
import { boardExists, boardOfTeam, boardPath, isValidBoardName, listBoardFiles, readBoard, teamOfBoard } from './wipeboards.js';

const DIAL_ICON: Record<string, string> = { user: '👤 user', read: '👁 read', write: '🤖 write' };

// ONE LINE, always: sendText types the text then Enter, so an embedded newline is a
// premature submit — a multi-line answer arrives as several half-prompts.
export async function expandLookup(text: string): Promise<string | null> {
  const all = await listSessions();
  const teams = [...new Set(all.flatMap((s) => s.tags))];
  const rosterOf = async (want: string) =>
    Promise.all(
      all
        .filter((s) => s.tags.includes(want))
        .map(async (s) => `${s.name} [${DIAL_ICON[await getControl(s.name)] ?? '🤖 write'}]`),
    );

  // `+wipeboard: <name>` — same contract as `+team:`: the answer, not an errand. What
  // lands is the brief, the roster and the PATH, which is all an agent needs to join a
  // conversation already in progress (it reads and appends to the file itself).
  // `whiteboard` is the one sanctioned alias (voice-to-text hears it that way); the old
  // bare-`board` spelling is gone — KOTOBA R4, there is no bare board.
  const wb = /^\s*[+ろ/]?(wipeboards?|whiteboards?)\s*:?\s*([a-z0-9_-]*)\s*$/i.exec(text);
  if (wb) {
    const want = wb[2].toLowerCase();
    if (!want) {
      // Every board in play: each live team's (through its roster's id — real before the
      // directory is), then any directory no team owns, e.g. `house`. Custom enrolment
      // is cut (owner, 2026-08-24): the team board is the unit.
      const counts = new Map<string, number>();
      for (const s of all) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      const teamRows: string[] = [];
      const owned = new Set<string>();
      for (const [t, n] of [...counts.entries()].sort()) {
        const id = await boardOfTeam(t);
        owned.add(id);
        teamRows.push(`${id} (the ${t} team's, ${n})`);
      }
      const others = (await listBoardFiles()).filter((b) => !owned.has(b)).sort();
      if (!teamRows.length && !others.length) return `${text.trim()} → no board exists yet. Every team has one the moment it exists. Nothing to look up.`;
      const lines = [...teamRows, ...others.map((b) => `${b}`)];
      return `${text.trim()} → wipeboards in play, resolved by Ronin (no lookup needed): ${lines.join(', ')}. Ask for one by name — "+wipeboard: <name>" — for its brief and roster.`;
    }
    // A team's name resolves to its board; a board id resolves to itself.
    const owner = await teamOfBoard(want);
    const asTeam = teams.includes(want) ? want : owner && teams.includes(owner) ? owner : null;
    const boardId = asTeam ? await boardOfTeam(asTeam) : want;
    const isTeam = asTeam !== null;
    if (!isValidBoardName(boardId) || (!isTeam && !(await boardExists(boardId)))) {
      const known = [...new Set([...teams, ...(await listBoardFiles())])].sort();
      return `${text.trim()} → there is no wipeboard "${want}".` + (known.length ? ` Wipeboards that exist: ${known.join(', ')}.` : ' No wipeboard exists yet.');
    }
    // A team's board is real before its directory is — empty thread, derived roster.
    const board = (await boardExists(boardId)) ? await readBoard(boardId) : { name: boardId, brief: '', posts: [] };
    const rows: string[] = [];
    for (const s of all) {
      if (isTeam && s.tags.includes(asTeam as string)) rows.push(`${s.name} [${DIAL_ICON[await getControl(s.name)] ?? '🤖 write'}]`);
    }
    const brief = board.brief.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
    return (
      `${text.trim()} → resolved by Ronin (no lookup needed): ${isTeam ? `the ${asTeam} team's board` : `board "${boardId}"`} is ${boardPath(boardId)}. ` +
      `Brief: ${brief || '(empty — the owner has not written one yet)'}. ` +
      `On it${isTeam ? ' (membership follows the team)' : ''}: ${rows.length ? rows.join(', ') : 'nobody yet'}. ${board.posts.length} post(s) so far. ` +
      `Run "tejun-wipeboard" to be handed whatever you have not read; post to your own team's board with "tejun-wipeboard post <text>" ` +
      `(no name needed — a name is only for a board that is not your team's; --to names who is interrupted, not who may read; the lead always is). ` +
      `Never rewrite another agent's post, never edit the Brief. ` +
      `This is a lookup: report it and wait unless you were already told what to say there.`
    );
  }

  // WHOLE message is the invocation ("+team: ronin") — the message becomes the answer.
  // `+team:` is the invocation; the retired `+tag:`/`+group:` spellings are still READ
  // (an agent's old habit must keep answering) but every answer speaks team.
  const solo = /^\s*[+ろ/]?(teams?|tags?|groups?)\s*:?\s*([a-z0-9_-]*)\s*$/i.exec(text);
  if (solo) {
    const want = solo[2].toLowerCase();
    if (!want) {
      const counts = new Map<string, number>();
      for (const s of all) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      if (!counts.size) return `${text.trim()} → no session is on a team yet. Teams are set by the owner (🏷 on the tile header in Ronin). Nothing to look up.`;
      const lines = [...counts.entries()].sort().map(([g, n]) => `${g} (${n})`);
      return `${text.trim()} → teams in play, resolved by Ronin (no lookup needed): ${lines.join(', ')}. Ask for one by name — "+team: <name>" — to see its members.`;
    }
    const rows = await rosterOf(want);
    if (!rows.length) {
      const known = [...teams].sort();
      return (
        `${text.trim()} → there is no "${want}" team.` +
        (known.length ? ` Teams that exist: ${known.join(', ')}. Don't assume a near-match — "kojin" and "kojinsa" are different teams.` : ' No team exists yet.')
      );
    }
    return (
      `${text.trim()} → resolved by Ronin (no lookup needed): the ${want} team is ${rows.length} session(s) — ${rows.join(', ')}. ` +
      `That set is what "${want}" means here. Membership changes as sessions are born, tagged or die, so re-run "tejun-team ${want}" before acting on the team later, and control-check each member before touching it. ` +
      `This is a lookup: report it and wait unless you were already told what to do with them.`
    );
  }

  // INLINE — "summarize what's happening across +team: ronin". The owner's sentence is
  // the instruction and must survive untouched; the roster is appended as a clause, so
  // the agent reads the ask and the facts together and still spends zero lookups.
  // The leading + (or /) is REQUIRED here: without it, prose like "team: the release"
  // would be mistaken for an invocation.
  const inline = [...text.matchAll(/[+ろ/](teams?|tags?|groups?)\s*:?\s*([a-z0-9_-]+)/gi)];
  if (!inline.length) return null;
  const seen = new Set<string>();
  const clauses: string[] = [];
  for (const m of inline) {
    const want = m[2].toLowerCase();
    if (seen.has(want)) continue;
    seen.add(want);
    const rows = await rosterOf(want);
    clauses.push(
      rows.length
        ? `+team: ${want} = ${rows.length} session(s) — ${rows.join(', ')}`
        : `+team: ${want} = NO SUCH TEAM (nothing carries "${want}"; don't guess a near-match)`,
    );
  }
  return (
    `${text.trim()}  ⟨resolved by Ronin, no lookup needed: ${clauses.join('; ')}. ` +
    `Membership can change — re-check with "tejun-team <team>" before acting later, and control-check each member before touching it.⟩`
  );
}
