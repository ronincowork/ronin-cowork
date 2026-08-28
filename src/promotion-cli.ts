import { listProjectRoots } from './project-roots.js';
import { readTeamRoster } from './team-rosters.js';
import { readArrangement } from './desks/arrangement.js';
import { teamLineBranch } from './desks/schema.js';
import { abandonPromotion, bisectLine, promoteTeam, resumePromotion, revertPromotion } from './promotion/promote.js';
import { listReceipts, readReceipt, summarize, toChangeSet } from './promotion/receipts.js';
import type { RepoSpec } from './promotion/candidate.js';
import type { ByoinMode } from './promotion/byoin.js';

/**
 * ronin-promote — the lead's door from a team line into `dev`. `bin/ronin-promote` is the
 * bash face; this is the whole of it.
 *
 *   ronin-promote <team> [--mode full|gates|ui] [--no-restart] [--dry-run] [--repo name=dir …]
 *   ronin-promote resume <receipt-id> [--no-restart]
 *   ronin-promote abandon <receipt-id> <reason…>
 *   ronin-promote revert <receipt-id|last> [--mode …]
 *   ronin-promote bisect <team> [--repo name] [--from <sha>] [--mode …]
 *   ronin-promote receipts [team]
 *   ronin-promote show <receipt-id> [--pr-block | --shared]
 *
 * A team's repos come from its roster (`repos`, else its `project_root`), each resolved
 * to a project_root's dir; its line is the roster's `branch` or `team/<team>/dev`; the
 * target is each repo's declared working line (RONIN_REPO). A direct repo has no team
 * line and is refused here — desks are chosen by declared arrangement, never forced.
 */

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const opt = (name: string): string | undefined => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--mode', '--repo', '--from', '--by'].includes(args[i - 1])));
const say = (l: string): void => { process.stdout.write(l + '\n'); };
const by = opt('--by') ?? process.env.RONIN_SESSION ?? process.env.USER ?? 'lead';
const mode = (opt('--mode') ?? 'full') as ByoinMode;
if (!['full', 'gates', 'ui'].includes(mode)) { say(`ronin-promote: --mode is full, gates or ui`); process.exit(2); }

/** The repo key compat matches on: the project_root name with a `ronin_`/`ronin-` prefix stripped. */
const repoKey = (root: string): string => root.replace(/^ronin[-_]/, '');

async function reposForTeam(team: string): Promise<RepoSpec[]> {
  const roster = await readTeamRoster(team);
  if (!roster) throw new Error(`no team roster '${team}'`);
  const roots = await listProjectRoots();
  const names = roster.repos.length ? roster.repos : roster.project_root ? [roster.project_root] : [];
  if (!names.length) throw new Error(`team '${team}' names no repos and no project_root`);
  const overrides = new Map(args.filter((a, i) => args[i - 1] === '--repo' && a.includes('=')).map((a) => a.split('=') as [string, string]));
  const specs: RepoSpec[] = [];
  for (const name of names) {
    const dir = overrides.get(name) ?? roots.find((r) => r.name === name)?.dir;
    if (!dir) throw new Error(`repo '${name}' is not a project_root here — pass --repo ${name}=/path`);
    const arr = await readArrangement(name, dir);
    if (arr.mode === 'direct') throw new Error(`${name} is declared direct (${arr.source}) — a direct repository has no team line to promote`);
    specs.push({ repo: repoKey(name), dir, line: roster.branch || teamLineBranch(team), target: arr.working });
  }
  return specs;
}

function report(out: { ok: boolean; message: string; receipt: { id: string; state: string } | null }): never {
  say('');
  say(`${out.ok ? '✓' : '✗'} ${out.message}${out.receipt ? ` — receipt ${out.receipt.id} (${out.receipt.state})` : ''}`);
  process.exit(out.ok ? 0 : 1);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = positional;
  if (!cmd || flag('--help')) {
    say('usage: ronin-promote <team> [--mode full|gates|ui] [--no-restart] [--dry-run] [--repo name=dir]');
    say('       ronin-promote resume|abandon|revert|bisect|receipts|show …   (bin/ronin-promote --help for the whole list)');
    process.exit(cmd ? 0 : 2);
  }
  switch (cmd) {
    case 'resume': {
      const id = rest[0]; if (!id) throw new Error('resume needs a receipt id');
      return report(await resumePromotion({ id, by, log: say, restart: !flag('--no-restart') }));
    }
    case 'abandon': {
      const id = rest[0]; if (!id) throw new Error('abandon needs a receipt id');
      return report(await abandonPromotion(id, rest.slice(1).join(' ') || 'no reason given'));
    }
    case 'revert': {
      const id = rest[0]; if (!id) throw new Error('revert needs a receipt id, or `last`');
      const r = id === 'last' ? (await listReceipts()).filter((x) => x.kind === 'team_promotion' && x.state === 'complete').pop() ?? null : await readReceipt(id);
      if (!r) throw new Error(`no receipt ${id}`);
      return report(await revertPromotion({ receipt: r, by, mode, log: say }));
    }
    case 'bisect': {
      const team = rest[0]; if (!team) throw new Error('bisect needs a team');
      const specs = await reposForTeam(team);
      const want = opt('--repo');
      const spec = want ? specs.find((s) => s.repo === repoKey(want)) : specs[0];
      if (!spec) throw new Error(`no repo '${want}' on team ${team}`);
      const b = await bisectLine({ spec, from: opt('--from'), mode, log: say });
      say('');
      say(b.culprit ? `✗ first failing hand-in: ${b.culprit} (${b.files.join(', ') || 'no files'}) — feed it to that session or reassign the desk` : `✓ every hand-in on ${spec.line} passes on its own — the failure is in their combination`);
      process.exit(b.culprit ? 1 : 0);
    }
    case 'receipts': {
      const rs = await listReceipts(rest[0]);
      if (!rs.length) say(rest[0] ? `no promotions recorded for team ${rest[0]}` : 'no promotions recorded');
      for (const r of rs) say(`${r.id}  ${r.state.padEnd(11)} ${summarize(r)}`);
      process.exit(0);
    }
    case 'show': {
      const id = rest[0]; if (!id) throw new Error('show needs a receipt id');
      const r = await readReceipt(id);
      if (!r) throw new Error(`no receipt ${id}`);
      if (flag('--pr-block')) say('```ronin-promotion-receipt\n' + JSON.stringify(r) + '\n```');
      else if (flag('--shared')) say(JSON.stringify(toChangeSet(r), null, 2));
      else say(JSON.stringify(r, null, 2));
      process.exit(0);
    }
    default: {
      const team = cmd;
      const specs = await reposForTeam(team);
      say(`team ${team}: ${specs.map((s) => `${s.repo} ${s.line} → ${s.target} (${s.dir})`).join(', ')}`);
      const out = await promoteTeam({ team, repos: specs, by, mode, restart: !flag('--no-restart'), dryRun: flag('--dry-run'), log: say });
      if (out.ok && out.receipt?.state === 'complete') {
        say('');
        say('for the dev → master pull request body, when it is time:');
        say(`  bin/ronin-promote show ${out.receipt.id} --pr-block`);
      }
      return report(out);
    }
  }
}

main().catch((e: unknown) => {
  say(`ronin-promote: ${(e as Error).message ?? e}`);
  process.exit(2);
});
