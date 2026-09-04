import test from 'node:test';
import assert from 'node:assert/strict';
import { discardEnding, ignoreEnding, promptOwners, type EndingDispositionOps } from '../src/desks/ending-disposition.js';
import type { EndingDeskFact, EndingPreflight } from '../src/desks/ending.js';

const fact = (branch: string, patch: Partial<EndingDeskFact> = {}): EndingDeskFact => ({
  repo: 'r', branch, line: 'dev', repo_dir: '/repo', worktree: `/wt/${branch}`, mounted: true,
  tip: 'tip', line_tip: 'line', owners: ['ending'], team: 't', living_owners: ['ending'],
  changes: { staged: [], unstaged: [], untracked: ['draft.txt'] }, unique_commits: ['tip'],
  contained: false, unresolved: true, last_living_owner: true, ...patch,
});

const preflight = (desks: EndingDeskFact[], scope: 'session' | 'team' = 'session'): EndingPreflight => ({
  scope, subject: scope === 'session' ? 'ending' : 't', requested_action: scope === 'session' ? 'archive' : 'retire',
  desks, unresolved: desks.filter((d) => d.unresolved),
  prompt_targets: [...new Set(desks.flatMap((d) => d.living_owners))], choices: ['prompt', 'ignore'],
});

function harness(log: string[]): EndingDispositionOps {
  return {
    prompt: async (target) => { log.push(`prompt:${target}`); return { queued: true, id: 'm1' }; },
    close: async (d) => { log.push(`close:${d.branch}`); },
    quarantineAndRemove: async (d) => { log.push(`quarantine:${d.branch}`); log.push(`remove:${d.branch}`); return { id: `q-${d.branch}` }; },
    discard: async (d) => { log.push(`discard:${d.branch}`); return { receipt_id: `x-${d.branch}` }; },
    event: async (type, d) => { log.push(`event:${type}:${d.branch}`); },
  };
}

test('Prompt Agent queues exact named work only to reachable owners', async () => {
  const log: string[] = [];
  const p = preflight([fact('a')]);
  const result = await promptOwners(p, harness(log));
  assert.deepEqual(result.prompted, [{ target: 'ending', queued: true, id: 'm1' }]);
  assert.deepEqual(log, ['prompt:ending', 'event:closeout_prompted:a']);
});

test('Ignore closes settled desks and quarantines all unresolved work without an automatic handoff', async () => {
  const log: string[] = [];
  const settled = fact('settled', { unresolved: false, contained: true, changes: { staged: [], unstaged: [], untracked: [] }, unique_commits: [] });
  const shared = fact('shared', { owners: ['ending', 'successor'], living_owners: ['ending', 'successor'], last_living_owner: false });
  const result = await ignoreEnding(preflight([settled, shared, fact('last')]), harness(log));
  assert.deepEqual(result.closed, ['r:settled']);
  assert.deepEqual(result.quarantined, [
    { desk: 'r:shared', quarantine_id: 'q-shared' },
    { desk: 'r:last', quarantine_id: 'q-last' },
  ]);
  assert.equal(log.some((line) => line.startsWith('handoff:')), false);
  assert.ok(log.indexOf('quarantine:last') < log.indexOf('remove:last'));
});

test('a failed quarantine never removes active machinery', async () => {
  const log: string[] = [];
  const ops = harness(log);
  ops.quarantineAndRemove = async () => { log.push('quarantine:failed'); throw new Error('disk full'); };
  await assert.rejects(ignoreEnding(preflight([fact('last')]), ops), /disk full/);
  assert.equal(log.some((line) => line.startsWith('remove:')), false);
});

test('discard requires the exact scope receipt confirmation', async () => {
  const log: string[] = [];
  const p = preflight([fact('last')]);
  await assert.rejects(discardEnding(p, 'yes', harness(log)), /DISCARD session ending/);
  const result = await discardEnding(p, 'DISCARD session ending', harness(log));
  assert.deepEqual(result.discarded, [{ desk: 'r:last', receipt_id: 'x-last' }]);
});
