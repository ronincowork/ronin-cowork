/**
 * tejun-jikan — an Agent's door to its team's Cron jobs (JIKAN, src/jikan.ts).
 *
 *   tejun-jikan                                  the team's jobs, one per line
 *   tejun-jikan add --when "<timing>" [--to lead|<session>] <request...>
 *   tejun-jikan pause <id> · resume <id> · remove <id>
 *   tejun-jikan when "<timing>"                  prove timing words: the next three moments
 *   --team <t> names a team when this session is on several (or none).
 *
 * THE LOGIC IS NOT HERE. src/jikan.ts owns it and the unit floor holds it; this resolves the
 * session and the team the way tejun-wipeboard does, and prints one-line verdicts. Exit 2 =
 * bad arguments or no team, 3 = refused (the reason is the line).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { addJob, describeWhen, editJob, listJobs, nextRun, parseWhen, removeJob } from './jikan.js';

const USAGE = `usage: tejun-jikan [--team t]
       tejun-jikan add --when "<timing>" [--to lead|<session>] [--team t] <request...>
       tejun-jikan pause|resume|remove <id> [--team t]
       tejun-jikan when "<timing>"
timing: once 2026-09-04 08:00 · daily 08:00 · weekdays 08:00 · weekly mon 08:00 · monthly 1 09:00 · hourly · every 30m · 0 8 * * 1-5`;

const pexec = promisify(execFile);

/** This session's name and teams, from its own pane — the wipeboard tool's rule. */
async function whoami(): Promise<{ name: string; teams: string[] }> {
  const name = process.env.RONIN_SESSION ?? '';
  const pane = process.env.TMUX_PANE;
  if (!pane && !name) return { name: '', teams: [] };
  try {
    const { stdout } = await pexec('tmux', ['list-panes', '-a', '-F', '#{pane_id}\t#{session_name}\t#{@ronin-tags}']);
    for (const line of stdout.split('\n')) {
      const [id, session, tags] = line.split('\t');
      if ((pane && id === pane) || (name && session === name)) {
        return { name: session, teams: (tags ?? '').split(',').map((t) => t.trim()).filter(Boolean) };
      }
    }
  } catch { /* no tmux: no session */ }
  return { name, teams: [] };
}

function flags(argv: string[]): { positional: string[]; opts: Record<string, string> } {
  const positional: string[] = [];
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--team' || a === '--when' || a === '--to') { opts[a.slice(2)] = argv[++i] ?? ''; continue; }
    positional.push(a);
  }
  return { positional, opts };
}

async function main(): Promise<void> {
  const { positional, opts } = flags(process.argv.slice(2));
  const VERBS = ['list', 'add', 'pause', 'resume', 'remove', 'when'];
  const verb = positional[0] && VERBS.includes(positional[0]) ? positional.shift()! : 'list';

  if (verb === 'when') {
    const words = positional.join(' ');
    const spec = parseWhen(words);
    if (!spec) { console.error(`NOT-TIMING: "${words}"\n${USAGE}`); process.exit(2); }
    let t = Date.now();
    const out: string[] = [];
    for (let i = 0; i < 3; i++) {
      const n = nextRun(spec, t, t);
      if (n === null) break;
      out.push(new Date(n).toString());
      t = n;
    }
    console.log(`${describeWhen(words)} → ${out.length ? out.join(' · ') : 'never (already passed)'}`);
    return;
  }

  const me = await whoami();
  const team = opts.team || (me.teams.length === 1 ? me.teams[0] : '');
  if (!team) {
    console.error(me.teams.length > 1 ? `WHICH-TEAM: this session is on ${me.teams.join(', ')} — name one with --team` : 'NO-TEAM: this session is on no team — name one with --team');
    process.exit(2);
  }

  if (verb === 'list') {
    const jobs = await listJobs(team);
    if (!jobs.length) { console.log(`no jobs on ${team}`); return; }
    for (const j of jobs) {
      console.log(`${j.id}  ${j.state.padEnd(6)}  to ${j.to.padEnd(12)}  ${describeWhen(j.when).padEnd(24)}  next ${j.next_run || '—'}  last ${j.last_outcome || '—'}  · ${j.request}`);
    }
    return;
  }
  if (verb === 'add') {
    const request = positional.join(' ');
    if (!opts.when || !request) { console.error(USAGE); process.exit(2); }
    const job = await addJob(team, { request, to: opts.to || 'lead', when: opts.when, by: me.name || 'owner' });
    console.log(`SCHEDULED ${job.id} on ${team}: to ${job.to}, ${describeWhen(job.when)}, next ${job.next_run} — ${job.request}`);
    return;
  }
  if (verb === 'pause' || verb === 'resume' || verb === 'remove') {
    const id = positional[0] ?? '';
    if (!id) { console.error(USAGE); process.exit(2); }
    if (verb === 'remove') {
      console.log((await removeJob(team, id)) ? `REMOVED ${id} from ${team}` : `NO-SUCH-JOB ${id} on ${team}`);
      return;
    }
    const job = await editJob(team, id, { state: verb === 'pause' ? 'paused' : 'active' });
    console.log(`${verb === 'pause' ? 'PAUSED' : 'RESUMED'} ${job.id} on ${team}${job.next_run ? `, next ${job.next_run}` : ''}`);
    return;
  }
  console.error(USAGE);
  process.exit(2);
}

main().catch((e: Error) => {
  console.error(`REFUSED: ${e.message}`);
  process.exit(3);
});
