import { changedFiles } from '../desks/git.js';
import { replyToHandIn } from '../desks/lead.js';
import { receiptById } from '../desks/receipts.js';
import type { RepoCandidate, RepoProof } from './receipts.js';

/** Gate output is unstructured; only exact candidate paths count as attribution. */
export function filesNamedByFailedGates(proof: RepoProof, candidateFiles: string[]): string[] {
  const detail = proof.gates.filter((g) => g.status === 'FAIL').map((g) => g.detail ?? '').join('\n');
  return candidateFiles.filter((file) => detail.includes(file));
}

/** Route by file ownership across receipt Git ranges. A gate naming no file is never guessed. */
export async function routeProvingFailure(input: {
  team: string; lead: string; candidates: RepoCandidate[]; proofs: RepoProof[];
}): Promise<string[]> {
  const routed: string[] = [];
  for (const candidate of input.candidates) {
    const proof = input.proofs.find((p) => p.repo === candidate.repo);
    if (!proof || proof.passed) continue;
    const named = filesNamedByFailedGates(proof, candidate.files);
    if (!named.length) continue;
    const gateText = proof.gates.filter((g) => g.status === 'FAIL')
      .map((g) => `${g.name}${g.detail ? `: ${g.detail.split('\n')[0]}` : ''}`).join('; ');
    for (const id of candidate.hand_in_receipts) {
      const receipt = await receiptById(candidate.repo, id);
      if (!receipt?.line_sha) continue;
      const touched: string[] = await changedFiles(candidate.dir, receipt.expected_old, receipt.line_sha).catch((): string[] => []);
      const overlap = named.filter((f) => touched.includes(f));
      if (!overlap.length) continue;
      const delivery = await replyToHandIn({
        team: input.team, from: input.lead, to: receipt.session, receiptId: receipt.id,
        message: `promotion BYOIN failed on ${overlap.join(', ')} — ${gateText}. Fix the attributed hand-in and hand in again.`,
      }).catch(() => null);
      if (delivery) routed.push(`${receipt.id}:${receipt.session}:${overlap.join(',')}`);
    }
  }
  return routed;
}
