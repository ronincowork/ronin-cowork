/**
 * WHY THERE IS NO TRANSCRIPT — each situation says which one it is.
 *
 * The defect this pins: an empty `@ronin-key` was read as "not running", so a live session
 * that Ronin had not started was told it was not running. `codex_bryers` was up and being
 * told exactly that. A pane that is there and a pane that is not are different facts about
 * the machine, and the words on the tile are read by someone deciding what to do next.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmux } from '../src/tmux-client.js';
import { resolveTranscriptSource } from '../src/launch-journal.js';

/** A tmux that answers `display-message` with `key` and knows which sessions exist. */
const fakeTmux = (t: ReturnType<typeof test> extends never ? never : any, key: string, live: boolean) =>
  t.mock.method(tmux, 'run', async (args: readonly string[]) => {
    if (args[0] === 'display-message') return key;
    if (args[0] === 'has-session') {
      if (!live) throw new Error("can't find session");
      return '';
    }
    return '';
  });

test('a live session Ronin did not start is not told it is not running', async (t) => {
  fakeTmux(t, '', true);
  const lookup = await resolveTranscriptSource('codex_bryers');
  assert.deepEqual(lookup, { gap: 'no_key' });
});

test('a name with no pane behind it is genuinely not running', async (t) => {
  fakeTmux(t, '', false);
  const lookup = await resolveTranscriptSource('closed_yesterday');
  assert.deepEqual(lookup, { gap: 'not_live' });
});

test('a keyed pane with no launch artifact is a missing identity, not a missing pane', async (t) => {
  fakeTmux(t, 'a-key-nothing-was-written-for', true);
  const lookup = await resolveTranscriptSource('born_before_stamping');
  assert.deepEqual(lookup, { gap: 'no_identity' });
});
