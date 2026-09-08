import test from 'node:test';
import assert from 'node:assert/strict';
import { hardDeleteConfirmation, shutdownAgent, ShutdownRefused, ShutdownSlots, type ShutdownOps } from '../src/desks/session-shutdown.js';
import type { DeskStatus } from '../src/desks/schema.js';

const desk = (patch: Partial<DeskStatus> = {}): DeskStatus => ({
  repo: 'ronin', root: 'ronin', branch: 'team/t/agent', worktree: '/wt/agent', line: 'team/t/dev', mode: 'reviewed',
  session: 'agent', team: 't', assignment: 'a', state: 'open', opened_at: '', pending: null, last_hand_in: 'hi_accepted', blocked: '',
  owners: ['agent'], dependency_location: '', mounted: true, tip: 'tip', line_tip: 'line', dirty: false, dirty_files: [],
  ahead: 0, behind: 0, working: 'dev', working_tip: 'dev', ahead_of_working: 0, behind_working: 0,
  line_ahead_of_working: 0, line_behind_working: 0, base_sha: 'base', source: undefined,
  ...patch,
});

function ops(desks: DeskStatus[], log: string[]): ShutdownOps {
  return {
    desks: async () => desks,
    liveSessions: async () => [{ name: 'agent' }],
    cwd: async () => '/wt/agent',
    close: async (d) => { log.push(`close:${d.repo}:${d.branch}`); return { action: 'closed', reason: 'contained' }; },
    stop: async (name) => { log.push(`stop:${name}`); },
  };
}

test('accepted clean team-contained desks take the automatic close-all then end fast path', async () => {
  const log: string[] = [];
  const phases: string[] = [];
  const result = await shutdownAgent('agent', (p) => phases.push(`${p.phase}:${p.message}`), ops([
    desk(), desk({ repo: 'lab', branch: 'team/t/agent-lab', worktree: '/wt/lab' }),
  ], log));
  assert.deepEqual(result.closed, ['ronin:team/t/agent', 'lab:team/t/agent-lab']);
  assert.deepEqual(log, ['close:ronin:team/t/agent', 'close:lab:team/t/agent-lab', 'stop:agent']);
  assert.ok(phases.some((p) => /checking_desks:Checking assigned desks \(2 found\)/.test(p)));
  assert.match(phases.at(-1)!, /complete:Agent agent and 2 assigned desk\(s\) closed/);
});

test('dirty, pending, rejected, unique, shared, and occupied desks block the whole transaction actionably', async () => {
  const log: string[] = [];
  const harness = ops([desk({
    dirty: true, dirty_files: ['draft.txt'], ahead: 2, pending: { line_sha: 'x', by: 'lead', at: '', overlap: ['draft.txt'] },
    blocked: 'last hand-in rejected', owners: ['agent', 'peer'],
  })], log);
  harness.liveSessions = async () => [{ name: 'agent' }, { name: 'viewer' }];
  harness.cwd = async (name) => name === 'viewer' ? '/wt/agent/src' : '/wt/agent';
  await assert.rejects(() => shutdownAgent('agent', () => {}, harness), (e: unknown) => {
    assert.ok(e instanceof ShutdownRefused);
    assert.match(e.message, /ronin:team\/t\/agent/);
    assert.match(e.message, /dirty files: draft\.txt/);
    assert.match(e.message, /tejun-desk hand-in/);
    assert.match(e.message, /shared with peer/);
    assert.match(e.message, /occupied by viewer/);
    return true;
  });
  assert.deepEqual(log, [], 'preflight refusal closes no desk and does not end the Agent');
});

test('an unexpected close failure leaves the Agent alive', async () => {
  const log: string[] = [];
  const harness = ops([desk()], log);
  harness.close = async () => ({ action: 'kept', reason: 'changed during close' });
  await assert.rejects(() => shutdownAgent('agent', () => {}, harness), /Agent remains live/);
  assert.deepEqual(log, []);
});

test('hung preflight expires before any mutation and aborts its stale task', async () => {
  const log: string[] = [];
  const harness = ops([], log);
  let aborted = false;
  harness.desks = async (_session, signal) => new Promise((_resolve) => signal?.addEventListener('abort', () => { aborted = true; }));
  await assert.rejects(() => shutdownAgent('agent', () => {}, harness, { operationTimeoutMs: 20, readTimeoutMs: 5 }), /timed out during assigned desk lookup/);
  assert.equal(aborted, true);
  assert.deepEqual(log, []);
});

test('hung close is aborted and cannot later mutate or end the Agent', async () => {
  const log: string[] = [];
  const harness = ops([desk()], log);
  harness.close = async (_desk, _session, signal) => new Promise((resolve) => {
    setTimeout(() => {
      if (!signal?.aborted) log.push('late-close');
      resolve({ action: 'closed', reason: 'late' });
    }, 20);
  });
  await assert.rejects(() => shutdownAgent('agent', () => {}, harness, { operationTimeoutMs: 50, closeTimeoutMs: 5 }), /timed out during closing/);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(log, []);
});

test('hung stop is aborted and cannot later kill after the terminal timeout', async () => {
  const log: string[] = [];
  const harness = ops([], log);
  harness.stop = async (_session, signal) => new Promise((resolve) => {
    setTimeout(() => {
      if (!signal?.aborted) log.push('late-stop');
      resolve();
    }, 20);
  });
  await assert.rejects(() => shutdownAgent('agent', () => {}, harness, { operationTimeoutMs: 50, stopTimeoutMs: 5 }), /timed out during ending Agent/);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(log, []);
});

test('a terminal timeout releases the session slot so retry gets a fresh operation', () => {
  const slots = new ShutdownSlots();
  assert.equal(slots.begin('agent', 'old'), true);
  assert.equal(slots.begin('agent', 'duplicate'), false);
  slots.terminal('agent', 'old');
  assert.equal(slots.begin('agent', 'retry'), true);
  assert.equal(slots.current('agent'), 'retry');
});

test('Hard Delete confirmation names the exact Agent and owned desks', () => {
  assert.equal(hardDeleteConfirmation('agent'), 'HARD DELETE agent AND OWNED DESKS');
});
