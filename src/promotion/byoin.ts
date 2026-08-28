import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { envWithoutGitLocation } from '../tegami.js';
import type { CompatProof, GateResult, RepoProof } from './receipts.js';

const execFileP = promisify(execFile);

/**
 * BYOIN AT THE PROMOTION BOUNDARY — the one full repository check, run in the candidate.
 *
 * The schedule (WORKTREES.md, "What runs where"): nothing at save or commit, mechanical
 * admission at hand-in, and the FULL repository BYOIN exactly once, here, on the exact
 * commit that would become `dev`. `dev → master` consumes the receipt this produces.
 *
 * The runner does not know the gate list — `bin/ronin-byoin` reads it from package.json
 * and this reads the verdict lines BYOIN prints (`  ok  ` / `  FAIL  ` / `  SKIP  `). A
 * repository with no BYOIN of its own is not silently passed: it is a SKIP with its
 * reason, and the promotion decides what a SKIP means (for `services`, the combined
 * compatibility protocol is its proof).
 */

export type ByoinMode = 'full' | 'gates' | 'ui';

const exists = (p: string): Promise<boolean> => access(p).then(() => true, () => false);

/** BYOIN's own lines, parsed. Anything not in the three shapes is ignored. */
export function parseByoinOutput(out: string): { gates: GateResult[]; verdict: string } {
  const gates: GateResult[] = [];
  let verdict = '';
  for (const raw of out.split('\n')) {
    const m = raw.match(/^\s{2}(ok|FAIL|SKIP)\s{2,}(.*)$/);
    if (m) {
      const [name, ...rest] = m[2].split(' — ');
      gates.push({ name: name.trim(), status: m[1] as GateResult['status'], ...(rest.length ? { detail: rest.join(' — ').trim() } : {}) });
      continue;
    }
    if (/^BYOIN:/.test(raw)) verdict = raw.trim();
  }
  return { gates, verdict };
}

export interface RunOptions {
  timeoutMs?: number;
  /** Stream BYOIN's output as it runs. */
  onLine?: (line: string) => void;
}

/**
 * Run the repository's own BYOIN in `cdir`. Exit status is the verdict; the parsed lines
 * are the evidence. A repo without `bin/ronin-byoin` gets one SKIP naming that.
 */
export async function runByoin(repo: string, candidate: string, cdir: string, mode: ByoinMode, opts: RunOptions = {}): Promise<RepoProof> {
  const tool = path.join(cdir, 'bin', 'ronin-byoin');
  if (!(await exists(tool))) {
    return {
      repo,
      candidate,
      mode,
      passed: false,
      gates: [{ name: 'byoin', status: 'SKIP', detail: 'this repository has no bin/ronin-byoin — proven only through the combined compatibility protocol' }],
      verdict: 'BYOIN: not present in this repository',
    };
  }
  const args = mode === 'full' ? [] : [`--${mode}`];
  const r = await run(tool, args, cdir, opts);
  const { gates, verdict } = parseByoinOutput(r.out);
  return { repo, candidate, mode, passed: r.code === 0, gates, verdict: verdict || (r.code === 0 ? 'BYOIN: exit 0' : `BYOIN: exit ${r.code}`) };
}

async function run(cmd: string, args: string[], cwd: string, opts: RunOptions): Promise<{ code: number; out: string }> {
  try {
    const r = await execFileP(cmd, args, {
      cwd,
      env: { ...envWithoutGitLocation(), BIND: process.env.BIND ?? '127.0.0.1' },
      timeout: opts.timeoutMs ?? 20 * 60_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    const out = `${r.stdout}${r.stderr}`;
    opts.onLine?.(out);
    return { code: 0, out };
  } catch (e) {
    const err = e as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}` || String(err.message ?? '');
    opts.onLine?.(out);
    return { code: typeof err.code === 'number' ? err.code : 1, out };
  }
}

/* ---------------------------------------------------------------- the combined protocol */

export interface CompatInput {
  repo: string;
  cdir: string;
}

/**
 * The cross-repo compatibility gate — `cowork` and `services` can each pass alone while
 * the installed pair fails; this is where that is caught, before either `dev` moves.
 *
 * Concretely, for the two repos that exist today:
 *   1. `CONTRACT_V` must agree between cowork's `src/sockets-contract.ts` and services'
 *      `sockets-contract.ts` — the contract's own rule: a bump lands in both repos in
 *      the same breath.
 *   2. services' `bin/dev-sync` mirrors the services candidate INTO the cowork candidate
 *      (`src/services/`, gitignored there), then cowork's seam gate and typecheck run
 *      across the assembled pair.
 *
 * With one repo, or repos this knows nothing about, the protocol has nothing to say and
 * says so as a SKIP — never an `ok` it did not earn.
 */
export async function runCompat(inputs: CompatInput[], opts: RunOptions = {}): Promise<CompatProof> {
  const checks: GateResult[] = [];
  const cowork = inputs.find((i) => i.repo === 'cowork' || (i.repo !== 'services' && inputs.length === 1));
  const services = inputs.find((i) => i.repo === 'services');
  if (!cowork || !services) {
    checks.push({ name: 'compat', status: 'SKIP', detail: `nothing cross-repo to check for ${inputs.map((i) => i.repo).join(' + ') || 'no repos'}` });
    return { passed: true, checks };
  }

  const cv = await contractVersion(path.join(cowork.cdir, 'src', 'sockets-contract.ts'));
  const sv = await contractVersion(path.join(services.cdir, 'sockets-contract.ts'));
  if (cv === null || sv === null) {
    checks.push({ name: 'contract_v', status: 'FAIL', detail: `CONTRACT_V unreadable — cowork ${cv ?? '?'}, services ${sv ?? '?'}` });
  } else if (cv !== sv) {
    checks.push({ name: 'contract_v', status: 'FAIL', detail: `CONTRACT_V differs — cowork ${cv}, services ${sv}: a bump lands in both repos in the same breath` });
  } else {
    checks.push({ name: 'contract_v', status: 'ok', detail: `CONTRACT_V ${cv} in both` });
  }

  const sync = path.join(services.cdir, 'bin', 'dev-sync');
  if (!(await exists(sync))) {
    checks.push({ name: 'dev-sync', status: 'SKIP', detail: 'services candidate has no bin/dev-sync — the pair was not assembled' });
  } else {
    const r = await run(sync, [cowork.cdir], services.cdir, opts);
    checks.push({ name: 'dev-sync', status: r.code === 0 ? 'ok' : 'FAIL', detail: r.out.trim().split('\n').pop() ?? '' });
    if (r.code === 0) {
      for (const [name, cmd, args] of [
        ['kyokai — the seam, across the assembled pair', 'node', ['scripts/check-kyokai.mjs']],
        ['tsc — the assembled pair typechecks', 'npx', ['tsc', '--noEmit']],
      ] as const) {
        const g = await run(cmd, [...args], cowork.cdir, opts);
        checks.push({ name, status: g.code === 0 ? 'ok' : 'FAIL', ...(g.code === 0 ? {} : { detail: g.out.trim().split('\n').slice(-12).join('\n') }) });
      }
    }
  }
  return { passed: checks.every((c) => c.status !== 'FAIL'), checks };
}

async function contractVersion(file: string): Promise<number | null> {
  const text = await readFile(file, 'utf8').catch(() => '');
  const m = text.match(/export\s+const\s+CONTRACT_V\s*=\s*(\d+)/);
  return m ? Number(m[1]) : null;
}
