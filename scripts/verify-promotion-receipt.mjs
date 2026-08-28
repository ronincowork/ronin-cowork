#!/usr/bin/env node
/**
 * verify-promotion-receipt — does this receipt prove THIS commit?
 *
 *   node scripts/verify-promotion-receipt.mjs --sha <sha> [--repo cowork] \
 *        (--receipt <file.json> | --pr-body <file.md>)
 *
 * The one full repository BYOIN runs at team → dev (docs/worktrees.md, "What runs where"),
 * and dev then carries a promotion receipt for its exact SHA. A dev → master pull request
 * is NOT the first full check: CI consumes that receipt — names it, checks that it is
 * complete, that its proof for this repository passed on exactly the PR's head commit, and
 * that the ref advance to that commit was done — and only then reruns anything for release
 * assurance. Fields are Fable 2's (src/promotion/receipts.ts); this reads, never writes.
 *
 * HOW THE RECEIPT TRAVELS. The ledger lives on the box (bin/ronin-store promotion_ledger),
 * not in the repository — committing a receipt onto dev would change the SHA it proves.
 * So the receipt rides in the pull request body, in a fenced block:
 *
 *     ```ronin-promotion-receipt
 *     { ...the receipt JSON... }
 *     ```
 *
 * Exit 0 with one `receipt ok — …` line when it proves the commit; otherwise a `receipt
 * FAIL — …` line naming exactly what is missing or mismatched, and exit 1. No receipt at
 * all is a FAIL, not a SKIP: after the cutover a PR to the stable line without a receipt
 * is a PR whose candidate was never proved where the contract says it must be.
 */
import fs from 'node:fs';

export function extractReceipt(body) {
  const m = /```ronin-promotion-receipt\s*\n([\s\S]*?)\n```/m.exec(body ?? '');
  return m ? m[1] : null;
}

/** Pure: the verdict on a parsed receipt for one repo and one commit. `null` = ok. */
export function receiptProblem(r, repoName, commit) {
  if (!r || typeof r !== 'object') return 'the receipt is not a JSON object';
  if (r.kind !== 'team_promotion' && r.kind !== 'team_revert') return `unknown receipt kind '${r.kind}'`;
  if (r.state !== 'complete') return `receipt ${r.id} is '${r.state}', and only 'complete' is proof`;
  const cand = (r.repos ?? []).find((x) => x.repo === repoName);
  if (!cand) return `receipt ${r.id} carries no candidate for repository '${repoName}'`;
  if (!cand.candidate) return `receipt ${r.id}: candidate for '${repoName}' has no commit (the merge conflicted)`;
  if (!sameCommit(cand.candidate, commit)) return `receipt ${r.id} proves ${cand.candidate}, not ${commit} — a different candidate; dev has moved since, or this PR is not the promoted state`;
  const proof = (r.proofs ?? []).find((p) => p.repo === repoName && sameCommit(p.candidate, commit));
  if (!proof) return `receipt ${r.id} has no BYOIN proof for '${repoName}' at ${commit}`;
  if (!proof.passed) return `receipt ${r.id}: BYOIN did not pass on ${commit} (${proof.verdict ?? 'no verdict line'})`;
  if (proof.mode !== 'full') return `receipt ${r.id}: the proof on ${commit} was '${proof.mode}', not the full repository BYOIN`;
  const adv = (r.advances ?? []).find((a) => a.repo === repoName && sameCommit(a.to, commit));
  if (!adv) return `receipt ${r.id} records no ref advance of '${repoName}' to ${commit}`;
  if (adv.status !== 'done') return `receipt ${r.id}: the advance of '${repoName}' to ${commit} is '${adv.status}', not done`;
  if (r.reverted_by) return `receipt ${r.id} was reverted by ${r.reverted_by}; the reverted state is not releasable`;
  return null;
}

function sameCommit(a, b) {
  if (!a || !b) return false;
  a = String(a).toLowerCase(); b = String(b).toLowerCase();
  return a === b || (a.length >= 7 && b.length >= 7 && (a.startsWith(b) || b.startsWith(a)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const sha = opt('--sha');
  const repo = opt('--repo') ?? 'cowork';
  const receiptFile = opt('--receipt');
  const bodyFile = opt('--pr-body');
  const fail = (why) => { console.log(`receipt FAIL — ${why}`); process.exit(1); };
  if (!sha) fail('no --sha given; the commit to prove is the PR head');
  if (!receiptFile && !bodyFile) fail('no --receipt file and no --pr-body file');
  let text;
  if (receiptFile) text = fs.readFileSync(receiptFile, 'utf8');
  else {
    text = extractReceipt(fs.readFileSync(bodyFile, 'utf8'));
    if (text === null) fail('the pull request body carries no ```ronin-promotion-receipt block — this candidate was never promoted through team → dev, or the receipt was not attached');
  }
  let r;
  try { r = JSON.parse(text); } catch (e) { fail(`the receipt is not valid JSON (${e.message})`); }
  const why = receiptProblem(r, repo, sha);
  if (why) fail(why);
  const proof = r.proofs.find((p) => p.repo === repo);
  console.log(`receipt ok — ${r.id} (${r.kind}) proves ${repo}@${sha}: full BYOIN passed (${proof.gates?.length ?? 0} gates), advance done`);
}
