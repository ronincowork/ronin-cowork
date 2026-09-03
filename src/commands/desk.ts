/**
 * desk-cli — `tejun-desk`, the one door a session has onto its desks.
 *
 * WHY TYPESCRIPT: the same arrangement as `tejun-wipeboard` → `wipeboard-cli.ts`. The
 * logic — registry, candidates, compare-and-swap, receipts, adoption — is `src/desks/`,
 * covered by the unit floor; a bash re-implementation would be a second copy free to
 * drift. The bash wrapper (`ronin_bin/tejun-desk`) only finds the tree and execs this.
 *
 * Every verb is a one-line verdict first, detail after; exit codes agents branch on:
 *   0 done · 2 bad arguments · 3 no session / no desk · 4 REFUSED · 5 could not run git
 *
 * The session is whoever is typing (`TMUX_PANE`), or `--session`; `RONIN_SESSION` and
 * `RONIN_TEAMS` are the test seams so the unit floor never shells tmux. The repo defaults
 * to this session's desks — one repo, no argument needed; several, `--assignment`
 * (hand-in) or a repo name.
 */
import { listSessions } from '../tmux.js';
import { deriveAssignment, listDesks, readAssignment, assignmentId } from '../desks/registry.js';
import { closeDesk, discardDesk, openDesk, parkedDesks, recoverDesk, syncDesk } from '../desks/desk.js';
import { handIn, handInAssignment } from '../desks/hand-in.js';
import { notifyLeads, replyToHandIn, teamOfLine } from '../desks/lead.js';
import { acceptedSince, receiptById, receiptsForDesk, receiptsForLine } from '../desks/receipts.js';
import { queueHolder } from '../desks/queue.js';
import { deskId, type DeskNotice, type DeskStatus, type HandInReceipt } from '../desks/schema.js';

const out = (s = '') => process.stdout.write(s + '\n');
function die(verdict: string, code: number): never {
  out(verdict);
  process.exit(code);
}

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

async function myTeams(session: string): Promise<string[]> {
  if (process.env.RONIN_TEAMS !== undefined) return process.env.RONIN_TEAMS.split(',').map((t) => t.trim()).filter(Boolean);
  const sessions = await listSessions().catch(() => []);
  return sessions.find((s) => s.name === session)?.tags ?? [];
}

interface Args { verb: string; positional: string[]; flags: Map<string, string | true> }
function parse(argv: string[]): Args {
  const [verb = 'status', ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const eq = k.indexOf('=');
      if (eq >= 0) flags.set(k.slice(0, eq), k.slice(eq + 1));
      else if (rest[i + 1] && !rest[i + 1]!.startsWith('--') && !['assignment', 'unmount', 'yes', 'line', 'accepted'].includes(k)) flags.set(k, rest[++i]!);
      else flags.set(k, true);
    } else positional.push(a);
  }
  return { verb, positional, flags };
}

const str = (v: string | true | undefined): string => (typeof v === 'string' ? v : '');

const USAGE = `usage: tejun-desk status [--session s | --team t | --repo r]
       tejun-desk open <repo> [--team t] [--session s]
       tejun-desk hand-in [<repo>] [--assignment]
       tejun-desk sync [<repo>]
       tejun-desk park [<repo>] [--unmount]
       tejun-desk parked [--team t] [--repo r]
       tejun-desk recover <repo> <branch> [--session s]
       tejun-desk discard <repo> <branch> --yes
       tejun-desk reply <repo> <receipt id> <message…>
       tejun-desk receipts [<repo>] [--line [--accepted | --since <line sha>] | --id <receipt id>]`;

function row(d: DeskStatus): string {
  const bits = [
    d.state === 'parked' ? 'PARKED' : d.dirty ? `dirty ${d.dirty_files.length}` : 'clean',
    `ahead ${d.ahead}`,
    d.behind ? `behind ${d.behind}` : '',
    d.pending ? `pending update (by ${d.pending.by}${d.pending.overlap.length ? `, overlaps ${d.pending.overlap.join(', ')}` : ''})` : '',
    d.last_hand_in ? `last hand-in ${d.last_hand_in}` : 'never handed in',
    d.blocked ? `BLOCKED: ${d.blocked}` : '',
    d.mounted ? '' : 'unmounted',
  ].filter(Boolean);
  return `${deskId(d)} → ${d.line}  ${bits.join(' · ')}  ${d.worktree}`;
}

