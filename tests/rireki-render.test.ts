/**
 * render.ts's two new cherry_pick pieces — flowed back from Koe's bundled copy
 * (TEAM_WORKBENCH.md "CHERRY_PICK, found and made RIREKI's", 2026-08-26): sinceMark
 * (the owner's-last-echo boundary) and withLiveFrame (the settled scroll's live-frame
 * layer). Both are pure; no tmux, no filesystem.
 *
 * RENDER.TS IS A SERVICE'S, NOT THIS REPO'S. `src/services/` is assembled at boot from
 * RONIN_SERVICES and gitignored, so it is real on an installed box and absent on the
 * isolated runner (the same fact check-docs' allowlist records for the docs that cite
 * service files). The import is therefore dynamic, and on a tree with no mount every
 * test here SKIPS WITH ITS REASON — the two-leg integration test's rule — rather than
 * failing the unit floor for a file the runner could never have. A skip is not a pass:
 * the designated integrator's local candidate run is where these actually execute.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type ScrollRecord = { n: number; k: string; t: string };
type RenderRecord = ScrollRecord & { live?: boolean };
type Render = {
  sinceMark: (recs: ScrollRecord[]) => { recs: ScrollRecord[]; marked: boolean };
  withLiveFrame: (settled: RenderRecord[], live: string, agent: string) => RenderRecord[];
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDER = path.join(HERE, '..', 'src', 'services', 'rireki', 'render.ts');
const mounted = existsSync(RENDER);
/** WHY it is unavailable, so a skip cannot blame the wrong thing. */
const unavailable = 'ronin-services is not mounted: src/services/ is assembled at boot and gitignored, so render.ts is absent on this tree';

// A string specifier, so neither tsc nor the runner resolves the module before the
// existsSync above has said whether it is there.
const render = async (): Promise<Render> => (await import(`${HERE}/../src/services/rireki/render.js`)) as Render;

test('sinceMark windows to the last owner echo and says so', async (t) => {
  if (!mounted) return t.skip(unavailable);
  const { sinceMark } = await render();
  const recs: ScrollRecord[] = [
    { n: 1, k: 'assistant', t: 'earlier reply' },
    { n: 2, k: 'user', t: '❯ what next' },
    { n: 3, k: 'assistant', t: 'newer reply' },
  ];
  const { recs: windowed, marked } = sinceMark(recs);
  assert.equal(marked, true);
  assert.deepEqual(windowed.map((r) => r.n), [2, 3]);
});

test('sinceMark with no echo in the window returns everything, unmarked', async (t) => {
  if (!mounted) return t.skip(unavailable);
  const { sinceMark } = await render();
  const recs: ScrollRecord[] = [{ n: 1, k: 'assistant', t: 'a' }, { n: 2, k: 'assistant', t: 'b' }];
  const { recs: windowed, marked } = sinceMark(recs);
  assert.equal(marked, false);
  assert.equal(windowed, recs);
});

test('withLiveFrame appends fresh live picks after the settled tail, deduped', async (t) => {
  if (!mounted) return t.skip(unavailable);
  const { withLiveFrame } = await render();
  const settled: RenderRecord[] = [{ n: 1, k: 'assistant', t: '⏺ settled words' }];
  const live = '⏺ brand new words on screen';
  const out = withLiveFrame(settled, live, 'claude');
  assert.equal(out[0].t, '⏺ settled words');
  assert.ok(out.some((r) => r.t === '⏺ brand new words on screen' && r.live));
});

test('withLiveFrame drops a live pick that only repeats the settled tail', async (t) => {
  if (!mounted) return t.skip(unavailable);
  const { withLiveFrame } = await render();
  const settled: RenderRecord[] = [{ n: 1, k: 'assistant', t: '⏺ brand new words on screen' }];
  const live = '⏺ brand new words on screen';
  const out = withLiveFrame(settled, live, 'claude');
  assert.equal(out.length, 1); // nothing fresh to add
});

test('withLiveFrame folds the composer box first: an unsent draft is not an owner echo', async (t) => {
  if (!mounted) return t.skip(unavailable);
  const { withLiveFrame } = await render();
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

test('withLiveFrame: an owner echo still on screen means the live frame stands alone', async (t) => {
  if (!mounted) return t.skip(unavailable);
  const { withLiveFrame } = await render();
  const settled: RenderRecord[] = [{ n: 1, k: 'assistant', t: '⏺ the previous turn' }];
  const live = '❯ next question\n⏺ the fresh answer';
  const out = withLiveFrame(settled, live, 'claude');
  assert.deepEqual(out.map((r) => r.t), ['⏺ the fresh answer']);
  assert.ok(out.every((r) => r.live));
});
