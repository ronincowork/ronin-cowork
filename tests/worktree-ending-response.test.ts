import test from 'node:test';
import assert from 'node:assert/strict';
import { endingAcknowledgement, endingWarningResponse, resolveEndingRequest } from '../src/desks/ending-response.js';
import type { EndingPreflight } from '../src/desks/ending.js';

const ending: EndingPreflight = {
  scope: 'session', subject: 'scribe', requested_action: 'archive', desks: [], unresolved: [{} as never],
  prompt_targets: ['scribe'], choices: ['prompt', 'ignore'],
};

test('Prompt returns a pending warning without running another ending action', () => {
  const response = endingWarningResponse(ending);
  assert.equal(response.ok, true);
  assert.equal(response.ending_pending, true);
  assert.equal(response.acknowledgement_required, true);
  assert.deepEqual(response.actions, ['prompt', 'ignore']);
  assert.equal(response.prompted, undefined);
  assert.match(response.warning, /Unresolved managed work/);
});

test('archive/delete omission proceeds through quarantine custody and never prompts', async () => {
  const calls: string[] = [];
  const custody = { prompted: [], closed: [], quarantined: [{ desk: 'r:dirty', quarantine_id: 'q1' }], discarded: [] };
  const decision = await resolveEndingRequest(ending, '', {
    prompt: async () => { calls.push('prompt'); return custody; },
    quarantine: async () => { calls.push('quarantine'); return custody; },
  });
  assert.equal(decision.proceed, true);
  assert.deepEqual(calls, ['quarantine']);
  assert.equal(decision.acknowledgement?.acknowledged, true);
  assert.equal(decision.response, undefined);
});

test('team retirement omission proceeds through the same quarantine custody decision', async () => {
  const teamEnding: EndingPreflight = { ...ending, scope: 'team', subject: 'worktree-fix', requested_action: 'retire' };
  const calls: string[] = [];
  const custody = { prompted: [], closed: ['r:team/worktree-fix/dev'], quarantined: [], discarded: [] };
  const decision = await resolveEndingRequest(teamEnding, 'inspect', {
    prompt: async () => { calls.push('prompt'); return custody; },
    quarantine: async () => { calls.push('quarantine'); return custody; },
  });
  assert.equal(decision.proceed, true);
  assert.deepEqual(calls, ['quarantine']);
  assert.equal(decision.acknowledgement?.acknowledged, true);
});

test('Prompt reports its one chosen message action without hiding or re-running the warning', () => {
  const prompted = { prompted: [{ target: 'scribe', queued: true, id: 'm1' }], closed: [], quarantined: [], discarded: [] };
  const response = endingWarningResponse(ending, prompted);
  assert.equal(response.ending, ending);
  assert.equal(response.prompted, prompted);
  assert.equal(response.ending_pending, true);
});

test('proceed-without-choosing acknowledges quarantine custody and names the next tools', () => {
  const disposition = { prompted: [], closed: ['r:settled'], quarantined: [{ desk: 'r:dirty', quarantine_id: 'q1' }], discarded: [] };
  const acknowledgement = endingAcknowledgement(ending, disposition);
  assert.equal(acknowledgement.acknowledged, true);
  assert.equal(acknowledgement.automatic_prompt, false);
  assert.equal(acknowledgement.disposition, disposition);
  assert.match(String(acknowledgement.warning), /proceeded/);
  assert.deepEqual(acknowledgement.next_tools, ['tejun-desk status', 'ronin-desk-settle --dry-run']);
});
