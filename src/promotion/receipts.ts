import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';
import type { ChangeSetReceipt, ChangeSetRepo, ChangeSetState } from '../desks/schema.js';

/**
 * PROMOTION RECEIPTS — the durable record of every attempt to move a repository's `dev`.
 *
 * A team promotion is the one boundary where the full repository BYOIN runs (docs/worktrees.md,
 * "Team push — the one full BYOIN"). Git cannot advance refs in two repositories at once,
 * so the receipt is what makes an interrupted coordinated promotion VISIBLE and FINISHABLE
 * rather than silently half-landed: for every repo it carries the expected old ref, the
 * candidate ref, and which advances actually happened. It is both recovery state and
 * failure attribution, and it lives in a store — never in a replaceable install file.
 *
 * ONE FILE PER RECEIPT, written temp+rename, so a reader sees a whole receipt or none.
 * The id is the filename. Nothing here is ever rewritten to look better after the fact:
 * a receipt moves forward through its states and the states it went through stay in it.
 *
 * This module owns the SHAPE and the LEDGER only. Building candidates, running BYOIN and
 * moving refs is `promote.ts`; hand-in receipts (the desk → team line record) are Fable 1's
 * and are referenced here by id, never redefined.
 */

export const PROMOTION_LEDGER_DIR = (): string => storeDir('promotion_ledger');

/** Where a promotion is in its life. Only these transitions happen (see `advanceState`). */
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

/**
 * One repository's part of a change set. Extends Fable 1's `ChangeSetRepo` (the shape the
 * roster and CI read) with what the executor needs to rebuild it: where the repo is, which
 * line and target, the line tip, and the files — attribution's raw material.
 */
export interface RepoCandidate extends ChangeSetRepo {
  /** The repository's home checkout — where `dev` is mounted and the app runs from. */
  dir: string;
  /** The line being promoted, e.g. `team/comp/dev`. */
  line: string;
  /** The target ref, e.g. `dev`. */
  target: string;
  /** The team line's tip that went into the candidate. */
  line_tip: string;
  /** Files touched between `expected_old` and `candidate`. */
  files: string[];
  /** The sessions whose hand-ins this candidate carries — from the desks ledger; empty when derived from git. */
  sessions: string[];
  /** Why this repo carries no candidate — a conflict, a dirty funnel worktree — or absent. */
  refused?: string;
  conflict_files?: string[];
}

export type GateStatus = 'ok' | 'FAIL' | 'SKIP';

export interface GateResult {
  name: string;
  status: GateStatus;
  detail?: string;
}

/** One repository's BYOIN verdict on its exact candidate. */
export interface RepoProof {
  repo: string;
  candidate: string;
  mode: 'full' | 'gates' | 'ui';
  passed: boolean;
  gates: GateResult[];
  /** The tool's own last verdict line, verbatim. */
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
  /** For `raced`: what the ref actually held when the swap was attempted. */
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
  /** Gates that failed, by name, when the stage was `proving`. */
  gates?: string[];
  /** Attribution: which files changed and which hand-ins carried them. */
  files?: string[];
  hand_in_receipts?: string[];
  sessions?: string[];
}

export interface PromotionReceipt {
  id: string;
  kind: 'team_promotion' | 'team_revert';
  team: string;
  /** Fable 1's `ChangeSetReceipt.at` — the moment the receipt was opened. */
  at: string;
  created_at: string;
  updated_at: string;
  state: PromotionState;
  /** Every state this receipt has been in, in order — the receipt never forgets. */
  history: { state: PromotionState; at: string }[];
  repos: RepoCandidate[];
  proofs: RepoProof[];
  compat?: CompatProof;
  advances: RefAdvance[];
  restart?: { unit: string; at: string; ok: boolean; detail?: string };
  health?: HealthResult;
  failure?: PromotionFailure;
  /** For a `team_revert`: the promotion it reverts. */
  revert_of?: string;
  /** Set on a promotion once a revert of it landed. */
  reverted_by?: string;
  /** Who ran it — a session name, or whatever the caller says. */
  by: string;
}

/**
 * The minimum proof that may cross the box boundary in a pull-request body.
 * Team, session, local-path, branch, hand-in, timing, and operator metadata remain
 * in the private ledger. CI needs only the candidate, its full proof, and its advance.
 */
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

