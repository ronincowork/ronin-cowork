import { AUTOMATION_IDENTITY, git, gitOut, revParse } from '../desks/git.js';
import { advanceTarget, candidateDir, ledgerHandIns, prepareCandidate, resetCandidate, targetAt, type HandInSource, type RepoSpec } from './candidate.js';
import { healthCheck, notifyTeam, restartService } from './health.js';
import { queuePromotionContinuation } from './continuation.js';
import {
  acquirePromotionLock, advanceState, anyAdvanced, lastGoodPromotion, listReceipts, newReceipt, newReceiptId, now, readReceipt, releasePromotionLock, writeReceipt, PROMOTION_LEDGER_DIR,
  type HealthResult, type PromotionReceipt, type RefAdvance, type RepoCandidate,
} from './receipts.js';

export type ByoinMode = 'full' | 'gates' | 'ui';

export interface Effects {
  restart: () => Promise<PromotionReceipt['restart']>;
  health: (primaryDir: string) => Promise<HealthResult>;
  notify: (primaryDir: string, team: string, text: string) => Promise<string>;
  handInsFor: HandInSource;
  beforeAdvance?: (repo: string, index: number) => Promise<void>;
}

export const realEffects: Effects = {
  restart: restartService,
  health: (dir) => healthCheck({ dir }),
  notify: notifyTeam,
  handInsFor: ledgerHandIns,
};

export interface PromoteOptions {
  team: string;
  repos: RepoSpec[];
  by: string;
  mode?: ByoinMode;
  restart?: boolean;
  dryRun?: boolean;
  ledgerDir?: string;
  effects?: Effects;
  log?: (line: string) => void;
  kind?: PromotionReceipt['kind'];
  revert_of?: string;
  resuming?: string;
  anyway?: boolean;
  /** Hand the durable restarting receipt to a continuation after the caller has replied. */
  deferRestart?: (receipt: PromotionReceipt) => Promise<PromotionReceipt | void>;
}

export interface PromoteOutcome {
  ok: boolean;
  receipt: PromotionReceipt | null;
  nothing: boolean;
  message: string;
}

const noop = (): void => undefined;

export async function promoteTeam(o: PromoteOptions): Promise<PromoteOutcome> {
  const ledger = o.ledgerDir ?? PROMOTION_LEDGER_DIR();
  const log = o.log ?? noop;
  const receiptId = newReceiptId(o.team, o.kind ?? 'team_promotion');
  const lockId = o.resuming ?? o.revert_of ?? receiptId;
  await acquirePromotionLock({ id: lockId, team: o.team, at: new Date().toISOString() }, ledger, log);
  let keepLock = false;
  try {
    const outcome = await promoteTeamLocked(o, receiptId);
    keepLock = outcome.receipt?.state === 'restarting';
    return outcome;
  } finally {
    if (!keepLock) await releasePromotionLock(lockId, ledger);
  }
}

