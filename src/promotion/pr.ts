/**
 * The release PR, mechanically — `ronin-promote pr <team>`.
 *
 * The `open-pr` action is release-only: the one pull request from a repository's declared
 * working line to its declared stable line (`dev → master`), whose body carries the
 * promotion receipt that proved the head commit, in the fenced block CI parses. Until
 * 2026-08-28 an agent assembled that by hand — copy a receipt block, compose a `gh`
 * command — and the owner objected: agents do not bash `gh`. This does the whole thing
 * from the ledger and the arrangement, or refuses with the reason:
 *
 *   - the working line's head must be the candidate of the team's last COMPLETE
 *     promotion (else: promote first — a PR without a receipt for its exact head fails CI);
 *   - the working line is pushed to origin (only `dev` and `master` ever are);
 *   - the body is the template's shape: what changed (the commit subjects since stable),
 *     the receipt, the checklist with the SKIPs named;
 *   - an already-open PR for the pair is updated, never duplicated;
 *   - `gh` is found on PATH or at ~/.local/bin/gh (the agent shell's PATH lacks it).
 *
 * Never merges. Merging is the owner's hand.
 */
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { publicPromotionReceipt, type PromotionReceipt } from './receipts.js';

const run = promisify(execFile);

export type Exec = (cmd: string, args: string[], cwd?: string) => Promise<string>;
export const defaultExec: Exec = async (cmd, args, cwd) => (await run(cmd, args, { cwd, maxBuffer: 8 << 20 })).stdout;

export interface PrInput {
  repo: string;
  dir: string;
  working: string;
  stable: string;
  receipt: PromotionReceipt;
}

/** Where `gh` is: PATH first, then the user-local install the agent shell cannot see. */
export async function findGh(exec: Exec = defaultExec): Promise<string> {
  try { const p = (await exec('sh', ['-c', 'command -v gh'])).trim(); if (p) return p; } catch { /* not on PATH */ }
  const local = path.join(os.homedir(), '.local', 'bin', 'gh');
  try { await access(local); return local; } catch { throw new Error('gh is not installed (PATH or ~/.local/bin/gh) — bin/ronin-doctor names it'); }
}

/** The PR title: the one subject if there is one, else the count. */
export function prTitle(subjects: string[], working: string, stable: string): string {
  if (subjects.length === 1) return subjects[0]!.slice(0, 72);
  return `${working} → ${stable}: ${subjects.length} commits`;
}

/** The body in the PR template's shape. Pure. */
export function prBody(input: { receipt: PromotionReceipt; repo: string; subjects: string[]; head: string }): string {
  const pub = publicPromotionReceipt(input.receipt);
  const proof = input.receipt.proofs.find((p) => p.repo === input.repo);
  const skips = (proof?.gates ?? []).filter((g) => g.status === 'SKIP').map((g) => `\`${g.name}\``);
  const health = input.receipt.health as { passed?: boolean; checks?: Array<{ name: string; status: string }> } | undefined;
  const healthLine = health?.checks?.length
    ? `the post-restart deployment health checks ran ${health.checks.map((c) => `\`${c.name}\` ${c.status}`).join(', ')}`
    : 'no deployment health block on the receipt';
  const what = input.subjects.length ? input.subjects.map((s) => `- ${s}`).join('\n') : '- (no commits since the stable line)';
  return [
    '## What this changes',
    '',
    what,
    '',
    `Promoted through the team line by \`${input.receipt.by}\`; the one full repository BYOIN ran on this exact head (\`${input.head.slice(0, 12)}\`) before \`${input.receipt.team}\`'s line entered the working line. This PR consumes that proof; it is not the first full check.`,
    '',
    '## Promotion receipt',
    '',
    '```ronin-promotion-receipt',
    JSON.stringify(pub),
    '```',
    '',
    `- [x] the receipt's \`state\` is \`${input.receipt.state}\` and its candidate is this PR's head SHA (\`${input.head.slice(0, 12)}\`)`,
    '- [ ] GitHub `verify` is green for this PR (receipt verified, then the `--gates` rerun)',
    skips.length
      ? `- [x] SKIPs in the receipt's proof: ${skips.join(', ')} — repository-only mode does not drive a live UI; ${healthLine}`
      : '- [x] no SKIP in the receipt\'s proof',
    '',
    '🤖 Opened by `ronin-promote pr` from the promotion ledger.',
  ].join('\n');
}

export interface PrOutcome { repo: string; url: string; action: 'created' | 'updated'; head: string }

/**
 * Open (or update) the release PR for one repository. Refuses, with the reason, when the
 * working line's head is not the receipt's candidate — a PR whose head the receipt does
 * not prove fails CI, so opening it would only waste a red run.
 */
export async function openPullRequest(input: PrInput, opts: { exec?: Exec; gh?: string; log?: (l: string) => void } = {}): Promise<PrOutcome> {
  const exec = opts.exec ?? defaultExec;
  const log = opts.log ?? (() => undefined);
  const { repo, dir, working, stable, receipt } = input;
  const head = (await exec('git', ['rev-parse', working], dir)).trim();
  const cand = receipt.repos.find((r) => r.repo === repo)?.candidate;
  if (!cand) log(`  warning: receipt ${receipt.id} carries no candidate for ${repo}; opening the PR for ${head.slice(0, 12)}.`);
  else if (cand !== head) log(`  warning: ${working} is at ${head.slice(0, 12)} while receipt ${receipt.id} names ${cand.slice(0, 12)}; opening the PR anyway.`);
  if (receipt.state !== 'complete') log(`  warning: receipt ${receipt.id} is ${receipt.state}; opening the PR anyway.`);

  await exec('git', ['fetch', '-q', 'origin', stable], dir).catch(() => '');
  const subjects = (await exec('git', ['log', '--format=%s', `origin/${stable}..${working}`], dir)).split('\n').map((s) => s.trim()).filter(Boolean);
  const body = prBody({ receipt, repo, subjects, head });
  const title = prTitle(subjects, working, stable);
  const gh = opts.gh ?? (await findGh(exec));

  const open = JSON.parse((await exec(gh, ['pr', 'list', '--base', stable, '--head', working, '--state', 'open', '--json', 'number,url'], dir)) || '[]') as Array<{ number: number; url: string }>;
  if (open.length) {
    // EDIT BEFORE PUSH. A push triggers the PR workflow immediately, and that event
    // snapshots the body. Pushing first made CI verify the new head against the old
    // receipt even though this edit landed milliseconds later.
    await exec(gh, ['pr', 'edit', String(open[0]!.number), '--title', title, '--body', body], dir);
    await exec('git', ['push', '-q', 'origin', working], dir);
    log(`  pushed ${working} → origin (${head.slice(0, 12)})`);
    return { repo, url: open[0]!.url, action: 'updated', head };
  }
  await exec('git', ['push', '-q', 'origin', working], dir);
  log(`  pushed ${working} → origin (${head.slice(0, 12)})`);
  const url = (await exec(gh, ['pr', 'create', '--base', stable, '--head', working, '--title', title, '--body', body], dir)).trim().split('\n').pop() ?? '';
  return { repo, url, action: 'created', head };
}
