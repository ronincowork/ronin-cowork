/**
 * THE RESOLUTION — `system < session_role definition < explicit launch`.
 *
 * ONE definition layer (R35, 2026-08-23): the old role_family layer was dismantled with
 * the session identity axis, so the resolver takes one definition and the system
 * answers underneath it. The rules are asserted one at a time rather than through the
 * stock definitions, so a change to what the house ships can never quietly change what
 * resolution MEANS. The stock set is checked separately, by `scripts/check-catalogs.ts`
 * and `tests/mcp-default.test.ts`.
 *
 * The team layer of the launch cascade is CONTEXT (root, repos, branch, reading), never
 * a definition field — it is resolved in `src/spawn.ts` and covered by
 * `tests/launch-parity.test.ts` and `tests/session-boot.test.ts`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLaunchProfile } from '../src/launch-profile.js';
import type { Definition } from '../src/definitions.js';

/**
 * A definition made of exactly the fields named — the point being that a key ABSENT from
 * the object is absent from the file, which is how "inherit" is spelled. An empty string
 * is deliberately supported and is NOT a statement: `has` reads it as silence, the same
 * way a half-written `- **mcp:**` line does.
 */
const def = (name: string, fields: Record<string, string>): Definition => ({
  name,
  origin: 'user',
  shadowed: false,
  file: `/definitions/${name}.md`,
  get: (k: string) => fields[k] ?? '',
  has: (k: string) => (fields[k] ?? '') !== '',
});

test('absence inherits from the system, and a stated field wins', async () => {
  const task = def('CheckWork', { dial: 'read', opening: '{prompt}' });
  const p = resolveLaunchProfile(task);
  assert.equal(p.dial, 'read', 'the definition states dial, so it wins');
  assert.equal(p.permissions, 'default', 'silence falls through to the system');
});

test('a definition has no model to state, and the resolver has none to report', () => {
  // Owner, 2026-08-29: the `model:` field and its resolution path are GONE, not merely
  // unused. A definition that writes one is writing prose — it reaches no profile field
  // and no `stated_by` reading, so nothing downstream can rank it above the owner's own
  // session default. The model's cascade is the owner's default, then this launch.
  const p = resolveLaunchProfile(def('CutCode', { model: 'sonnet', dial: 'write' }));
  assert.ok(!('model' in p), 'the profile carries no model reading');
  assert.ok(!('model' in p.stated_by), 'and attribution has no model row to answer for');
});

test('the system answers when the session_role is blank, and blank is a legal launch', () => {
  const p = resolveLaunchProfile(undefined);
  assert.equal(p.session_role, '');
  assert.equal(p.dial, 'write');
  assert.equal(p.permissions, 'default');
  assert.equal(p.agent, true);
  assert.equal(p.ack, false);
  assert.equal(p.opening, '{prompt}');
  assert.equal(p.mcpDefault, false, 'an ordinary session is born with no MCP servers');
  assert.equal(p.capExempt, false);
  assert.equal(p.dir, '');
});

test('an explicit off is a value, not an absence', () => {
  assert.equal(resolveLaunchProfile(def('t', { mcp: 'on' })).mcpDefault, true);
  assert.equal(resolveLaunchProfile(def('t', { mcp: 'off' })).mcpDefault, false, 'off is a value');
});

test('posture and label are the definition’s own', () => {
  const task = def('ChaseBug', { label: 'Chase bug', posture: 'Reproduce first.', opening: '{prompt}' });
  const p = resolveLaunchProfile(task);
  assert.deepEqual(p.posture, ['Reproduce first.']);
  assert.equal(p.label, 'Chase bug');
  assert.equal(resolveLaunchProfile(def('Bare', {}))?.label, 'Bare', 'no label means the token names itself');
});

test('`mcp: always` is a lock, and it opens the default on', () => {
  const lock = def('PersonalAssistant', { mcp: 'always' });
  assert.equal(resolveLaunchProfile(lock).mcpAlways, true);
  assert.equal(resolveLaunchProfile(lock).mcpDefault, true);
});

test('`agent: none` refuses agent-only fields stated beside it', () => {
  const shell = def('OpenShell', { agent: 'none', dial: 'user' });
  const p = resolveLaunchProfile(shell);
  assert.equal(p.agent, false);
  assert.equal(p.permissions, '');
  assert.equal(p.opening, '');
  assert.equal(p.ack, false);
  assert.deepEqual(p.posture, []);
  assert.equal(p.dial, 'user', 'a field that still means something for a terminal survives');

  // A definition asserting an agent field beside `agent: none` is a contradiction
  // somebody wrote down, so it is refused by name.
  assert.throws(
    () => resolveLaunchProfile(def('Broken', { agent: 'none', opening: 'go: {prompt}' })),
    (e: Error) => /launches no agent/.test(e.message) && e.message.includes('/definitions/Broken.md'),
  );
});

test('`dir:` takes the install sentinel and nothing else', () => {
  assert.equal(resolveLaunchProfile(def('MikaAssist', { dir: '{install}' })).dir, '{install}');
  assert.throws(
    () => resolveLaunchProfile(def('bad', { dir: '/home/someone/ronin' })),
    (e: Error) => /is not legal/.test(e.message) && e.message.includes('/definitions/bad.md'),
  );
});

test('cap and the remaining constants resolve like everything else', () => {
  assert.equal(resolveLaunchProfile(def('MikaAssist', { cap: 'exempt' })).capExempt, true);
  assert.equal(resolveLaunchProfile(undefined).capExempt, false);
  assert.equal(resolveLaunchProfile(def('t', { ack: 'yes' })).ack, true);
  assert.equal(resolveLaunchProfile(def('t', { ack: 'no' })).ack, false);
});