async function promoteTeamLocked(o: PromoteOptions, receiptId: string): Promise<PromoteOutcome> {
  const fx = o.effects ?? realEffects;
  const log = o.log ?? noop;
  const ledger = o.ledgerDir ?? PROMOTION_LEDGER_DIR();
  log(`→ preparing candidates for team ${o.team}`);
  const prepared: { c: RepoCandidate; cdir?: string; nothing: boolean }[] = [];
  const lastGood = await lastGoodPromotion(o.team, ledger);
  for (const spec of o.repos) {
    const since = lastGood?.repos.find((x) => x.repo === spec.repo && x.line === spec.line)?.line_tip ?? '';
    const p = await prepareCandidate(spec, fx.handInsFor, since);
    prepared.push({ c: p.candidate, cdir: p.cdir, nothing: p.nothing });
    log(p.nothing ? `  —     ${spec.repo}: ${spec.line} is already in ${spec.target}` : p.candidate.refused ? `  FAIL  ${spec.repo}: ${p.candidate.refused}${p.candidate.conflict_files?.length ? ` (${p.candidate.conflict_files.join(', ')})` : ''}` : `  ok    ${spec.repo}: candidate ${p.candidate.candidate.slice(0, 7)} = ${spec.target}@${p.candidate.expected_old.slice(0, 7)} + ${spec.line}@${p.candidate.line_tip.slice(0, 7)} (${p.candidate.files.length} files, ${p.candidate.hand_in_receipts.length} hand-ins)`);
  }
  const refused = prepared.filter((p) => !p.nothing && p.c.refused);
  for (const p of refused) log(`  warning: ${p.c.repo}: ${p.c.refused}; skipping this repository and continuing.`);
  const active = prepared.filter((p) => !p.nothing && !p.c.refused);
  if (!active.length) return { ok: true, receipt: null, nothing: true, message: 'nothing to promote — every line is already in its target' };

  let r = newReceipt({ id: receiptId, team: o.team, kind: o.kind, repos: active.map((p) => p.c), by: o.by, revert_of: o.revert_of });

  r = advanceState(r, 'proving');
  if (!o.dryRun) await writeReceipt(r, ledger);
  if (o.dryRun) return { ok: true, receipt: r, nothing: false, message: 'dry run: candidates prepared; nothing written, nothing moved' };

  r = advanceState(r, 'advancing');
  r.advances = active.map((p): RefAdvance => ({ repo: p.c.repo, target: p.c.target, from: p.c.expected_old, to: p.c.candidate, status: 'pending' }));
  await writeReceipt(r, ledger);
  const adv = await advanceAll(r, fx, log);
  r = adv.receipt;
  if (!adv.ok) {
    await writeReceipt(r, ledger);
    return { ok: false, receipt: r, nothing: false, message: adv.message };
  }

  if (o.restart === false) {
    r = advanceState(r, 'complete');
    await writeReceipt(r, ledger);
    return { ok: true, receipt: r, nothing: false, message: `complete — ${r.repos.map((x) => `${x.repo} ${x.target}@${x.candidate.slice(0, 7)}`).join(', ')} (no restart requested)` };
  }
  r = advanceState(r, 'restarting');
  await writeReceipt(r, ledger);
  const primary = active[0].c.dir;
  if (o.deferRestart) {
    r = await o.deferRestart(r) ?? r;
    return { ok: true, receipt: r, nothing: false, message: `restarting — receipt ${r.id}; health follows the restart` };
  }
  if (fx === realEffects) {
    r = await queuePromotionContinuation(r, ledger);
    return { ok: true, receipt: r, nothing: false, message: `restarting — receipt ${r.id}; ${r.restart?.unit} owns restart and health` };
  }
  return finishPromotionRestart(r, { primary, ledgerDir: ledger, effects: fx, log, mode: o.mode });
}

export async function finishPromotionRestart(
  receipt: PromotionReceipt,
  options: { primary?: string; ledgerDir?: string; effects?: Effects; log?: (line: string) => void; mode?: ByoinMode; restartAlreadyRequested?: boolean } = {},
): Promise<PromoteOutcome> {
  let r = receipt;
  const ledger = options.ledgerDir ?? PROMOTION_LEDGER_DIR();
  const fx = options.effects ?? realEffects;
  const log = options.log ?? noop;
  const primary = options.primary ?? r.repos[0]?.dir ?? '';
  if (r.state !== 'restarting') return { ok: false, receipt: r, nothing: false, message: `${r.id} is ${r.state}, not restarting` };
  if (options.restartAlreadyRequested) {
    r.restart = { unit: 'tmux-ronin.service', at: new Date().toISOString(), ok: true, detail: 'operator returned after restart request' };
  } else {
    log('→ restarting the live app from the dev worktree');
    r.restart = await fx.restart();
  }
  const health: HealthResult = r.restart?.ok ? await fx.health(primary) : { passed: false, checks: [{ name: 'restart', status: 'FAIL', detail: r.restart?.detail ?? 'restart failed' }], at: new Date().toISOString() };
  r.health = health;
  for (const c of health.checks) log(`  ${c.status.padEnd(5)} health: ${c.name}${c.detail ? ` — ${c.detail.split('\n')[0]}` : ''}`);
  if (health.passed) {
    r = advanceState(r, 'complete');
    await writeReceipt(r, ledger);
    await releasePromotionLock(r.revert_of ?? r.id, ledger);
    if (r.kind === 'team_promotion') {
      await fx.notify(primary, r.team, `from promotion: ${r.id} is COMPLETE — ${r.repos.map((x) => `${x.repo} ${x.target}@${x.candidate.slice(0, 7)}`).join(', ')}; restart and health passed.`);
    }
    return { ok: true, receipt: r, nothing: false, message: `complete — ${r.repos.map((x) => `${x.repo} ${x.target}@${x.candidate.slice(0, 7)}`).join(', ')}; the app is up` };
  }

  if (r.kind === 'team_revert') {
    r = advanceState(r, 'unhealthy');
    await writeReceipt(r, ledger);
    await releasePromotionLock(r.revert_of ?? r.id, ledger);
    await fx.notify(primary, r.team, `from promotion: REVERT ${r.id} restarted but health FAILED — ${failedNames(health)}. No further automatic action; the lead decides.`);
    return { ok: false, receipt: r, nothing: false, message: `revert landed but health still fails: ${failedNames(health)}` };
  }
  log('→ health failed — reverting through the same door');
  // This is already running in the transient continuation. Keep the revert, its restart,
  // and its health check in this unit so the original receipt closes only after recovery.
  const rev = await revertPromotion({ receipt: r, by: 'health', mode: options.mode ?? r.proofs[0]?.mode ?? 'full', ledgerDir: ledger, effects: { ...fx }, log });
  if (rev.ok && rev.receipt) {
    r = advanceState(r, 'reverted');
    r.reverted_by = rev.receipt.id;
    await writeReceipt(r, ledger);
    await releasePromotionLock(r.id, ledger);
    await fx.notify(primary, r.team, `from promotion: ${r.id} was REVERTED — health failed after restart (${failedNames(health)}); revert ${rev.receipt.id} landed and the app is up. The range stays in the ledger, attributed: ${r.repos.map((x) => `${x.repo} ${x.expected_old.slice(0, 7)}..${x.candidate.slice(0, 7)}`).join(', ')}.`);
    return { ok: false, receipt: r, nothing: false, message: `health failed (${failedNames(health)}); reverted by ${rev.receipt.id}` };
  }
  r = advanceState(r, 'unhealthy');
  await writeReceipt(r, ledger);
  await releasePromotionLock(r.id, ledger);
  await fx.notify(primary, r.team, `from promotion: ${r.id} is UNHEALTHY — health failed after restart (${failedNames(health)}) and the revert did not land: ${rev.message}. The lead decides.`);
  return { ok: false, receipt: r, nothing: false, message: `health failed and the revert did not land: ${rev.message}` };
}

