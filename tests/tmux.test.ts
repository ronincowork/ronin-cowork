/**
 * The tmux exact-targeting contract, as executable assertions.
 *
 * The header of src/tmux.ts recounts the measured catastrophe these forms exist to
 * prevent: `-t name` is a PATTERN (exact, then prefix, then fnmatch), so with `beta`
 * dead and `betagamma` alive, `kill-session -t beta` killed betagamma — exit 0. The
 * `=` prefix makes the name an identity; the trailing `:` makes a pane/window target
 * read as `session:`. Every dangerous call in the tree leans on these two strings.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { exactSession, exactPane, isValidName, parseTags } from '../src/tmux.js';

test('exactSession pins the name as an identity, never a pattern', () => {
  assert.equal(exactSession('beta'), '=beta');
  // The whole point: a dead `beta` must fail loudly, not resolve to `betagamma`.
  assert.notEqual(exactSession('beta'), 'beta');
});

test('exactPane is the session form plus the colon that makes tmux read it as `session:`', () => {
  assert.equal(exactPane('beta'), '=beta:');
  assert.equal(exactPane('beta'), exactSession('beta') + ':');
});

test('isValidName accepts shell-safe tmux names', () => {
  assert.equal(isValidName('beta'), true);
  assert.equal(isValidName('grid_x-1'), true);
  assert.equal(isValidName('A'.repeat(64)), true);
});

test('isValidName rejects what tmux or a shell would mangle', () => {
  assert.equal(isValidName(''), false);
  assert.equal(isValidName('a.b'), false); // '.' is a tmux window separator
  assert.equal(isValidName('a:b'), false); // ':' is a tmux pane separator
  assert.equal(isValidName('-lead'), false); // leading '-' reads as a flag
  assert.equal(isValidName('has space'), false);
  assert.equal(isValidName('A'.repeat(65)), false);
});

test('parseTags cleans, dedupes and sorts — tags are addresses, so they stay boring', () => {
  assert.deepEqual(parseTags('B, a,a'), ['a', 'b']); // lowercased, deduped, sorted
  assert.deepEqual(parseTags(''), []);
  assert.deepEqual(parseTags('sweep,kojinsa'), ['kojinsa', 'sweep']);
});

test('parseTags drops what an agent could not type as an address', () => {
  assert.deepEqual(parseTags('ok, has space, -lead, , x'.trim()), ['ok', 'x']);
  assert.deepEqual(parseTags('a'.repeat(33)), []); // over the 32-char cap
});