/* ---------------------------------------------------------------- state machine */

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

/**
 * Move a receipt to its next state, or refuse. Refusal is a thrown error, not a silent
 * no-op: a receipt that claims `complete` after `failed` is exactly the lie this exists
 * to make impossible.
 */
export function advanceState(r: PromotionReceipt, next: PromotionState): PromotionReceipt {
  if (!TRANSITIONS[r.state].includes(next)) {
    throw new Error(`promotion ${r.id}: cannot go from '${r.state}' to '${next}'`);
  }
  const at = now();
  return { ...r, state: next, updated_at: at, history: [...r.history, { state: next, at }] };
}

/**
 * Whether this receipt BLOCKS a new promotion of the same team: a coordinated promotion
 * that moved some refs and not others must be resumed or abandoned before anything else
 * touches those lines. `advancing` counts too —
 * a process that died mid-advance leaves exactly that state behind.
 */
export const blocksTeam = (r: PromotionReceipt): boolean => r.state === 'advancing' || r.state === 'interrupted';

/** Did any ref actually move? Decides `failed` (none) versus `interrupted` (some). */
export const anyAdvanced = (r: PromotionReceipt): boolean => r.advances.some((a) => a.status === 'done');

/* ---------------------------------------------------------------- ids */

/** Sortable, unique enough: UTC stamp + team + short random. The id is the filename. */
export function newReceiptId(team: string, kind: PromotionReceipt['kind']): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${kind === 'team_revert' ? 'revert' : 'promote'}-${team}-${rnd}`;
}

export function newReceipt(input: {
  team: string;
  kind?: PromotionReceipt['kind'];
  repos: RepoCandidate[];
  by: string;
  revert_of?: string;
}): PromotionReceipt {
  const at = now();
  const kind = input.kind ?? 'team_promotion';
  return {
    id: newReceiptId(input.team, kind),
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

/* ---------------------------------------------------------------- the ledger */

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

/** Every receipt, oldest first (ids sort by time). Optionally one team's. */
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

/** The receipt that stops a new promotion for this team, if any. */
export async function blockingReceipt(team: string, dir = PROMOTION_LEDGER_DIR()): Promise<PromotionReceipt | null> {
  const all = await listReceipts(team, dir);
  return all.find(blocksTeam) ?? null;
}

/**
 * LOOK BEFORE YOU PROVE (owner, 2026-09-03). Two promotions proving on one box at once
 * trample each other — a restart from one kills the other's test children (pbs 8ft9,
 * 07:49:46) — and no lock is wanted: just look. The receipt of ANY team that is still
 * moving (preparing · proving · advancing · restarting) and was touched within `staleMs`
 * is "on the fly"; older ones are a crashed process's leftovers and block nobody.
 */
export async function inFlightReceipt(dir = PROMOTION_LEDGER_DIR(), now = Date.now(), staleMs = 20 * 60_000): Promise<PromotionReceipt | null> {
  const moving: readonly PromotionState[] = ['preparing', 'proving', 'advancing', 'restarting'];
  const all = await listReceipts(undefined, dir);
  return all.reverse().find((r) => moving.includes(r.state) && now - Date.parse(r.updated_at) < staleMs) ?? null;
}

/** The last promotion that completed for a team — `bisect` replays forward from here. */
export async function lastGoodPromotion(team: string, dir = PROMOTION_LEDGER_DIR()): Promise<PromotionReceipt | null> {
  const all = await listReceipts(team, dir);
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].state === 'complete' && all[i].kind === 'team_promotion') return all[i];
  }
  return null;
}

/* ---------------------------------------------------------------- the shared shape */

/**
 * The receipt as Fable 1's `ChangeSetReceipt` — what the roster and CI read. The executor's
 * finer states fold into the five shared ones; a `failed` promotion never moved a ref, so
 * it is `abandoned` in the shared vocabulary (nothing to recover). `advanced_to` is filled
 * from the advances actually done.
 */
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

/* ---------------------------------------------------------------- the one-line readout */

/** What the roster or a DM says about a receipt: `landing: cowork done, services pending`. */
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