const failedNames = (h: HealthResult): string => h.checks.filter((c) => c.status === 'FAIL').map((c) => c.name).join(', ') || 'unknown';

async function advanceAll(r: PromotionReceipt, fx: Effects, log: (l: string) => void): Promise<{ ok: boolean; receipt: PromotionReceipt; message: string }> {
  for (let i = 0; i < r.advances.length; i++) {
    const a = r.advances[i];
    if (a.status !== 'pending') continue;
    const c = r.repos.find((x) => x.repo === a.repo)!;
    await fx.beforeAdvance?.(a.repo, i);
    const out = await advanceTarget(c);
    if (out.ok) {
      r.advances[i] = { ...a, status: 'done', at: new Date().toISOString() };
      log(`  ok    ${a.repo}: ${a.target} ${a.from.slice(0, 7)} → ${a.to.slice(0, 7)}`);
      continue;
    }
    r.advances[i] = { ...a, status: 'raced', found: out.found ?? '' };
    for (let j = i + 1; j < r.advances.length; j++) if (r.advances[j].status === 'pending') r.advances[j] = { ...r.advances[j], status: 'skipped' };
    const moved = anyAdvanced(r);
    const next = advanceState(r, moved ? 'interrupted' : 'interrupted');
    const tail = moved ? 'earlier refs moved; resume rebuilds from current tips or abandon' : 'no ref moved; resume when clean retries this same candidate';
    next.failure = { stage: 'advancing', message: out.reason === 'dirty'
      ? `${a.repo}: ${a.target} did not move — the funnel worktree went dirty during the run (${(out.dirtyFiles ?? []).join(', ') || 'unsaved tracked changes'}); ${tail}`
      : out.reason === 'no-candidate'
        ? `${a.repo}: nothing was built to advance to — rebuild from current tips`
        : `${a.repo}: ${a.target} moved to ${(out.found ?? '').slice(0, 7)} while expected at ${a.from.slice(0, 7)} — ${moved ? 'earlier refs moved; resume rebuilds from current tips or abandon' : 'no ref moved; rebuild from current tips'}` };
    log(`  ${out.reason === 'dirty' ? 'DIRTY' : 'RACE '} ${next.failure.message}`);
    return { ok: false, receipt: next, message: next.failure.message };
  }
  return { ok: true, receipt: r, message: 'advanced' };
}

export interface ResumeOptions {
  id: string;
  by: string;
  ledgerDir?: string;
  effects?: Effects;
  log?: (line: string) => void;
  restart?: boolean;
  deferRestart?: (receipt: PromotionReceipt) => Promise<PromotionReceipt | void>;
}