function noticeLine(n: DeskNotice): string {
  switch (n.kind) {
    case 'adopted': return `  ${n.repo}:${n.desk} (${n.session}) adopted the line`;
    case 'pending': return `  ${n.repo}:${n.desk} (${n.session}) is dirty — update pending, files untouched`;
    case 'pending_overlap': return `  ${n.repo}:${n.desk} (${n.session}) is dirty AND overlaps: ${n.files.join(', ')} — update pending, files untouched`;
    case 'conflict': return `  ${n.repo}:${n.desk} (${n.session}) conflicts with the line on ${n.files.join(', ')} — left as it is; contained at its hand-in`;
  }
}

function receiptLine(r: HandInReceipt): string {
  const tail = r.result === 'accepted' ? `line → ${r.line_sha.slice(0, 10)}` : r.result === 'conflict' ? `on ${r.conflict_files.join(', ')}` : r.reason;
  return `${r.at}  ${r.result.toUpperCase().padEnd(8)}  ${r.repo}:${r.desk}  ${r.source_tip.slice(0, 10)} onto ${r.expected_old.slice(0, 10)}  ${tail}  [${r.id}]`;
}

/** This session's desks, narrowed to one repo when named. */
async function mine(session: string, repo: string): Promise<DeskStatus[]> {
  const all = await listDesks({ session, ...(repo ? { repo } : {}) });
  return all.filter((d) => d.state === 'open');
}

async function pickOne(session: string, repo: string, verb: string): Promise<DeskStatus> {
  const desks = await mine(session, repo);
  if (!desks.length) die(repo ? `NO-DESK: ${session} has no open desk on ${repo}` : `NO-DESK: ${session} has no open desk`, 3);
  if (desks.length > 1) die(`WHICH-REPO: ${session} has desks on ${desks.map((d) => d.repo).join(', ')} — name one (tejun-desk ${verb} <repo>)`, 2);
  return desks[0]!;
}

