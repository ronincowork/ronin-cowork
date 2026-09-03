/**
 * JIKAN'S CLOCK (src/jikan.ts § THE CLOCK): one loop for every timed thing — never two runs
 * of one tick at once, a throw is recorded and never escapes, a boot run happens once, a
 * restart replaces rather than leaks, and the face says what is ticking.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { clockFace, offClock, onClock } from '../src/jikan.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('a tick runs on its period and once at boot, and never stacks', async () => {
  let inFlight = 0;
  let peak = 0;
  let runs = 0;
  const stop = onClock({
    name: 'probe', everyMs: 20, atBoot: 0,
    run: async () => { inFlight++; peak = Math.max(peak, inFlight); runs++; await sleep(35); inFlight--; },
  });
  await sleep(130);
  stop();
  assert.ok(runs >= 2 && runs <= 5, `ran ${runs} times`);
  assert.equal(peak, 1, 'a slow job is skipped, never stacked');
  assert.equal(clockFace().find((t) => t.name === 'probe'), undefined, 'a stopped tick leaves the face');
});

test('a throw is recorded on the face, cleared by a clean run, and never escapes', async () => {
  let fail = true;
  onClock({ name: 'flaky', everyMs: 15, atBoot: 0, run: async () => { if (fail) throw new Error('boom'); } });
  await sleep(10);
  assert.equal(clockFace().find((t) => t.name === 'flaky')?.last_error, 'boom');
  fail = false;
  await sleep(40);
  const state = clockFace().find((t) => t.name === 'flaky')!;
  assert.equal(state.last_error, '');
  assert.ok(state.runs >= 2);
  offClock('flaky');
});

test('a second tick of the same name replaces the first', async () => {
  let a = 0;
  let b = 0;
  onClock({ name: 'twin', everyMs: 60_000, atBoot: 0, run: async () => { a++; } });
  onClock({ name: 'twin', everyMs: 60_000, atBoot: 0, run: async () => { b++; } });
  await sleep(20);
  assert.deepEqual([a, b], [0, 1], 'the replaced tick never fires');
  assert.equal(clockFace().filter((t) => t.name === 'twin').length, 1);
  offClock('twin');
});
