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
import { newSessionArgs } from '../src/session-args.js';

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

/**
 * BIRTH ENVIRONMENT DELIVERY. `-e` sets the session environment, which tmux never applies
 * to the process it starts in the pane — measured on an isolated socket: an injected PATH
 * reached neither the initial pane nor a later one. While `-e` was the only delivery, the
 * projected guard shims and Routine tools never reached an Agent at all, and the
 * `systemctl` refusal that protects the unit owning every session was inert. These
 * assertions are the reason that cannot regress silently.
 */
test('the birth environment is exec-delivered through `env`, not left to `-e`', () => {
  const a = newSessionArgs('beta', { env: { PATH: '/projected:/usr/bin' }, argv: ['claude', '--model', 'opus'] });
  const sep = a.indexOf('--');
  assert.notEqual(sep, -1, 'the argv must be separated from tmux flags');
  // The process is exec'd through env, carrying the assignment, ahead of the real command.
  assert.deepEqual(a.slice(sep + 1, sep + 5), ['env', 'PATH=/projected:/usr/bin', 'claude', '--model']);
});

test('`-e` is still set, so a pane opened later by hand sees the same environment', () => {
  const a = newSessionArgs('beta', { env: { PATH: '/projected' }, argv: ['claude'] });
  const i = a.indexOf('-e');
  assert.notEqual(i, -1);
  assert.equal(a[i + 1], 'PATH=/projected');
});

test('no env means no `env` wrapper — a bare shell tile is exec\'d unchanged', () => {
  const a = newSessionArgs('beta', { argv: ['claude'] });
  assert.equal(a.includes('-e'), false);
  assert.deepEqual(a.slice(a.indexOf('--') + 1, a.indexOf('--') + 2), ['claude']);
});

test('a shell tile (no argv) carries neither the exec wrapper nor remain-on-exit', () => {
  const a = newSessionArgs('beta', { env: { PATH: '/projected' } });
  assert.equal(a.includes('--'), false);
  assert.equal(a.includes('env'), false);
  assert.equal(a.includes('remain-on-exit'), false);
});

test('env assignments are sorted, so a birth argv is reproducible', () => {
  const a = newSessionArgs('beta', { env: { ZED: '1', ALPHA: '2' }, argv: ['claude'] });
  const sep = a.indexOf('--');
  assert.deepEqual(a.slice(sep + 1, sep + 4), ['env', 'ALPHA=2', 'ZED=1']);
});

test('a supplied session record key is stamped in the same tmux birth transaction', () => {
  const a = newSessionArgs('beta', { argv: ['claude'], key: 'beta-unique-key' });
  const key = a.indexOf('@ronin-key');
  assert.notEqual(key, -1);
  assert.deepEqual(a.slice(key - 3, key + 2), ['set-option', '-t', 'beta', '@ronin-key', 'beta-unique-key']);
});

test('Ronin Services off at birth sets RIREKI\'s dial in the same tmux birth transaction', () => {
  // The recorder\'s sweep arms a pipe on every pane it finds without one. Setting the dial
  // after new-session would leave a window for a first segment; in the chain there is none.
  const a = newSessionArgs('beta', { argv: ['claude'], key: 'beta-key', rireki: false });
  const i = a.indexOf('@ronin-rireki');
  assert.notEqual(i, -1);
  assert.equal(a[i + 1], 'off');
  assert.deepEqual(a.slice(i - 4, i), [';', 'set-option', '-t', 'beta']);
});

test('Ronin Services on, or unstated, leaves RIREKI\'s dial alone — the recorder\'s own default', () => {
  assert.equal(newSessionArgs('beta', { argv: ['claude'], rireki: true }).includes('@ronin-rireki'), false);
  assert.equal(newSessionArgs('beta', { argv: ['claude'] }).includes('@ronin-rireki'), false);
});
