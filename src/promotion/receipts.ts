import { mkdir, open, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';
import type { ChangeSetReceipt, ChangeSetRepo, ChangeSetState } from '../desks/schema.js';

export const PROMOTION_LEDGER_DIR = (): string => storeDir('promotion_ledger');
const LOCK_NAME = '.box-promotion-lock';
export const PROMOTION_IN_FLIGHT_MS = 20 * 60_000;

export interface PromotionLock { id: string; team: string; at: string }

export class PromotionBusy extends Error {
  constructor(public readonly lock: PromotionLock, public readonly state: PromotionState) {
    super(`BUSY: ${lock.team}'s ${lock.id} is ${state}`);
  }
}

export async function acquirePromotionLock(lock: PromotionLock, dir = PROMOTION_LEDGER_DIR(), log: (line: string) => void = () => undefined, staleMs = PROMOTION_IN_FLIGHT_MS): Promise<void> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, LOCK_NAME);
  for (;;) {
    try {
      const handle = await open(file, 'wx');
      await handle.writeFile(JSON.stringify(lock) + '\n');
      await handle.close();
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    let held: PromotionLock | null = null;
    try { held = JSON.parse(await readFile(file, 'utf8')) as PromotionLock; } catch { /* retried below */ }
    if (held?.id === lock.id) return;
    const age = held ? Date.now() - Date.parse(held.at) : staleMs + 1;
    if (!held || !Number.isFinite(age) || age > staleMs) {
      log(`reclaiming stale promotion lock${held ? `: ${held.team}'s ${held.id} exceeded the in-flight window` : ': unreadable owner'}`);
      await unlink(file).catch(() => undefined);
      continue;
    }
    const receipt = await readReceipt(held.id, dir);
    const state = receipt?.state ?? 'preparing';
    throw new PromotionBusy(held, state);
  }
}

export async function releasePromotionLock(id: string, dir = PROMOTION_LEDGER_DIR()): Promise<void> {
  const file = path.join(dir, LOCK_NAME);
  try {
    const held = JSON.parse(await readFile(file, 'utf8')) as PromotionLock;
    if (held.id === id) await unlink(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

export type PromotionState =
  | 'preparing'   // candidates being built; nothing proved, nothing moved
  | 'proving'     // full BYOIN + compatibility running on the candidates
  | 'advancing'   // refs moving in receipt order — an interruption here is the case the receipt exists for
  | 'restarting'  // every ref moved; the live app is being restarted and health-checked
  | 'complete'    // done; `dev` carries this receipt for its exact SHA
  | 'failed'      // stopped BEFORE any ref moved — dev untouched, gates named below
  | 'interrupted' // stopped AFTER at least one ref moved — needs `resume` or `abandon`
  | 'reverted'    // health failed after restart; a revert receipt (`revert_of` = this) landed
  | 'unhealthy'   // every ref moved, the app restarted, health failed and no revert landed — the lead is told
  | 'abandoned';  // an interrupted receipt the lead explicitly gave up on

export interface RepoCandidate extends ChangeSetRepo {
  dir: string;
  line: string;
  target: string;
  line_tip: string;
  files: string[];
  sessions: string[];
  refused?: string;
  conflict_files?: string[];
}

export type GateStatus = 'ok' | 'FAIL' | 'SKIP';

export interface GateResult {
  name: string;
  status: GateStatus;
  detail?: string;
}

export interface RepoProof {
  repo: string;
  candidate: string;
  mode: 'full' | 'gates' | 'ui';
  passed: boolean;
  gates: GateResult[];
  verdict: string;
}

export interface CompatProof {
  passed: boolean;
  checks: GateResult[];
}

export type AdvanceStatus = 'pending' | 'done' | 'raced' | 'skipped';

export interface RefAdvance {
  repo: string;
  target: string;
  from: string;
  to: string;
  status: AdvanceStatus;
  at?: string;
  found?: string;
}

export interface HealthResult {
  passed: boolean;
  checks: GateResult[];
  at: string;
}

export interface PromotionFailure {
  stage: PromotionState;
  message: string;
  gates?: string[];
  files?: string[];
  hand_in_receipts?: string[];
  sessions?: string[];
}

export interface PromotionReceipt {
  id: string;
  kind: 'team_promotion' | 'team_revert';
  team: string;
  at: string;
  created_at: string;
  updated_at: string;
  state: PromotionState;
  history: { state: PromotionState; at: string }[];
  repos: RepoCandidate[];
  proofs: RepoProof[];
  compat?: CompatProof;
  advances: RefAdvance[];
  restart?: { unit: string; at: string; ok: boolean; detail?: string };
  health?: HealthResult;
  failure?: PromotionFailure;
  revert_of?: string;
  reverted_by?: string;
  by: string;
}

export function publicPromotionReceipt(r: PromotionReceipt): object {
  const publicRepoName = (repo: string): string => repo.replace(/^ronin_/, '');
  return {
    id: `promotion-${r.repos[0]?.candidate.slice(0, 12) || 'pending'}`,
    kind: r.kind,
    state: r.state,
    repos: r.repos.map(({ repo, candidate }) => ({ repo: publicRepoName(repo), candidate })),
    proofs: r.proofs.map(({ repo, candidate, mode, passed, gates, verdict }) => ({ repo: publicRepoName(repo), candidate, mode, passed, gates, verdict })),
    advances: r.advances.map(({ repo, to, status }) => ({ repo: publicRepoName(repo), to, status })),
    ...(r.reverted_by ? { reverted_by: 'yes' } : {}),
  };
}

const TRANSITIONS: Record<PromotionState, readonly PromotionState[]> = {
  preparing: ['proving', 'failed'],
  proving: ['advancing', 'failed'],
  advancing: ['restarting', 'complete', 'interrupted'],
  restarting: ['complete', 'reverted', 'unhealthy'],
  complete: ['reverted'],
  failed: [],
  interrupted: ['advancing', 'abandoned'],
  reverted: [],
  unhealthy: [],
  abandoned: [],
};

export const now = (): string => new Date().toISOString();

export function advanceState(r: PromotionReceipt, next: PromotionState): PromotionReceipt {
  if (!TRANSITIONS[r.state].includes(next)) {
    throw new Error(`promotion ${r.id}: cannot go from '${r.state}' to '${next}'`);
  }
  const at = now();
  return { ...r, state: next, updated_at: at, history: [...r.history, { state: next, at }] };
}

export const blocksTeam = (r: PromotionReceipt): boolean => r.state === 'advancing' || r.state === 'interrupted';

export const anyAdvanced = (r: PromotionReceipt): boolean => r.advances.some((a) => a.status === 'done');

export function newReceiptId(team: string, kind: PromotionReceipt['kind']): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${kind === 'team_revert' ? 'revert' : 'promote'}-${team}-${rnd}`;
}

export function newReceipt(input: {
  id?: string;
  team: string;
  kind?: PromotionReceipt['kind'];
  repos: RepoCandidate[];
  by: string;
  revert_of?: string;
}): PromotionReceipt {
  const at = now();
  const kind = input.kind ?? 'team_promotion';
  return {
    id: input.id ?? newReceiptId(input.team, kind),
    kind,
    team: input.team,
    at,
    created_at: at,
    updated_at: at,
    state: 'preparing',
    history: [{ state: 'preparing', at }],
    repos: input.repos,
    proofs: [],
    advances: [],
    by: input.by,
    ...(input.revert_of ? { revert_of: input.revert_of } : {}),
  };
}

const receiptFile = (id: string, dir = PROMOTION_LEDGER_DIR()): string => path.join(dir, `${id}.json`);

export async function writeReceipt(r: PromotionReceipt, dir = PROMOTION_LEDGER_DIR()): Promise<void> {
  await mkdir(dir, { recursive: true });
  const file = receiptFile(r.id, dir);
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(r, null, 2) + '\n');
  await rename(tmp, file);
}

export async function readReceipt(id: string, dir = PROMOTION_LEDGER_DIR()): Promise<PromotionReceipt | null> {
  try {
    return JSON.parse(await readFile(receiptFile(id, dir), 'utf8')) as PromotionReceipt;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export async function listReceipts(team?: string, dir = PROMOTION_LEDGER_DIR()): Promise<PromotionReceipt[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const out: PromotionReceipt[] = [];
  for (const n of names) {
    const r = await readReceipt(n.slice(0, -'.json'.length), dir);
    if (r && (!team || r.team === team)) out.push(r);
  }
  return out;
}

export async function blockingReceipt(team: string, dir = PROMOTION_LEDGER_DIR()): Promise<PromotionReceipt | null> {
  const all = await listReceipts(team, dir);
  return all.find(blocksTeam) ?? null;
}

export async function inFlightReceipt(dir = PROMOTION_LEDGER_DIR(), now = Date.now(), staleMs = 20 * 60_000): Promise<PromotionReceipt | null> {
  const moving: readonly PromotionState[] = ['preparing', 'proving', 'advancing', 'restarting'];
  const all = await listReceipts(undefined, dir);
  return all.reverse().find((r) => moving.includes(r.state) && now - Date.parse(r.updated_at) < staleMs) ?? null;
}

export async function lastGoodPromotion(team: string, dir = PROMOTION_LEDGER_DIR()): Promise<PromotionReceipt | null> {
  const all = await listReceipts(team, dir);
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].state === 'complete' && all[i].kind === 'team_promotion') return all[i];
  }
  return null;
}

export function toChangeSet(r: PromotionReceipt): ChangeSetReceipt {
  const shared: Record<PromotionState, ChangeSetState> = {
    preparing: 'prepared',
    proving: 'prepared',
    advancing: 'advancing',
    restarting: 'advancing',
    complete: 'complete',
    failed: 'abandoned',
    interrupted: 'interrupted',
    reverted: 'complete',
    unhealthy: 'complete',
    abandoned: 'abandoned',
  };
  const done = new Map(r.advances.filter((a) => a.status === 'done').map((a) => [a.repo, a.to]));
  return {
    id: r.id,
    at: r.at,
    team: r.team,
    state: shared[r.state],
    repos: r.repos.map((x) => ({
      repo: x.repo,
      expected_old: x.expected_old,
      candidate: x.candidate,
      hand_in_receipts: x.hand_in_receipts,
      advanced_to: done.get(x.repo) ?? '',
    })),
  };
}

export function summarize(r: PromotionReceipt): string {
  const parts = r.advances.map((a) => `${a.repo} ${a.status}`);
  switch (r.state) {
    case 'complete':
      return `complete — ${r.repos.map((x) => `${x.repo}@${x.candidate.slice(0, 7)}`).join(', ')}`;
    case 'failed':
      return `failed at ${r.failure?.stage ?? '?'} — ${r.failure?.message ?? ''}`;
    case 'interrupted':
    case 'advancing':
      return `landing: ${parts.join(', ')}`;
    case 'reverted':
      return `reverted by ${r.reverted_by ?? '?'}`;
    case 'unhealthy':
      return `unhealthy — refs moved, health failed, no revert landed`;
    default:
      return r.state;
  }
}