async function main(): Promise<void> {
  const { verb, positional, flags } = parse(process.argv.slice(2));
  if (verb === '--help' || verb === 'help' || verb === '-h') die(USAGE, 0);
  const session = str(flags.get('session')) || (await whoami());
  try {
    switch (verb) {
      case 'status': {
        const filter = str(flags.get('team')) ? { team: str(flags.get('team')) }
          : str(flags.get('repo')) ? { repo: str(flags.get('repo')) }
          : session ? { session } : {};
        const desks = await listDesks(filter);
        if (!desks.length) die(session || Object.keys(filter).length ? `NO-DESK: nothing recorded for ${JSON.stringify(filter)}` : 'NO-DESK: no desks recorded on this box', 0);
        out(`${desks.length} desk(s)`);
        for (const d of desks) out(row(d));
        for (const key of new Set(desks.map((d) => `${d.repo}\t${d.line}`))) {
          const [repo, line] = key.split('\t') as [string, string];
          const h = await queueHolder(repo, line);
          if (h) out(`  queue ${repo}:${line} held by pid ${h.pid} since ${h.at}${h.alive ? '' : ' (dead — reclaimed on next hand-in)'}`);
        }
        return;
      }
      case 'open': {
        const repo = positional[0];
        if (!repo) die(USAGE, 2);
        if (!session) die('NO-SESSION: not inside a session and no --session', 3);
        const team = str(flags.get('team')) || (await myTeams(session))[0] || '';
        const d = await openDesk({ repo, session, team, assignment: assignmentId(session, team) });
        out(`OPENED ${deskId(d)} → ${d.line} at ${d.worktree}`);
        out(row(d));
        return;
      }
      case 'hand-in': {
        if (!session) die('NO-SESSION: not inside a session and no --session', 3);
        let targets: DeskStatus[];
        if (flags.get('assignment')) {
          targets = await mine(session, '');
          if (!targets.length) die(`NO-DESK: ${session} has no open desk`, 3);
        } else targets = [await pickOne(session, positional[0] ?? '', 'hand-in')];
        let worst = 0;
        const outcomes = flags.get('assignment') ? await handInAssignment({ desks: targets }) : [await handIn(targets[0]!.repo, targets[0]!.branch)];
        for (const [i, { receipt, notices }] of outcomes.entries()) {
          const d = targets[i]!;
          out(`${receipt.result.toUpperCase()} ${deskId(d)} → ${d.line}${receipt.result === 'accepted' ? ` now ${receipt.line_sha.slice(0, 10)}` : ''}${receipt.reason ? ` — ${receipt.reason}` : ''}${receipt.conflict_files.length ? ` — files: ${receipt.conflict_files.join(', ')}` : ''}  [${receipt.id}]`);
          for (const n of notices) if (n.kind !== 'adopted' || n.desk === d.branch) out(noticeLine(n));
          if (receipt.result !== 'accepted') worst = 4;
          // The lead is told, dial or no dial: review and promote is its primary job
          // (owner law 2026-08-28; src/desks/lead.ts). Accepted → "promote when coherent";
          // a conflict → "adjudicate". Anything else (refused: nothing ahead, dirty
          // funnel) is the session's own to fix and does not reach the lead.
          const team = teamOfLine(d.line);
          const outcome = receipt.result === 'accepted' ? 'accepted' : receipt.conflict_files.length ? 'conflict' : null;
          if (team && outcome) {
            for (const dlv of await notifyLeads({ team, line: d.line, session, receiptId: receipt.id, result: outcome, lineSha: receipt.line_sha, files: receipt.conflict_files })) {
              out(dlv.how === 'self' ? `  YOU ARE THE LEAD FOR THIS ONE — ${dlv.detail}` : `  lead ${dlv.to}: ${dlv.how === 'house-send' ? 'told' : 'not reachable at the tile — posted on the team wipeboard'} — ${dlv.detail}`);
            }
          }
        }
        process.exit(worst);
      }
      case 'sync': {
        if (!session) die('NO-SESSION: not inside a session and no --session', 3);
        const d = await pickOne(session, positional[0] ?? '', 'sync');
        const n = await syncDesk(d.repo, d.branch);
        out(`${n.kind.toUpperCase().replace('_', '-')} ${deskId(d)}`);
        out(noticeLine(n));
        process.exit(n.kind === 'adopted' ? 0 : 4);
      }
      case 'park': {
        if (!session) die('NO-SESSION: not inside a session and no --session', 3);
        const targets = positional[0] ? [await pickOne(session, positional[0], 'park')] : await mine(session, '');
        if (!targets.length) die(`NO-DESK: ${session} has no open desk`, 3);
        for (const d of targets) {
          const o = await closeDesk(d.repo, d.branch, { unmount: !!flags.get('unmount') });
          out(`${o.action.toUpperCase()} ${deskId(d)}${o.wip ? ` — unsaved files kept as WIP ${o.wip.slice(0, 10)}` : ''}${o.desk ? ` — ${o.desk.ahead} commit(s) ahead, not handed in; the lead sees it` : ' — tip already on the line'}${o.unmounted && o.action === 'parked' ? ' (worktree unmounted, branch kept)' : ''}`);
        }
        return;
      }
      case 'parked': {
        const desks = await parkedDesks({ ...(str(flags.get('team')) ? { team: str(flags.get('team')) } : {}), ...(str(flags.get('repo')) ? { repo: str(flags.get('repo')) } : {}) });
        if (!desks.length) die('NONE parked', 0);
        out(`${desks.length} parked desk(s) — hand in · inspect · reassign (tejun-desk recover) · discard (tejun-desk discard --yes)`);
        for (const d of desks) out(`${row(d)}  since ${d.parked_at ?? '?'} by ${d.session}`);
        return;
      }
      case 'recover': {
        const [repo, branch] = positional;
        if (!repo || !branch) die(USAGE, 2);
        const to = str(flags.get('session')) || session;
        if (!to) die('NO-SESSION: say --session <name> to reassign to', 3);
        const d = await recoverDesk(repo, branch, to);
        out(`RECOVERED ${deskId(d)} → ${to} at ${d.worktree}`);
        out(row(d));
        return;
      }
      case 'discard': {
        const [repo, branch] = positional;
        if (!repo || !branch) die(USAGE, 2);
        if (!flags.get('yes')) die(`REFUSED: discard deletes ${repo}:${branch} and every commit only it holds — say --yes`, 4);
        await discardDesk(repo, branch);
        out(`DISCARDED ${repo}:${branch}`);
        return;
      }
      case 'reply': {
        const [repo, id, ...words] = positional;
        const message = words.join(' ').trim();
        if (!repo || !id || !message) die('usage: tejun-desk reply <repo> <receipt id> <message…>', 2);
        if (!session) die('NO-SESSION: not inside a session and no --session', 3);
        const receipt = await receiptById(repo, id);
        if (!receipt) die(`NONE: no receipt ${id} on ${repo}`, 3);
        const team = teamOfLine(receipt.line);
        if (!team || team !== receipt.team) die(`REFUSED: ${id} is not a team-line hand-in`, 4);
        let delivery;
        try {
          delivery = await replyToHandIn({ team, from: session, to: receipt.session, receiptId: id, message });
        } catch (e) {
          die(`REFUSED: ${(e as Error).message}`, 4);
        }
        out(`REPLIED ${id} → ${receipt.session}: ${delivery.how === 'house-send' ? 'delivered regardless of dial' : 'tile unavailable; saved on team wipeboard'} — ${delivery.detail}`);
        return;
      }
      case 'receipts': {
        const repo = positional[0] ?? '';
        let rows: HandInReceipt[] = [];
        if (str(flags.get('id'))) {
          if (!repo) die('usage: tejun-desk receipts <repo> --id <receipt id>', 2);
          const r = await receiptById(repo, str(flags.get('id')));
          if (!r) die(`NONE: no receipt ${str(flags.get('id'))} on ${repo}`, 3);
          out(receiptLine(r));
          out(JSON.stringify(r, null, 2));
          return;
        }
        if (flags.get('line')) {
          const team = str(flags.get('team')) || (session ? (await myTeams(session))[0] ?? '' : '');
          const a = await deriveAssignment({ session: session || 'nobody', team, project_root: repo });
          const d = a.desks.find((x) => x.repo === repo) ?? a.desks[0];
          if (!d) die(`NO-DESK: no line for ${repo || '(no repo)'} on team ${team || '(none)'}`, 3);
          rows = str(flags.get('since')) !== '' || flags.get('accepted')
            ? await acceptedSince(d.repo, d.line, str(flags.get('since')))
            : await receiptsForLine(d.repo, d.line);
        } else {
          if (!session) die('NO-SESSION: not inside a session and no --session', 3);
          for (const d of await listDesks({ session, ...(repo ? { repo } : {}) })) rows.push(...(await receiptsForDesk(d.repo, d.branch, d.line)));
        }
        if (!rows.length) die('NONE', 0);
        for (const r of rows) out(receiptLine(r));
        return;
      }
      case 'assignment': {
        if (!session) die('NO-SESSION', 3);
        const team = str(flags.get('team')) || (await myTeams(session))[0] || '';
        const a = await readAssignment(assignmentId(session, team));
        if (!a) die(`NONE: ${session} has no recorded assignment on ${team || 'solo'}`, 0);
        out(`${a.id} primary ${a.primary}`);
        for (const d of a.desks) out(`  ${deskId(d)} → ${d.line}  ${d.worktree}`);
        return;
      }
      default:
        die(`unknown verb '${verb}'\n${USAGE}`, 2);
    }
  } catch (e) {
    die(`STUCK: ${(e as Error).message}`, 5);
  }
}

await main();
