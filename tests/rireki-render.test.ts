/**
 * render.ts's two new cherry_pick pieces — flowed back from Koe's bundled copy
 * (TEAM_WORKBENCH.md "CHERRY_PICK, found and made RIREKI's", 2026-08-26): sinceMark
 * (the owner's-last-echo boundary) and withLiveFrame (the settled scroll's live-frame
 * layer). Both are pure; no tmux, no filesystem.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sinceMark, withLiveFrame } from '../src/services/rireki/render.js';
import type { RenderRecord } from '../src/services/rireki/render.js';
import type { ScrollRecord } from '../src/services/rireki/scroll.js';

test('sinceMark windows to the last owner echo and says so', () => {
  const recs: ScrollRecord[] = [
    { n: 1, k: 'assistant', t: 'earlier reply' },
    { n: 2, k: 'user', t: '❯ what next' },
    { n: 3, k: 'assistant', t: 'newer reply' },
  ];
  const { recs: windowed, marked } = sinceMark(recs);
  assert.equal(marked, true);
  assert.deepEqual(windowed.map((r) => r.n), [2, 3]);
});

test('sinceMark with no echo in the window returns everything, unmarked', () => {
  const recs: ScrollRecord[] = [{ n: 1, k: 'assistant', t: 'a' }, { n: 2, k: 'assistant', t: 'b' }];
  const { recs: windowed, marked } = sinceMark(recs);
  assert.equal(marked, false);
  assert.equal(windowed, recs);
});

test('withLiveFrame appends fresh live picks after the settled tail, deduped', () => {
  const settled: RenderRecord[] = [{ n: 1, k: 'assistant', t: '⏺ settled words' }];
  const live = '⏺ brand new words on screen';
  const out = withLiveFrame(settled, live, 'claude');
  assert.equal(out[0].t, '⏺ settled words');
  assert.ok(out.some((r) => r.t === '⏺ brand new words on screen' && r.live));
});

test('withLiveFrame drops a live pick that only repeats the settled tail', () => {
  const settled: RenderRecord[] = [{ n: 1, k: 'assistant', t: '⏺ brand new words on screen' }];
  const live = '⏺ brand new words on screen';
  const out = withLiveFrame(settled, live, 'claude');
  assert.equal(out.length, 1); // nothing fresh to add
});

test('withLiveFrame folds the composer box first: an unsent draft is not an owner echo', () => {
  // Measured off a real pane 2026-08-26: current Claude Code draws the input box as a
  // bare pair of horizontal rules, no corners — see decode.ts inputBox().
  const settled: RenderRecord[] = [{ n: 1, k: 'assistant', t: '⏺ previous reply' }];
  const live = [
    '──────────────────────────────────────────',
    '❯ delete that roster, team stays tag-only',
    '──────────────────────────────────────────',
  ].join('\n');
  const out = withLiveFrame(settled, live, 'claude');
  assert.deepEqual(out, settled); // an unsent draft is nobody's echo and nobody's speech
});

test('withLiveFrame: an owner echo still on screen means the live frame stands alone', () => {
  const settled: RenderRecord[] = [{ n: 1, k: 'assistant', t: '⏺ the previous turn' }];
  const live = '❯ next question\n⏺ the fresh answer';
  const out = withLiveFrame(settled, live, 'claude');
  assert.deepEqual(out.map((r) => r.t), ['⏺ the fresh answer']);
  assert.ok(out.every((r) => r.live));
});
