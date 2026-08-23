/**
 * parseSessionKey — the documented split-before-trim bug is the spec.
 *
 * tmux prints an EMPTY FIELD for an unset user option, so an unstamped session's
 * `#{@ronin-key}\t#{session_created}` output BEGINS with the tab. Trimming before
 * splitting ate that tab, the created-epoch was mistaken for the stamped key, and
 * state landed in <store>/<epoch>/ — on every fresh session, and on nothing else.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSessionKey } from '../src/session-dir.js';
import { decoderFor } from '../src/services/rireki/decode.js';
import { projectRecords } from '../src/services/rireki/render.js';

test('unstamped session: the leading tab must survive (THE bug case)', () => {
  assert.equal(parseSessionKey('\t1786281078\n', 'beta'), 'beta-1786281078');
});

test('stamped session: the stamped key wins, so a rename cannot change the answer', () => {
  assert.equal(parseSessionKey('beta-1786281078\t1790000000\n', 'renamed'), 'beta-1786281078');
});

test('no output at all: fall back to the bare name (no server, best effort)', () => {
  assert.equal(parseSessionKey('', 'beta'), 'beta');
  assert.equal(parseSessionKey('\n', 'beta'), 'beta');
});

test('CRLF from tmux is stripped, not folded into the key', () => {
  assert.equal(parseSessionKey('beta-1\t2\r\n', 'x'), 'beta-1');
  assert.equal(parseSessionKey('\t1786281078\r\n', 'beta'), 'beta-1786281078');
});

const records = [
  { n: 1, k: 'spinner' as const, t: 'working' },
  { n: 2, k: 'user' as const, t: '› fix it' },
  { n: 3, k: 'tool' as const, t: '• Ran tests' },
  { n: 4, k: 'result' as const, t: '└ 12 passed' },
  { n: 5, k: 'text' as const, t: 'unknown but real' },
  { n: 6, k: 'assistant' as const, t: 'It is fixed.' },
];

test('terminal mirror retains chrome while detailed removes only proven chrome', () => {
  assert.deepEqual(projectRecords(records, 'terminal_mirror').map((r) => r.n), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(projectRecords(records, 'detailed').map((r) => r.n), [2, 3, 4, 5, 6]);
});

test('condensed represents a tool run and keeps unknown content', () => {
  const rendered = projectRecords(records, 'condensed');
  assert.equal(rendered.some((r) => r.k === 'activity' && r.from === 3 && r.through === 4), true);
  assert.equal(rendered.some((r) => r.t === 'unknown but real'), true);
});

test('conversation keeps dialogue and represents activity without leaking unknown output', () => {
  const rendered = projectRecords(records, 'conversation');
  assert.deepEqual(rendered.map((r) => r.k), ['user', 'activity', 'assistant']);
});

test('provider decoders distinguish addressed prose from tool activity', () => {
  assert.equal(decoderFor('codex').classify('• I’m checking the failing test now.'), 'assistant');
  assert.equal(decoderFor('codex').classify('• Explored the repository'), 'tool');
  assert.equal(decoderFor('claude').classify('● Building it now.'), 'assistant');
  assert.equal(decoderFor('claude').classify('● Bash(npm test)'), 'tool');
});
