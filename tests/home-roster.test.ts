import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindowedLoader } from '../src/routes/launch.js';
import { createActivityCache } from '../src/status.js';

test('home roster computation is shared by concurrent requests in a two-second window', async () => {
  let time = 4_100;
  let calls = 0;
  let release: ((value: string) => void) | undefined;
  const load = createWindowedLoader(
    () => {
      calls++;
      return new Promise<string>((resolve) => { release = resolve; });
    },
    2_000,
    () => time,
  );

  const first = load();
  const concurrent = load();
  assert.equal(calls, 1);
  assert.strictEqual(concurrent, first);
  release?.('roster');
  assert.equal(await first, 'roster');
  assert.equal(await load(), 'roster');
  assert.equal(calls, 1);

  time = 6_000;
  const nextWindow = load();
  assert.equal(calls, 2);
  release?.('next roster');
  assert.equal(await nextWindow, 'next roster');
});

test('a failed roster computation can be retried within the same window', async () => {
  let calls = 0;
  const load = createWindowedLoader(async () => {
    calls++;
    if (calls === 1) throw new Error('temporary');
    return 'recovered';
  }, 2_000, () => 1_000);

  await assert.rejects(load(), /temporary/);
  assert.equal(await load(), 'recovered');
  assert.equal(calls, 2);
});

test('unchanged activity keeps the last classification without another capture', async () => {
  let captures = 0;
  const classify = createActivityCache(async (session: string) => {
    captures++;
    return `${session}:${captures}`;
  });

  assert.equal(await classify('agent', 100), 'agent:1');
  assert.equal(await classify('agent', 100), 'agent:1');
  assert.equal(captures, 1);
  assert.equal(await classify('agent', 101), 'agent:2');
  assert.equal(captures, 2);
});

test('a failed changed capture keeps the prior classification and retries later', async () => {
  let fail = false;
  let captures = 0;
  const classify = createActivityCache(async () => {
    captures++;
    if (fail) throw new Error('pane disappeared');
    return 'ready';
  });

  assert.equal(await classify('agent', 100), 'ready');
  fail = true;
  assert.equal(await classify('agent', 101), 'ready');
  assert.equal(await classify('agent', 101), 'ready');
  assert.equal(captures, 3, 'the failed activity stamp remains eligible for retry');
});
