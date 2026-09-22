/**
 * BINDING A LAUNCH TO ITS CONVERSATION — the one processor every CLI goes through.
 *
 * WHY THIS TEST EXISTS. The transcript route must be able to say which journal belongs to
 * which pane. Two earlier answers were wrong and were caught in review: a caller-supplied
 * working directory (any page could ask for any path), and then the session's
 * `project_root` (which nearly every session on a project shares, so two live agents
 * matched the same journal and could be served each other's conversation).
 *
 * The only honest moment to bind is the moment the command is built, because that is the
 * last point at which Ronin can DECIDE the answer rather than infer it afterwards. So the
 * invariants asserted here are about refusing to guess as much as about stamping:
 *
 *   - `claude` gets an assigned id, so the journal filename is known before the process
 *     starts.
 *   - a command that already names a conversation is left exactly as written — Ronin never
 *     overrides an explicit resume.
 *   - `codex` is NOT stamped, and says why. It mints its own id; a flag it does not accept
 *     would break the launch, and an invented binding would be the same guess in a new
 *     place.
 *   - an unrecognised CLI is left alone. Appending a flag to a command we do not
 *     understand is a worse failure than leaving it unbound.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { stampProviderSession } from '../src/launch-binding.js';

const FIXED = '11111111-2222-3333-4444-555555555555';
const id = () => FIXED;

test('claude is assigned a session id at launch, so the journal is known before it is written', () => {
  const out = stampProviderSession('claude --model opus', 'claude', id);
  assert.equal(out.cmd, `claude --model opus --session-id ${FIXED}`);
  assert.equal(out.providerSession, FIXED);
});

test('a command that already names its conversation is left exactly as written', () => {
  for (const cmd of [
    `claude --session-id ${FIXED}`,
    `claude --resume ${FIXED}`,
    `codex resume ${FIXED}`,
  ]) {
    const out = stampProviderSession(cmd, cmd.startsWith('codex') ? 'codex' : 'claude', id);
    assert.equal(out.cmd, cmd, 'the command must not be rewritten');
    assert.equal(out.providerSession, FIXED, 'the named conversation is the binding');
  }
});

test('codex is not stamped, and the reason is recorded rather than implied', () => {
  const out = stampProviderSession('codex --model gpt', 'codex', id);
  assert.equal(out.cmd, 'codex --model gpt', 'codex takes no assigned id; the command must be untouched');
  assert.equal(out.providerSession, undefined, 'unbound, not guessed');
  assert.match(out.note, /cannot be given one at launch/);
});

test('an unrecognised CLI is left alone rather than handed a flag it may not accept', () => {
  const out = stampProviderSession('grok', 'grok', id);
  assert.equal(out.cmd, 'grok');
  assert.equal(out.providerSession, undefined);
  assert.match(out.note, /no binding known/);
});

test('an empty command binds nothing and does not invent one', () => {
  const out = stampProviderSession('', 'claude', id);
  assert.equal(out.cmd, '');
  assert.equal(out.providerSession, undefined);
});

test('each claude launch gets its own id — two sessions can never collide', () => {
  const a = stampProviderSession('claude', 'claude');
  const b = stampProviderSession('claude', 'claude');
  assert.ok(a.providerSession && b.providerSession);
  assert.notEqual(a.providerSession, b.providerSession);
});
