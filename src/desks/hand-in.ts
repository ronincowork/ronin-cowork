import { existsSync } from 'node:fs';
import { arrangementOf } from './arrangement.js';
import { lineDirty, refreshLine } from './desk.js';
import { casRef, mergeInto, revParse, worktreeAddDetached, worktreeRemove } from './git.js';
import { withLineLock } from './queue.js';
import { candidateWorktree, deskStatus, lineFor, readDesk, updateDesk } from './registry.js';
import { appendReceipt, newReceiptId } from './receipts.js';
import type { DeskNotice, DeskStatus, HandInReceipt, HandInResult, RepoArrangement } from './schema.js';

export interface HandInTidy {
  desk: DeskStatus | null;
  unsaved_files: string[];
  other_level_desks: Array<{ repo: string; branch: string }>;
  promotion_due: boolean;
}

export interface HandInOutcome { receipt: HandInReceipt; notices: DeskNotice[]; tidy: HandInTidy }

const emptyTidy = (): HandInTidy => ({ desk: null, unsaved_files: [], other_level_desks: [], promotion_due: false });

async function freshCandidate(a: RepoArrangement, line: string, sha: string): Promise<string> {
  const wt = candidateWorktree(a.repo, line);
  if (existsSync(wt)) await worktreeRemove(a.dir, wt, true).catch(() => undefined);
  await worktreeAddDetached(a.dir, wt, sha);
  return wt;
}

export async function handIn(repo: string, branch: string, opts: { maxRetries?: number } = {}): Promise<HandInOutcome> {
  const rec = await readDesk(repo, branch);
  if (!rec) throw new Error(`no desk recorded for ${repo}:${branch}`);
  const a = await arrangementOf(repo);
  const line = lineFor(a, rec.team);
  const at = () => new Date().toISOString();
  const receipt = (fields: Partial<HandInReceipt> & { result: HandInResult }): HandInReceipt => ({
    id: newReceiptId(), at: at(), repo, team: rec.team, line: line.branch, session: rec.session, desk: branch,
    source_tip: '', expected_old: '', candidate: '', line_sha: '', conflict_files: [], reason: '', ...fields,
  });

  const st = await deskStatus(rec, a);
  if (!st.tip) return { receipt: await appendReceipt(receipt({ result: 'refused', reason: 'desk branch is gone' })), notices: [], tidy: emptyTidy() };

  const out = await withLineLock(repo, line.branch, async (): Promise<HandInReceipt> => {
    try {
      const maxRetries = opts.maxRetries ?? 3;
      for (let attempt = 0; ; attempt++) {
        const preexistingLineDirt = await lineDirty(line);
        const old = await revParse(a.dir, `refs/heads/${line.branch}`);
        const tip = await revParse(a.dir, `refs/heads/${branch}`);
        const working = await revParse(a.dir, `refs/heads/${a.working}`);
        const cand = await freshCandidate(a, line.branch, working);
        const accepted = await mergeInto(cand, line.branch, `Add accepted ${line.branch} delta to current ${a.working}`);
        if (!accepted.ok) {
          return appendReceipt(receipt({ result: 'conflict', source_tip: tip, expected_old: old,
            reason: `accepted team delta conflicts with current ${a.working}`, conflict_files: accepted.conflicts }));
        }
        const incoming = await mergeInto(cand, branch, `Hand in ${branch} to ${line.branch} (${rec.session})`);
        if (!incoming.ok) {
          await updateDesk(repo, branch, { blocked: `hand-in conflicts with current ${a.working} plus ${line.branch} on ${incoming.conflicts.length} file(s) — update the desk and resolve` });
          return appendReceipt(receipt({ result: 'conflict', source_tip: tip, expected_old: old, conflict_files: incoming.conflicts }));
        }
        const candSha = await revParse(cand, 'HEAD');
        if (await casRef(a.dir, line.branch, candSha, old)) {
          const refreshed = preexistingLineDirt.length ? false : await refreshLine(line);
          await updateDesk(repo, branch, { blocked: '', pending: null });
          const reason = preexistingLineDirt.length
            ? `line advanced; its worktree has unsaved files (${preexistingLineDirt.join(', ')}) and was left untouched`
            : refreshed ? '' : `line advanced; its worktree ${line.worktree} did not fast-forward`;
          const r = await appendReceipt(receipt({ result: 'accepted', source_tip: tip, expected_old: old, candidate: candSha, line_sha: candSha, reason }));
          await updateDesk(repo, branch, { last_hand_in: r.id });
          return r;
        }
        if (attempt >= maxRetries) {
          return appendReceipt(receipt({ result: 'stale', source_tip: tip, expected_old: old, candidate: candSha, reason: `line moved ${attempt + 1} times during hand-in; re-run` }));
        }
        await appendReceipt(receipt({ result: 'stale', source_tip: tip, expected_old: old, candidate: candSha, reason: 'line moved; rebuilt on the new tip' }));
      }
    } finally {
      const candidate = candidateWorktree(a.repo, line.branch);
      if (existsSync(candidate)) await worktreeRemove(a.dir, candidate, true).catch(() => undefined);
    }
  });

  const notices: DeskNotice[] = [];
  if (out.result !== 'accepted') return { receipt: out, notices, tidy: emptyTidy() };
  const current = await readDesk(repo, branch);
  const currentStatus = current ? await deskStatus(current, a) : null;
  return { receipt: out, notices, tidy: {
    desk: currentStatus,
    unsaved_files: currentStatus?.dirty_files ?? [],
    other_level_desks: [],
    promotion_due: (currentStatus?.line_ahead_of_working ?? 0) > 0,
  } };
}

export async function handInAssignment(assignment: { desks: Array<{ repo: string; branch: string }> }): Promise<HandInOutcome[]> {
  const out: HandInOutcome[] = [];
  for (const d of assignment.desks) out.push(await handIn(d.repo, d.branch));
  return out;
}
