/**
 * JIKAN'S CLOCK (src/jikan.ts § THE CLOCK): one loop for every timed thing — never two runs
 * of one tick at once, a throw is recorded and never escapes, a boot run happens once, a
 * restart replaces rather than leaks, and the face says what is ticking.
 *
 * Held without a stopwatch: BYOIN runs this floor beside a browser smoke on a loaded box
 * (2026-09-03, promotion 8ft9), so nothing here asserts how many times a period fired in
 * a window. Each test waits for a CONDITION, bounded, and asserts the invariant.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { clockFace, offClock, onClock } from '../src/jikan.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Poll until `ready()` or the bound passes; the assertion that follows says which. */
async function until(ready: () => boolean, bound = 5_000): Promise<void> {
  const end = Date.now() + bound;
  while (!ready() && Date.now() < end) await sleep(10);
}

test('a tick runs at boot and on its period, and never stacks', async () => {
  let inFlight = 0;
  let peak = 0;
  let runs = 0;
  const stop = onClock({
    name: 'probe', everyMs: 10, atBoot: 0,
    run: async () => { inFlight++; peak = Math.max(peak, inFlight); runs++; await sleep(30); inFlight--; },
  });
  await until(() => runs >= 3);
  stop();
  assert.ok(runs >= 3, `ran ${runs} times: boot, then the period`);
  assert.equal(peak, 1, 'a slow job is skipped, never stacked');
  assert.equal(clockFace().find((t) => t.name === 'probe'), undefined, 'a stopped tick leaves the face');
});

test('a throw is recorded on the face, cleared by a clean run, and never escapes', async () => {
  let fail = true;
  const face = () => clockFace().find((t) => t.name === 'flaky');
  onClock({ name: 'flaky', everyMs: 10, atBoot: 0, run: async () => { if (fail) throw new Error('boom'); } });
  await until(() => face()?.last_error === 'boom');
  assert.equal(face()?.last_error, 'boom');
  const failed = face()!.runs;
  fail = false;
  await until(() => (face()?.runs ?? 0) > failed && face()?.last_error === '');
  const state = face()!;
  assert.equal(state.last_error, '', 'a clean run clears the record');
  assert.ok(state.runs > failed);
  offClock('flaky');
});

test('a second tick of the same name replaces the first', async () => {
  let a = 0;
  let b = 0;
  onClock({ name: 'twin', everyMs: 60_000, atBoot: 0, run: async () => { a++; } });
  onClock({ name: 'twin', everyMs: 60_000, atBoot: 0, run: async () => { b++; } });
  await until(() => b >= 1);
  await sleep(30);
  assert.deepEqual([a, b], [0, 1], 'the replaced tick never fires');
  assert.equal(clockFace().filter((t) => t.name === 'twin').length, 1);
  offClock('twin');
});

test.after(() => { for (const name of ['probe', 'flaky', 'twin']) offClock(name); });
