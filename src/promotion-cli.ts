import 'dotenv/config';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { listProjectRoots } from './project-roots.js';
import { readTeamRoster } from './team-rosters.js';
import { readArrangement } from './desks/arrangement.js';
import { teamLineBranch } from './desks/schema.js';
import { acceptedLinesForTeam } from './desks/receipts.js';
import { isAncestor, revParse } from './desks/git.js';
import { unpromotedAcceptedLines } from './promotion/discovery.js';
import { abandonPromotion, bisectLine, promoteTeam, resumePromotion, revertPromotion } from './promotion/promote.js';
import { lastGoodPromotion, listReceipts, publicPromotionReceipt, readReceipt, summarize, toChangeSet } from './promotion/receipts.js';
import { openPullRequest } from './promotion/pr.js';
import type { RepoSpec } from './promotion/candidate.js';
import type { ByoinMode } from './promotion/byoin.js';
import { clearFunnel, diagnoseFunnel, listFunnelReceipts, preserveFunnel, readFunnelReceipt } from './promotion/funnel-recovery.js';
import { storeDir } from './stores.js';

/**
 * ronin-promote — the lead's door from a team line into `dev`. `bin/ronin-promote` is the
 * bash face; this is the whole of it.
 *
 *   ronin-promote <team> [--mode full|gates|ui] [--no-restart] [--dry-run] [--anyway] [--repo name=dir …]
 *     BUSY when another team's promotion is on the fly: wait, then run again. --anyway proves regardless.
 *   ronin-promote resume <receipt-id> [--no-restart]
 *   ronin-promote abandon <receipt-id> <reason…>
 *   ronin-promote revert <receipt-id|last> [--mode …]
 *   ronin-promote bisect <team> [--repo name] [--from <sha>] [--mode …]
 *   ronin-promote receipts [team]
 *   ronin-promote show <receipt-id> [--pr-block | --shared]
 *
 * A team's repos are its birth defaults plus every repository with an accepted hand-in
 * for that team. Each resolves to a project_root's dir; its line comes from the accepted
 * ledger when present, otherwise the roster's `branch` or `team/<team>/dev`; the
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

async function reposForTeam(team: string): Promise<RepoSpec[]> {
  const roster = await readTeamRoster(team);
  if (!roster) throw new Error(await missingRosterMessage(team));
  const roots = await listProjectRoots();
  const defaults = roster.repos.length ? roster.repos : roster.project_root ? [roster.project_root] : [];
  const overrides = new Map(args.filter((a, i) => args[i - 1] === '--repo' && a.includes('=')).map((a) => a.split('=') as [string, string]));
  const accepted = await unpromotedAcceptedLines(await acceptedLinesForTeam(team), async ({ repo, line }) => {
    const dir = overrides.get(repo) ?? roots.find((root) => root.name === repo)?.dir;
    if (!dir) return false;
    const arr = await readArrangement(repo, dir).catch(() => null);
    if (!arr || arr.mode === 'direct') return false;
    const [lineTip, targetTip] = await Promise.all([revParse(dir, line), revParse(dir, arr.working)]);
    return !!lineTip && !!targetTip && !(await isAncestor(dir, lineTip, targetTip));
  });
  const acceptedByRepo = new Map<string, string>();
  for (const row of accepted) {
    const prior = acceptedByRepo.get(row.repo);
    if (prior && prior !== row.line) throw new Error(`team '${team}' has accepted hand-ins for ${row.repo} on more than one line (${prior}, ${row.line})`);
    acceptedByRepo.set(row.repo, row.line);
  }
  const names = [...new Set([...defaults, ...accepted.map((row) => row.repo)])];
  if (!names.length) throw new Error(`team '${team}' has no default repos and no accepted hand-ins`);
  const specs: RepoSpec[] = [];
  for (const name of names) {
    const dir = overrides.get(name) ?? roots.find((r) => r.name === name)?.dir;
    if (!dir) throw new Error(`repo '${name}' is not a project_root here — pass --repo ${name}=/path`);
    const arr = await readArrangement(name, dir);
    if (arr.mode === 'direct') throw new Error(`${name} is declared direct (${arr.source}) — a direct repository has no team line to promote`);
    specs.push({ repo: name, dir, line: acceptedByRepo.get(name) || roster.branch || teamLineBranch(team), target: arr.working });
  }
  return specs;
}

async function missingRosterMessage(team: string): Promise<string> {
  const install = path.dirname(fileURLToPath(import.meta.url));
  const ownerUid = (await stat(install)).uid;
  const currentUid = process.getuid?.();
  if (currentUid !== undefined && currentUid !== ownerUid) {
    const passwd = await readFile('/etc/passwd', 'utf8').catch(() => '');
    const owner = passwd.split('\n').find((row) => Number(row.split(':')[2]) === ownerUid)?.split(':')[0] ?? `uid ${ownerUid}`;
    return `wrong-user store: running as ${process.env.USER ?? `uid ${currentUid}`} (uid ${currentUid}), but this Ronin install belongs to ${owner}; looked for '${team}' in ${storeDir('team_rosters')}. Run the Agent/tool as the owning user so it resolves that user's Ronin stores`;
  }
  return `no team roster '${team}' in ${storeDir('team_rosters')}`;
}

function printFunnel(r: Awaited<ReturnType<typeof diagnoseFunnel>>): void {
  say(`${r.id}  ${r.state}  ${r.repo} ${r.line} → ${r.target}`);
  for (const p of r.paths) say(`  ${p.status} ${p.path}: ${p.classification}${p.identical_refs.length ? ` (${p.identical_refs.join(', ')})` : ''}${p.overlaps_candidate ? ' — overlaps candidate' : ''}`);
  if (r.whole_set_refs.length) say(`  complete copy already on: ${r.whole_set_refs.join(', ')}`);
  if (r.conflict_files.length) say(`  conflicts with candidate: ${r.conflict_files.join(', ')}`);
  if (r.recovery_ref) say(`  recovery branch: ${r.recovery_ref}@${r.recovery_commit?.slice(0, 12)}`);
}

function report(out: { ok: boolean; message: string; receipt: { id: string; state: string } | null }): never {
  say('');
  say(`${out.ok ? '✓' : 'WARNING:'} ${out.message}${out.receipt ? ` — receipt ${out.receipt.id} (${out.receipt.state})` : ''}`);
  process.exit(0);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = positional;
  if (!cmd || flag('--help')) {
    say('usage: ronin-promote <team> [--mode full|gates|ui] [--no-restart] [--dry-run] [--anyway] [--repo name=dir]');
    say('       ronin-promote pr <team>          open or update the dev → master PR from the last complete receipt');
    say('       ronin-promote funnel diagnose <team> [--repo name] | show|preserve|clear <receipt-id>');
    say('       ronin-promote resume|abandon|revert|bisect|receipts|show …   (bin/ronin-promote --help for the whole list)');
    process.exit(cmd ? 0 : 2);
  }
  switch (cmd) {
    case 'funnel': {
      const action = rest[0];
      if (action === 'diagnose') {
        const team = rest[1]; if (!team) throw new Error('funnel diagnose needs a team');
        const specs = await reposForTeam(team);
        const want = opt('--repo')?.split('=', 1)[0];
        const selected = want ? specs.filter((s) => s.repo === want) : specs;
        if (!selected.length) throw new Error(`no repo '${want}' on team ${team}`);
        for (const spec of selected) printFunnel(await diagnoseFunnel(spec, by));
        process.exit(0);
      }
      if (action === 'list') {
        for (const r of await listFunnelReceipts()) printFunnel(r);
        process.exit(0);
      }
      const receiptId = rest[1]; if (!receiptId) throw new Error(`funnel ${action ?? ''} needs a receipt id`);
      if (action === 'show') {
        const r = await readFunnelReceipt(receiptId); if (!r) throw new Error(`no funnel recovery receipt ${receiptId}`);
        printFunnel(r); process.exit(0);
      }
      if (action === 'preserve') { const r = await preserveFunnel(receiptId); printFunnel(r); process.exit(r.state === 'preserved' ? 0 : 1); }
      if (action === 'clear') { const r = await clearFunnel(receiptId); printFunnel(r); process.exit(r.state === 'clean' ? 0 : 1); }
      throw new Error('funnel action is diagnose, list, show, preserve, or clear');
    }
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
      const spec = want ? specs.find((s) => s.repo === want) : specs[0];
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
    case 'pr': {
      // The release PR, from the ledger — the open-pr action, mechanically. Owner,
      // 2026-08-28: agents do not assemble gh commands or paste receipt blocks by hand.
      const team = rest[0]; if (!team) throw new Error('pr needs a team');
      const specs = await reposForTeam(team);
      const receipt = await lastGoodPromotion(team);
      if (!receipt) throw new Error(`team ${team} has no complete promotion to open a PR for — promote first`);
      let worst = 0;
      for (const spec of specs) {
        const arr = await readArrangement(spec.repo, spec.dir);
        try {
          const o = await openPullRequest({ repo: spec.repo, dir: spec.dir, working: arr.working, stable: arr.stable, receipt }, { log: say });
          say(`✓ ${spec.repo}: PR ${o.action} — ${o.url}  (${arr.working}@${o.head.slice(0, 12)} → ${arr.stable}; receipt ${receipt.id}). Merging is the owner's hand.`);
        } catch (e) {
          worst = 1;
          say(`✗ ${spec.repo}: ${(e as Error).message}`);
        }
      }
      process.exit(worst);
    }
    case 'show': {
      const id = rest[0]; if (!id) throw new Error('show needs a receipt id');
      const r = await readReceipt(id);
      if (!r) throw new Error(`no receipt ${id}`);
      if (flag('--pr-block')) say('```ronin-promotion-receipt\n' + JSON.stringify(publicPromotionReceipt(r)) + '\n```');
      else if (flag('--shared')) say(JSON.stringify(toChangeSet(r), null, 2));
      else say(JSON.stringify(r, null, 2));
      process.exit(0);
    }
    default: {
      const team = cmd;
      const specs = await reposForTeam(team);
      say(`team ${team}: ${specs.map((s) => `${s.repo} ${s.line} → ${s.target} (${s.dir})`).join(', ')}`);
      const out = await promoteTeam({ team, repos: specs, by, mode, restart: !flag('--no-restart'), dryRun: flag('--dry-run'), anyway: flag('--anyway'), log: say });
      if (out.ok && out.receipt?.state === 'complete') {
        say('');
        say('to open the dev → master pull request from this receipt, when it is time:');
        say(`  bin/ronin-promote pr ${team}`);
      }
      return report(out);
    }
  }
}

main().catch((e: unknown) => {
  say(`ronin-promote: ${(e as Error).message ?? e}`);
  process.exit(2);
});
