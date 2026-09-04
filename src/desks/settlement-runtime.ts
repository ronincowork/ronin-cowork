import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { listProjectRoots } from '../project-roots.js';
import { listSessions } from '../tmux.js';
import { arrangementOf, desksManaged } from './arrangement.js';
import { branchExists, deleteBranch, isAncestor, revParse, worktreeOf } from './git.js';
import { withManagedTransaction } from './lifecycle-ledger.js';
import { listDeskRecords, removeDesk } from './registry.js';
import { applySettlement, settlementPlan, type ResidueObservation, type SettlementItem } from './settlement.js';

interface Collected { observation: ResidueObservation; repo: string; apply: () => Promise<void> }

export async function collectSettlementResidue(): Promise<Collected[]> {
  const collected: Collected[] = [];
  const live = new Set((await listSessions().catch(() => [])).filter((session) => !!session.key).map((session) => session.name));
  const roots = new Set((await listProjectRoots()).map((root) => root.name));
  for (const rec of await listDeskRecords()) {
    if (!roots.has(rec.repo)) continue;
    const arrangement = await arrangementOf(rec.repo).catch(() => null);
    if (!arrangement || !desksManaged(arrangement)) continue;
    const [hasBranch, wt] = await Promise.all([branchExists(arrangement.dir, rec.branch), worktreeOf(arrangement.dir, rec.branch)]);
    if (!hasBranch && !wt && !existsSync(rec.worktree)) {
      collected.push({
        repo: rec.repo,
        observation: { id: `${rec.repo}:${rec.branch}:row`, kind: 'registry', managed: true, exists: false },
        apply: () => removeDesk(rec.repo, rec.branch),
      });
      continue;
    }
    if (!hasBranch || wt || existsSync(rec.worktree)) continue;
    const tip = await revParse(arrangement.dir, `refs/heads/${rec.branch}`);
    const working = await revParse(arrangement.dir, `refs/heads/${arrangement.working}`);
    const dead = (rec.owners?.length ? rec.owners : [rec.session]).every((owner) => !live.has(owner));
    const contained = !!tip && !!working && await isAncestor(arrangement.dir, tip, working);
    collected.push({
      repo: rec.repo,
      observation: {
        id: `${rec.repo}:${rec.branch}`, kind: 'ref', managed: true, active: !dead,
        contained_in_working: contained, contains_unique_commits: !contained,
      },
      apply: async () => { await deleteBranch(arrangement.dir, rec.branch); await removeDesk(rec.repo, rec.branch); },
    });
  }
  return collected;
}

export async function settleManagedResidue(yes = false): Promise<{
  dry_run: boolean;
  safe: SettlementItem[];
  applied: SettlementItem[];
  untouched: SettlementItem[];
}> {
  const collected = await collectSettlementResidue();
  const observations = collected.map((item) => item.observation);
  const plan = settlementPlan(observations);
  const byId = new Map(collected.map((item) => [item.observation.id, item]));
  const result = await applySettlement(observations, async (item) => {
    const target = byId.get(item.id);
    if (!target) throw new Error(`settlement target disappeared: ${item.id}`);
    await withManagedTransaction({
      repo: target.repo, transaction_id: `settle_${randomUUID()}`, type: 'ending_inspected', result: 'started',
      session: '', team: '', refs: [], commits: [], objects: [{ kind: 'settlement', id: item.id, path: item.kind === 'directory' || item.kind === 'candidate' ? item.id : undefined }],
      detail: { classification: item.classification, action: item.action },
    }, async (transaction) => {
      await target.apply();
      await transaction.finish('settled', 'completed', { detail: { classification: item.classification, action: item.action } });
    });
  }, yes);
  return { dry_run: !yes, safe: plan.safe, applied: result.applied, untouched: result.untouched };
}
