import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindowedLoader } from '../src/routes/launch.js';

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
