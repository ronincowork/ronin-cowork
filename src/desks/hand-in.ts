import { existsSync } from 'node:fs';
import { arrangementOf } from './arrangement.js';
import { adoptLine, lineDirty, refreshLine } from './desk.js';
import { casRef, mergeInto, revParse, worktreeAddDetached, worktreePrune, worktreeRemove } from './git.js';
import { withLineLock } from './queue.js';
import { candidateWorktree, deskStatus, lineFor, listDeskRecords, readDesk, updateDesk } from './registry.js';
import { appendReceipt, newReceiptId } from './receipts.js';
import type { DeskNotice, HandInReceipt, HandInResult, RepoArrangement } from './schema.js';

export interface HandInOutcome { receipt: HandInReceipt; notices: DeskNotice[] }

async function freshCandidate(a: RepoArrangement, line: string, sha: string): Promise<string> {
  const wt = candidateWorktree(a.repo, line);
  if (existsSync(wt)) await worktreeRemove(a.dir, wt, true).catch(() => undefined);
  await worktreePrune(a.dir);
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
  if (!st.tip) return { receipt: await appendReceipt(receipt({ result: 'refused', reason: 'desk branch is gone' })), notices: [] };
  if (st.ahead === 0) {
    return { receipt: await appendReceipt(receipt({ result: 'refused', source_tip: st.tip, reason: 'nothing to hand in — the desk is not ahead of its line' })), notices: [] };
  }
  const funnelDirt = await lineDirty(line);
  if (funnelDirt.length) {
    return { receipt: await appendReceipt(receipt({ result: 'refused', source_tip: st.tip, reason: `the reviewed integration line ${line.worktree} has unsaved files (${funnelDirt.length}); diagnose and preserve them before hand-in`, conflict_files: funnelDirt })), notices: [] };
  }

  const out = await withLineLock(repo, line.branch, async (): Promise<HandInReceipt> => {
    const maxRetries = opts.maxRetries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const dirt = await lineDirty(line);
      if (dirt.length) {
        return appendReceipt(receipt({ result: 'refused', source_tip: st.tip, reason: `the reviewed integration line ${line.worktree} has unsaved files (${dirt.length}); diagnose and preserve them before hand-in`, conflict_files: dirt }));
      }
      const old = await revParse(a.dir, `refs/heads/${line.branch}`);
      const tip = await revParse(a.dir, `refs/heads/${branch}`);
      const cand = await freshCandidate(a, line.branch, old);
      const m = await mergeInto(cand, branch, `Hand in ${branch} to ${line.branch} (${rec.session})`);
      if (!m.ok) {
        await updateDesk(repo, branch, { blocked: `hand-in conflicts with ${line.branch} on ${m.conflicts.length} file(s) — the lead adjudicates; adopt the line into the desk and resolve` });
        return appendReceipt(receipt({ result: 'conflict', source_tip: tip, expected_old: old, conflict_files: m.conflicts }));
      }
      const candSha = await revParse(cand, 'HEAD');
      if (await casRef(a.dir, line.branch, candSha, old)) {
        const refreshed = await refreshLine(line);
        await updateDesk(repo, branch, { blocked: '', pending: null });
        const r = await appendReceipt(receipt({ result: 'accepted', source_tip: tip, expected_old: old, candidate: candSha, line_sha: candSha, reason: refreshed ? '' : `line advanced; its worktree ${line.worktree} did not fast-forward` }));
        await updateDesk(repo, branch, { last_hand_in: r.id });
        return r;
      }
      if (attempt >= maxRetries) {
        return appendReceipt(receipt({ result: 'stale', source_tip: tip, expected_old: old, candidate: candSha, reason: `line moved ${attempt + 1} times during hand-in; re-run` }));
      }
      await appendReceipt(receipt({ result: 'stale', source_tip: tip, expected_old: old, candidate: candSha, reason: 'line moved; rebuilt on the new tip' }));
    }
  });

  const notices: DeskNotice[] = [];
  if (out.result === 'accepted') {
    for (const sib of await listDeskRecords({ repo })) {
      if (sib.line !== line.branch) continue;
      notices.push(await adoptLine(sib, a, rec.session));
    }
  }
  return { receipt: out, notices };
}

export async function handInAssignment(assignment: { desks: Array<{ repo: string; branch: string }> }): Promise<HandInOutcome[]> {
  const out: HandInOutcome[] = [];
  for (const d of assignment.desks) out.push(await handIn(d.repo, d.branch));
  return out;
}