export async function resumePromotion(o: ResumeOptions): Promise<PromoteOutcome> {
  const ledger = o.ledgerDir ?? PROMOTION_LEDGER_DIR();
  const log = o.log ?? noop;
  let r = await readReceipt(o.id, ledger);
  if (!r) return { ok: false, receipt: null, nothing: false, message: `no receipt ${o.id}` };
  if (r.state === 'restarting') {
    if (o.deferRestart) {
      r = { ...r, updated_at: now() };
      await writeReceipt(r, ledger);
      r = await o.deferRestart(r) ?? r;
      return { ok: true, receipt: r, nothing: false, message: `restarting — receipt ${r.id}; health follows the restart` };
    }
    if (!o.effects || o.effects === realEffects) {
      r = await queuePromotionContinuation(r, ledger);
      return { ok: true, receipt: r, nothing: false, message: `restarting — receipt ${r.id}; ${r.restart?.unit} owns restart and health` };
    }
    return finishPromotionRestart(r, { ledgerDir: ledger, effects: o.effects, log, mode: r.proofs[0]?.mode ?? 'full' });
  }
  if (r.state !== 'interrupted' && r.state !== 'advancing') return { ok: false, receipt: r, nothing: false, message: `${o.id} is ${r.state} — only an interrupted promotion resumes` };

  for (let i = 0; i < r.advances.length; i++) {
    const a = r.advances[i];
    if (a.status !== 'pending') continue;
    const c = r.repos.find((x) => x.repo === a.repo)!;
    const at = await targetAt(c);
    r.advances[i] = at === a.to ? { ...a, status: 'done', at: new Date().toISOString() } : { ...a, status: 'raced', found: at };
  }
  const unfinished = r.advances.filter((a) => a.status === 'raced' || a.status === 'skipped');
  const remaining = r.repos.filter((c) => unfinished.some((a) => a.repo === c.repo));
  const closed = r.state === 'advancing' ? advanceState(r, 'interrupted') : r;
  if (!remaining.length) {
    const done = advanceState(advanceState(closed, 'advancing'), 'complete');
    await writeReceipt(done, ledger);
    return { ok: true, receipt: done, nothing: false, message: 'every ref had moved — marked complete' };
  }
  log(`→ resuming ${o.id}: rebuilding ${remaining.map((c) => c.repo).join(', ')} from current tips`);
  const again = await promoteTeam({
    team: r.team,
    repos: remaining.map((c) => ({ repo: c.repo, dir: c.dir, line: c.line, target: c.target })),
    by: o.by,
    mode: r.proofs[0]?.mode ?? 'full',
    restart: o.restart,
    ledgerDir: ledger,
    effects: o.effects,
    log,
    resuming: r.id,
  });
  const final = again.ok
    ? { ...advanceState(advanceState(closed, 'advancing'), 'complete'), reverted_by: undefined, failure: { ...closed.failure!, message: `${closed.failure?.message ?? ''}; finished by ${again.receipt?.id ?? 'a rebuild'}` } }
    : { ...advanceState(closed, 'abandoned'), failure: { ...closed.failure!, message: `${closed.failure?.message ?? ''}; rebuild ${again.receipt?.id ?? ''} did not land: ${again.message}` } };
  await writeReceipt(final, ledger);
  return { ...again, message: `${o.id} ${final.state}; ${again.message}` };
}

export async function abandonPromotion(id: string, reason: string, ledgerDir = PROMOTION_LEDGER_DIR()): Promise<PromoteOutcome> {
  const r = await readReceipt(id, ledgerDir);
  if (!r) return { ok: false, receipt: null, nothing: false, message: `no receipt ${id}` };
  if (r.state !== 'interrupted' && r.state !== 'advancing') return { ok: false, receipt: r, nothing: false, message: `${id} is ${r.state} — only an interrupted promotion is abandoned` };
  let next = r.state === 'advancing' ? advanceState(r, 'interrupted') : r;
  next = advanceState(next, 'abandoned');
  next.failure = { stage: 'interrupted', message: `abandoned: ${reason}${r.failure ? ` (was: ${r.failure.message})` : ''}` };
  await writeReceipt(next, ledgerDir);
  return { ok: true, receipt: next, nothing: false, message: `${id} abandoned — refs already moved stay moved: ${next.advances.filter((a) => a.status === 'done').map((a) => `${a.repo}@${a.to.slice(0, 7)}`).join(', ') || 'none'}` };
}

