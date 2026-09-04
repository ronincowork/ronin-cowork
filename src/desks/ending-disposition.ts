import { closeoutMessage, type EndingDeskFact, type EndingPreflight } from './ending.js';

export interface EndingDispositionOps {
  prompt(target: string, message: string): Promise<{ queued: boolean; id?: string }>;
  close(fact: EndingDeskFact): Promise<void>;
  handoff(fact: EndingDeskFact, owners: string[]): Promise<void>;
  quarantine(fact: EndingDeskFact): Promise<{ id: string; manifest?: string }>;
  removeActive(fact: EndingDeskFact): Promise<void>;
  discard?(fact: EndingDeskFact, confirmation: string): Promise<{ receipt_id: string }>;
  event?(type: 'closeout_prompted' | 'handed_off' | 'quarantined' | 'discarded' | 'desk_closed', fact: EndingDeskFact, detail: Record<string, unknown>): Promise<void>;
}

export interface EndingDispositionResult {
  prompted: Array<{ target: string; queued: boolean; id?: string }>;
  closed: string[];
  handed_off: Array<{ desk: string; owners: string[] }>;
  quarantined: Array<{ desk: string; quarantine_id: string }>;
  discarded: Array<{ desk: string; receipt_id: string }>;
}

const deskName = (fact: EndingDeskFact): string => `${fact.repo}:${fact.branch}`;
const emptyResult = (): EndingDispositionResult => ({ prompted: [], closed: [], handed_off: [], quarantined: [], discarded: [] });

export async function promptOwners(preflight: EndingPreflight, ops: EndingDispositionOps): Promise<EndingDispositionResult> {
  const result = emptyResult();
  for (const target of preflight.prompt_targets) {
    const delivery = await ops.prompt(target, closeoutMessage(preflight, target));
    result.prompted.push({ target, ...delivery });
    for (const fact of preflight.unresolved.filter((desk) => desk.living_owners.includes(target))) {
      await ops.event?.('closeout_prompted', fact, { target, message: closeoutMessage(preflight, target), ...delivery });
    }
  }
  return result;
}

export async function ignoreEnding(preflight: EndingPreflight, ops: EndingDispositionOps): Promise<EndingDispositionResult> {
  const result = emptyResult();
  for (const fact of preflight.desks) {
    if (!fact.unresolved) {
      await ops.close(fact);
      await ops.event?.('desk_closed', fact, { result: 'contained' });
      result.closed.push(deskName(fact));
      continue;
    }
    const successors = fact.living_owners.filter((owner) => owner !== preflight.subject);
    if (preflight.scope === 'session' && successors.length) {
      await ops.handoff(fact, successors);
      await ops.event?.('handed_off', fact, { from: preflight.subject, to: successors });
      result.handed_off.push({ desk: deskName(fact), owners: successors });
      continue;
    }
    const custody = await ops.quarantine(fact);
    await ops.event?.('quarantined', fact, { quarantine_id: custody.id, manifest: custody.manifest ?? '' });
    await ops.removeActive(fact); // custody must be durable before active machinery disappears
    result.quarantined.push({ desk: deskName(fact), quarantine_id: custody.id });
  }
  return result;
}

export async function discardEnding(
  preflight: EndingPreflight,
  confirmation: string,
  ops: EndingDispositionOps,
): Promise<EndingDispositionResult> {
  const expected = `DISCARD ${preflight.scope} ${preflight.subject}`;
  if (confirmation !== expected) throw new Error(`intentional discard requires exact confirmation: ${expected}`);
  if (!ops.discard) throw new Error('discard is not available');
  const result = emptyResult();
  for (const fact of preflight.unresolved) {
    const receipt = await ops.discard(fact, confirmation);
    await ops.event?.('discarded', fact, { confirmation, receipt_id: receipt.receipt_id });
    result.discarded.push({ desk: deskName(fact), receipt_id: receipt.receipt_id });
  }
  return result;
}
