import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { tailnetIp } from '../config.js';
import { envWithoutGitLocation } from '../tegami.js';
import type { GateResult, HealthResult } from './receipts.js';

const execFileP = promisify(execFile);

/**
 * DEV IS LIVE (ruled 2026-08-28) — a successful team promotion ends by restarting the
 * service from the `dev` worktree and running the deployment health checks. BYOIN proved
 * the repo; this proves the different fact that the accepted `dev` actually came back up.
 * It is the one place the design accepts a visible failure, and the answer to it is
 * `team revert` (promote.ts), run automatically when these checks fail.
 *
 * Health is: the server answers `/api/health`; the page renders (the same smoke-ui gate
 * `libexec/ronin-gate` runs after every unit start); the readouts are sane. A machine
 * with no headless browser gets a SKIP for the render check, never a pass.
 */

export interface RestartResult { unit: string; at: string; ok: boolean; detail?: string }

/** The user unit, or the pre-2026-08-19 name on a box that has not migrated. */
export async function serviceUnit(): Promise<string> {
  try {
    await execFileP('systemctl', ['--user', 'cat', 'ronin.service'], { timeout: 5_000 });
    return 'ronin';
  } catch {
    return 'tmux-ronin';
  }
}

export async function restartService(): Promise<RestartResult> {
  const unit = await serviceUnit();
  const at = new Date().toISOString();
  try {
    await execFileP('systemctl', ['--user', 'restart', unit], { timeout: 60_000 });
    return { unit, at, ok: true };
  } catch (e) {
    return { unit, at, ok: false, detail: String((e as Error).message ?? e) };
  }
}

export interface HealthOptions {
  /** The app's URL; defaults to the restarted operator's BIND/PORT/tailnet resolution. */
  url?: string;
  /** How long to wait for `/api/health` to answer at all. */
  waitMs?: number;
  /** The checkout whose `scripts/smoke-ui.mjs` drives the render check. */
  dir: string;
}

export function defaultUrl(): string {
  const port = process.env.PORT ?? '3006';
  const host = process.env.BIND?.trim() || tailnetIp();
  return process.env.RONIN_GATE_URL ?? `http://${host}:${port}/`;
}

/** Poll until the server answers, up to `waitMs`. */
async function waitForHealth(url: string, waitMs: number): Promise<GateResult> {
  const deadline = Date.now() + waitMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const r = await fetch(new URL('api/health', url), { signal: AbortSignal.timeout(2_000) });
      if (r.ok) {
        const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        const ok = body && (body.ok === true || body.status === 'ok' || Object.keys(body).length > 0);
        return ok
          ? { name: 'api/health', status: 'ok', detail: JSON.stringify(body).slice(0, 200) }
          : { name: 'api/health', status: 'FAIL', detail: `answered but not sane: ${JSON.stringify(body).slice(0, 200)}` };
      }
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = String((e as Error).message ?? e);
    }
    await new Promise((res) => setTimeout(res, 1_000));
  }
  return { name: 'api/health', status: 'FAIL', detail: `never answered within ${Math.round(waitMs / 1000)}s — last: ${last}` };
}

/** The render check, exit-code contract as BYOIN reads it: 0 pass, 2 no browser, else broken. */
async function renderCheck(dir: string, url: string): Promise<GateResult> {
  const script = path.join(dir, 'scripts', 'smoke-ui.mjs');
  if (!(await access(script).then(() => true, () => false))) {
    return { name: 'smoke-ui', status: 'SKIP', detail: 'no scripts/smoke-ui.mjs in this checkout' };
  }
  try {
    const r = await execFileP('node', [script, url], { cwd: dir, env: envWithoutGitLocation(), timeout: 5 * 60_000, maxBuffer: 16 * 1024 * 1024 });
    const verdict = `${r.stdout}${r.stderr}`.split('\n').find((l) => /^(PASSED|FAILED)/.test(l)) ?? 'rendered';
    return { name: 'smoke-ui', status: 'ok', detail: verdict };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    if (err.code === 2) return { name: 'smoke-ui', status: 'SKIP', detail: 'NO HEADLESS BROWSER on this machine — the page has NOT been looked at' };
    return { name: 'smoke-ui', status: 'FAIL', detail: `${err.stdout ?? ''}${err.stderr ?? ''}`.trim().split('\n').slice(-8).join('\n') };
  }
}

/** The deployment health checks, as one result. A SKIP does not fail; a FAIL does. */
export async function healthCheck(opts: HealthOptions): Promise<HealthResult> {
  const url = opts.url ?? defaultUrl();
  const checks: GateResult[] = [];
  const up = await waitForHealth(url, opts.waitMs ?? 40_000);
  checks.push(up);
  if (up.status === 'ok') checks.push(await renderCheck(opts.dir, url));
  return { passed: checks.every((c) => c.status !== 'FAIL'), checks, at: new Date().toISOString() };
}

/**
 * Tell the lead. The team's wipeboard interrupts the lead by default and nobody else —
 * exactly the audience for "your promotion failed health and was reverted". Best effort:
 * a missing tool is reported in the return, never thrown, because the receipt is already
 * written and the notice is the last thing, not the important thing.
 */
export async function notifyTeam(repoDir: string, team: string, text: string): Promise<string> {
  const tool = path.join(repoDir, 'ronin_bin', 'tejun-wipeboard');
  try {
    const r = await execFileP(tool, [team, 'post', text], { env: envWithoutGitLocation(), timeout: 15_000 });
    return r.stdout.trim().split('\n')[0] ?? 'posted';
  } catch (e) {
    return `notice not delivered: ${String((e as Error).message ?? e).split('\n')[0]}`;
  }
}
