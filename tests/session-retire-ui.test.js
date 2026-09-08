import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

globalThis.window = { matchMedia: () => ({ matches: false }) };
const { createSubmitGate, runShutdownPolling } = await import(`../public/js/session-retire.js?test=${Date.now()}`);

test('live tile names safe shutdown, not irreversible hard delete', async () => {
  const source = await fs.readFile(new URL('../public/js/session-retire.js', import.meta.url), 'utf8');
  assert.match(source, /Shut down Agent/);
  assert.match(source, /It never discards desk work/);
  assert.doesNotMatch(source, /Hard delete/);
});

test('submit gate rejects duplicate clicks until success or failure restores it', async () => {
  const gate = createSubmitGate();
  let release;
  let calls = 0;
  const first = gate(async () => { calls++; await new Promise((resolve) => { release = resolve; }); });
  assert.equal(await gate(async () => { calls++; }), false);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, true);
  await assert.rejects(() => gate(async () => { throw new Error('failed'); }), /failed/);
  assert.equal(await gate(async () => { calls++; }), true);
  assert.equal(calls, 2);
});

test('safe shutdown publishes immediate and polled phases through success', async () => {
  const seen = [];
  const rows = [
    { id: 'op', state: 'running', phase: 'checking_desks', message: 'Checking assigned desks (2 found)' },
    { id: 'op', state: 'running', phase: 'closing_desks', message: 'Closing safe desks (2/2)' },
    { id: 'op', state: 'complete', phase: 'complete', message: 'Agent a and 2 assigned desk(s) closed' },
  ];
  const result = await runShutdownPolling('a', {
    start: async () => ({ id: 'op', state: 'running', phase: 'resolving_agent', message: 'Resolving Agent a' }),
    poll: async () => rows.shift(), wait: async () => {}, onProgress: (row) => seen.push(row.message),
  });
  assert.equal(seen[0], 'Resolving Agent…');
  assert.ok(seen.includes('Checking assigned desks (2 found)'));
  assert.ok(seen.includes('Closing safe desks (2/2)'));
  assert.equal(result.state, 'complete');
});

test('safe shutdown timeout is bounded and actionable', async () => {
  let clock = 0;
  await assert.rejects(() => runShutdownPolling('a', {
    start: async () => ({ id: 'op', state: 'running', message: 'Checking' }),
    poll: async () => ({ id: 'op', state: 'running', message: 'Checking' }),
    wait: async () => { clock += 20; }, now: () => clock, timeoutMs: 50,
  }), /timed out.*left available/);
});

test('a hung backend poll times out and returns control to the dialog', async () => {
  await assert.rejects(() => runShutdownPolling('a', {
    start: async () => ({ id: 'op', state: 'running', message: 'Checking' }),
    poll: async () => new Promise(() => {}), wait: async () => {}, pollTimeoutMs: 5,
  }), /status check timed out; controls restored/);
});

test('actionable backend refusal is rendered as the terminal failure', async () => {
  const refusal = 'ronin:team/t/a: dirty files: x. NEXT: run git status';
  await assert.rejects(() => runShutdownPolling('a', {
    start: async () => ({ id: 'op', state: 'running', message: 'Resolving' }),
    poll: async () => ({ id: 'op', state: 'failed', error: refusal, message: refusal }), wait: async () => {},
  }), new RegExp(refusal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