export interface RevertOptions {
  receipt: PromotionReceipt;
  by: string;
  mode?: ByoinMode;
  ledgerDir?: string;
  effects?: Effects;
  log?: (line: string) => void;
}

export async function revertPromotion(o: RevertOptions): Promise<PromoteOutcome> {
  const log = o.log ?? noop;
  const moved = o.receipt.repos.filter((c) => o.receipt.advances.some((a) => a.repo === c.repo && a.status === 'done'));
  if (!moved.length) return { ok: false, receipt: null, nothing: true, message: `${o.receipt.id} moved no ref — nothing to revert` };
  const specs: RepoSpec[] = [];
  const branches: { dir: string; branch: string }[] = [];
  for (const c of moved) {
    const branch = `revert/${o.receipt.id}`;
    const head = await revParse(c.dir, `refs/heads/${c.target}`);
    if (head !== c.candidate) {
      log(`  note  ${c.repo}: ${c.target} is at ${head.slice(0, 7)}, not ${c.candidate.slice(0, 7)} — reverting the range on the current tip`);
    }
    await git(c.dir, ['branch', '-f', branch, head]);
    const wt = await resetCandidate({ repo: c.repo, dir: c.dir, line: branch, target: c.target }, head, candidateDir(c.repo, `${c.target}-revert`));
    await git(wt, ['checkout', '--quiet', branch]);
    const isMerge = (await gitOut(wt, ['rev-list', '--parents', '-n', '1', c.candidate])).split(' ').length > 2;
    try {
      if (isMerge) await git(wt, [...AUTOMATION_IDENTITY, 'revert', '--no-edit', '-m', '1', c.candidate]);
      else await git(wt, [...AUTOMATION_IDENTITY, 'revert', '--no-edit', `${c.expected_old}..${c.candidate}`]);
    } catch (e) {
      await git(wt, ['revert', '--abort']).catch(() => undefined);
      await git(wt, ['checkout', '--detach', '--quiet', head]).catch(() => undefined);
      await git(c.dir, ['branch', '-D', branch]).catch(() => undefined);
      return { ok: false, receipt: null, nothing: false, message: `${c.repo}: the revert does not apply cleanly — ${String((e as Error).message).split('\n')[0]}` };
    }
    await git(wt, ['checkout', '--detach', '--quiet', branch]);
    specs.push({ repo: c.repo, dir: c.dir, line: branch, target: c.target });
    branches.push({ dir: c.dir, branch });
  }
  try {
    return await promoteTeam({
      team: o.receipt.team,
      repos: specs,
      by: o.by,
      mode: o.mode ?? 'full',
      ledgerDir: o.ledgerDir,
      effects: o.effects,
      log,
      kind: 'team_revert',
      revert_of: o.receipt.id,
    });
  } finally {
    for (const b of branches) await git(b.dir, ['branch', '-D', b.branch]).catch(() => undefined);
  }
}

export interface BisectOptions {
  spec: RepoSpec;
  from?: string;
  mode?: ByoinMode;
  effects?: Effects;
  log?: (line: string) => void;
}

export interface BisectResult {
  culprit: string;
  files: string[];
  steps: { sha: string; passed: boolean; verdict: string }[];
}

export async function bisectLine(o: BisectOptions): Promise<BisectResult> {
  const fx = o.effects ?? realEffects;
  const log = o.log ?? noop;
  const from = o.from ?? (await revParse(o.spec.dir, `refs/heads/${o.spec.target}`));
  const tip = await revParse(o.spec.dir, `refs/heads/${o.spec.line}`);
  const shas = (await gitOut(o.spec.dir, ['rev-list', '--first-parent', '--reverse', `${from}..${tip}`])).split('\n').filter(Boolean);
  const steps: BisectResult['steps'] = [];
  const cdir = candidateDir(o.spec.repo, `${o.spec.target}-bisect`);
  for (const sha of shas) {
    const wt = await resetCandidate(o.spec, from, cdir);
    const m = await git(wt, [...AUTOMATION_IDENTITY, 'merge', '--no-edit', sha]).then(() => true, () => false);
    if (!m) {
      await git(wt, ['merge', '--abort']).catch(() => undefined);
      steps.push({ sha, passed: false, verdict: 'the merge conflicts' });
      log(`  FAIL  ${sha.slice(0, 7)}: the merge conflicts`);
      return { culprit: sha, files: [], steps };
    }
    steps.push({ sha, passed: true, verdict: 'the merge applies' });
    log(`  ok    ${sha.slice(0, 7)}: the merge applies`);
  }
  return { culprit: '', files: [], steps };
}
