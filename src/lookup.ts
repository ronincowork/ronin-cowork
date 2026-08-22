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
import { getControl, getWipeboards, listSessions } from './tmux.js';
import { boardExists, boardPath, isValidBoardName, listBoardFiles, readBoard } from './wipeboards.js';

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
      // Every wipeboard in play: each live team IS one (file or not, kind `team`), then
      // the customs — files plus live enrolments, a team superseding any claim on its name.
      const counts = new Map<string, number>();
      for (const s of all) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      const names = new Set(await listBoardFiles());
      for (const s of all) for (const b of await getWipeboards(s.name)) { if (!counts.has(b)) { names.add(b); } }
      const customs = [...names].filter((n) => !counts.has(n)).sort();
      if (!counts.size && !customs.length) return `${text.trim()} → no wipeboard exists yet. Every team has one the moment it exists; the owner can start a custom one in Ronin's ▤ Wipeboard tab. Nothing to look up.`;
      const lines = [
        ...[...counts.entries()].sort().map(([t, n]) => `${t} (team, ${n})`),
        ...customs.map((b) => `${b} (custom)`),
      ];
      return `${text.trim()} → wipeboards in play, resolved by Ronin (no lookup needed): ${lines.join(', ')}. Ask for one by name — "+wipeboard: <name>" — for its brief and roster.`;
    }
    const isTeam = teams.includes(want);
    if (!isValidBoardName(want) || (!isTeam && !(await boardExists(want)))) {
      const known = [...new Set([...teams, ...(await listBoardFiles())])].sort();
      return `${text.trim()} → there is no wipeboard "${want}".` + (known.length ? ` Wipeboards that exist: ${known.join(', ')}.` : ' No wipeboard exists yet.');
    }
    // A team wipeboard is real before its file is — empty thread, derived roster.
    const board = (await boardExists(want)) ? await readBoard(want) : { name: want, brief: '', posts: [] };
    const rows: string[] = [];
    for (const s of all) {
      const on = isTeam ? s.tags.includes(want) : (await getWipeboards(s.name)).includes(want);
      if (on) rows.push(`${s.name} [${DIAL_ICON[await getControl(s.name)] ?? '🤖 write'}]`);
    }
    const brief = board.brief.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
    return (
      `${text.trim()} → resolved by Ronin (no lookup needed): ${isTeam ? `the ${want} team's wipeboard` : `custom wipeboard "${want}"`} is ${boardPath(want)}. ` +
      `Brief: ${brief || '(empty — the owner has not written one yet)'}. ` +
      `On it${isTeam ? ' (membership follows the team)' : ''}: ${rows.length ? rows.join(', ') : 'nobody yet'}. ${board.posts.length} post(s) so far. ` +
      `Read it with "tejun-wipeboard ${want} read" and append with "tejun-wipeboard ${want} post <text>" — append only, never rewrite another agent's post, never edit the Brief. ` +
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
