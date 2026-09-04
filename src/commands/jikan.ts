import { addJob, listJobs, nextRun, parseWhen, removeJob, setJob } from '../jikan.js';
import { tmux } from '../tmux-client.js';

const USAGE = `usage: tejun-jikan [--team t]
       tejun-jikan add --when "<timing>" --kind one-off|recurring [--expires <date-time>] [--to lead|<session>] [--team t] <request...>
       tejun-jikan pause|resume|now|remove <id> [--team t]
       tejun-jikan when "<timing>"
timing: once 2026-09-04 08:00 · daily 08:00 · weekdays 08:00 · weekly mon 08:00 · monthly 1 09:00 · hourly · every 30m · 0 8 * * 1-5`;

async function whoami(): Promise<{ name: string; teams: string[] }> {
  const name = process.env.RONIN_SESSION ?? '';
  const pane = process.env.TMUX_PANE;
  if (!pane && !name) return { name: '', teams: [] };
  try {
    const stdout = await tmux.run(['list-panes', '-a', '-F', '#{pane_id}\t#{session_name}\t#{@ronin-tags}']);
    for (const line of stdout.split('\n')) {
      const [id, session, tags] = line.split('\t');
      if ((pane && id === pane) || (name && session === name)) return { name: session, teams: (tags ?? '').split(',').map((t) => t.trim()).filter(Boolean) };
    }
  } catch { /* no tmux: no session */ }
  return { name, teams: [] };
}

async function main(): Promise<void> {
  const positional: string[] = [];
  const opts: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (['--team', '--when', '--to', '--expires', '--kind'].includes(argv[i])) opts[argv[i].slice(2)] = argv[++i] ?? '';
    else positional.push(argv[i]);
  }
  const verb = ['add', 'pause', 'resume', 'now', 'remove', 'when'].includes(positional[0] ?? '') ? positional.shift()! : 'list';

  if (verb === 'when') {
    const words = positional.join(' ');
    const spec = parseWhen(words);
    if (!spec) { console.error(`NOT-TIMING: "${words}"\n${USAGE}`); process.exit(2); }
    const out: string[] = [];
    for (let t = Date.now(), i = 0; i < 3; i++) { const n = nextRun(spec, t); if (n === null) break; out.push(new Date(n).toLocaleString()); t = n; }
    console.log(`${words} → ${out.join(' · ') || 'never (already passed)'}`);
    return;
  }
  const me = await whoami();
  const team = opts.team || me.teams[0] || '';
  if (!opts.team && me.teams.length > 1) console.warn(`WARNING: this session is on ${me.teams.join(', ')}; using ${team}.`);
  if (!team) { console.error('NO-TEAM: name one with --team'); process.exit(2); }

  if (verb === 'list') {
    const jobs = await listJobs(team);
    if (!jobs.length) { console.log(`no jobs on ${team}`); return; }
    for (const j of jobs) console.log(`${j.id}  ${j.state.padEnd(6)}  to ${j.to.padEnd(12)}  ${j.when.padEnd(22)}  due ${j.due || '—'}  last ${j.last || '—'}  · ${j.request}`);
    return;
  }
  if (verb === 'add') {
    const request = positional.join(' ');
    const inferred = /^(once|at) /.test(opts.when || '') ? 'one-off' : 'recurring';
    if (!opts.when || !request || !['one-off', 'recurring'].includes(opts.kind) || opts.kind !== inferred) { console.error(USAGE); process.exit(2); }
    const job = await addJob(team, { request, to: opts.to || 'lead', when: opts.when, expires: opts.expires || '', by: me.name || 'owner' });
    console.log(`SCHEDULED ${job.id} on ${team}: to ${job.to}, ${job.when}, due ${job.due} — ${job.request}`);
    return;
  }
  const id = positional[0] ?? '';
  if (!id) { console.error(USAGE); process.exit(2); }
  if (verb === 'remove') { console.log((await removeJob(team, id)) ? `REMOVED ${id} from ${team}` : `NO-SUCH-JOB ${id} on ${team}`); return; }
  const job = await setJob(team, id, verb === 'pause' ? 'paused' : verb === 'now' ? 'now' : 'active');
  console.log(`${verb.toUpperCase()} ${job.id} on ${team}${job.due ? `, due ${job.due}` : ''}`);
}

main().catch((e: Error) => { console.error(`REFUSED: ${e.message}`); process.exit(3); });
