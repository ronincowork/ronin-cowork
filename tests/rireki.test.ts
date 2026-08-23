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
