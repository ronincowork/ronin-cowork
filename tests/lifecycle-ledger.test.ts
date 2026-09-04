import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  appendManagedEvent, beginManagedTransaction, compatibilityProjectionDocuments, managedLedgerFile, projectManagedLifecycle,
  readManagedEvents, readManagedLedger, recoverInterruptedTransactions, withManagedTransaction, type ManagedEventInput,
} from '../src/desks/lifecycle-ledger.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-lifecycle-ledger-'));
const base = (repo: string, transaction_id: string, type: ManagedEventInput['type'], result: ManagedEventInput['result']): ManagedEventInput => ({
  repo, transaction_id, type, result, session: 'fable', team: 'comp', refs: [], commits: [], objects: [], detail: {},
});

test('repository chain is serialized and aggregate reads remain one operational ledger', async () => {
  await Promise.all(Array.from({ length: 8 }, (_, index) => appendManagedEvent({
    ...base('cowork', `open-${index}`, 'desk_opened', 'completed'),
    objects: [{ kind: 'desk', id: `cowork:team/comp/d${index}`, path: `/w/d${index}`, owner_sessions: ['fable'], owner_team: 'comp' }],
  }, { root })));
  await appendManagedEvent(base('services', 'policy-1', 'policy_resolved', 'observed'), { root });
  const cowork = await readManagedEvents({ repo: 'cowork', root, strict: true });
  assert.deepEqual(cowork.events.map((event) => event.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(new Set(cowork.events.map((event) => event.event_id)).size, 8);
  assert.equal(cowork.events[0]!.predecessor, '');
  assert.equal(cowork.events[7]!.predecessor, cowork.events[6]!.event_id);
  const all = await readManagedLedger({ root, strict: true });
  assert.equal(all.events.length, 9);
  assert.deepEqual(new Set(all.events.map((event) => event.repo)), new Set(['cowork', 'services']));
});

test('projection rebuild is deterministic for desks, assignments, receipts, promotions and custody', async () => {
  const event = (sequence: number, type: ManagedEventInput['type'], result: ManagedEventInput['result'], objects: ManagedEventInput['objects'] = [], transaction_id = `tx-${sequence}`) => ({
    schema: 1 as const, event_id: `event-${sequence}`, sequence, predecessor: sequence === 1 ? '' : `event-${sequence - 1}`,
    transaction_id, type, result, at: `2026-09-04T00:00:0${sequence}.000Z`, repo: 'r', session: 's', team: 't',
    refs: [], commits: [], objects, detail: {},
  });
  const desk = { kind: 'desk' as const, id: 'r:team/t/s', path: '/w/s', owner_sessions: ['s'], owner_team: 't' };
  const assignment = { kind: 'assignment' as const, id: 's@t', owner_sessions: ['s'], owner_team: 't' };
  const quarantine = { kind: 'quarantine' as const, id: 'q1', owner_sessions: [], owner_team: 't' };
  const events = [
    event(1, 'desk_opened', 'completed', [desk, assignment]),
    event(2, 'hand_in_started', 'started', [{ kind: 'receipt', id: 'hi1' }], 'tx-hand-in'),
    event(3, 'hand_in_accepted', 'accepted', [{ kind: 'receipt', id: 'hi1' }], 'tx-hand-in'),
    event(4, 'promoted', 'completed', [{ kind: 'promotion', id: 'p1' }]),
    event(5, 'quarantined', 'quarantined', [desk, quarantine]),
    event(6, 'settled', 'completed', [{ kind: 'settlement', id: 'set1' }]),
  ];
  const first = projectManagedLifecycle(events);
  const second = projectManagedLifecycle([...events].reverse());
  assert.deepEqual(first, second);
  assert.deepEqual(first.desks, []);
  assert.deepEqual(first.assignments.map((item) => item.id), ['s@t']);
  assert.equal(first.receipts.length, 2);
  assert.equal(first.promotions.length, 1);
  assert.deepEqual(first.quarantines.map((item) => item.id), ['q1']);
  assert.deepEqual(first.pending, []);
  assert.deepEqual(compatibilityProjectionDocuments(first), {
    registry: [], assignments: first.assignments, receipts: first.receipts, promotions: first.promotions,
    quarantines: first.quarantines, settlements: first.settlements,
  });
});

test('a torn append stays as evidence and recovery reaches one coherent terminal outcome', async () => {
  const local = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-lifecycle-torn-'));
  const tx = await beginManagedTransaction(base('cowork', 'tx-crash', 'hand_in_started', 'started'), { root: local });
  await fs.appendFile(managedLedgerFile('cowork', local), '{"schema":1,"event_id":"torn"');
  await tx.finish('recovered', 'rolled_back', { detail: { disposition: 'candidate removed; line unchanged' } });
  const read = await readManagedEvents({ repo: 'cowork', root: local });
  assert.equal(read.issues.length, 1);
  assert.equal(read.issues[0]!.code, 'malformed_event');
  assert.deepEqual(read.events.map((event) => event.type), ['hand_in_started', 'recovered']);
  assert.deepEqual(projectManagedLifecycle(read.events).pending, []);
});

test('callback transaction keeps short mutation between durable start and terminal event', async () => {
  const local = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-lifecycle-transaction-'));
  const observed: string[] = [];
  const value = await withManagedTransaction(base('cowork', 'tx-short', 'hand_in_started', 'started'), async (tx) => {
    observed.push('mutated');
    await tx.finish('hand_in_accepted', 'accepted', { refs: [{ name: 'team/comp/dev', before: 'a', after: 'b' }] });
    return 42;
  }, { root: local });
  assert.equal(value, 42);
  assert.deepEqual(observed, ['mutated']);
  assert.deepEqual((await readManagedEvents({ repo: 'cowork', root: local, strict: true })).events.map((event) => event.result), ['started', 'accepted']);
});

test('startup recovery records only callback-proved disposition and is idempotent', async () => {
  const local = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-lifecycle-recovery-'));
  await beginManagedTransaction(base('cowork', 'tx-pending', 'hand_in_started', 'started'), { root: local });
  let calls = 0;
  const first = await recoverInterruptedTransactions('cowork', async (pending) => {
    calls++;
    assert.equal(pending.transaction_id, 'tx-pending');
    return { result: 'rolled_back', detail: { observed: 'line unchanged' } };
  }, { root: local });
  const second = await recoverInterruptedTransactions('cowork', async () => {
    calls++;
    return { result: 'needs_attention', detail: {} };
  }, { root: local });
  assert.equal(calls, 1);
  assert.equal(first[0]!.type, 'recovered');
  assert.deepEqual(second, []);
});
