/**
 * THE CASCADE — `system < job_role < session_task < explicit launch`.
 *
 * These are the rules the owner ruled on 2026-08-22, asserted one at a time rather than
 * through the stock definitions, so a change to what the house ships can never quietly
 * change what the cascade MEANS. The stock combinations are checked separately, by
 * `scripts/check-catalogs.ts` and `tests/mcp-default.test.ts`.
 *
 * Four classes of field, and there is a test for each: cascading (the last layer to state
 * it wins), additive (posture), locked (`mcp: always`), inapplicable (`agent: none`).
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

test('absence inherits, and the last layer to state a field wins', async () => {
  const role = def('developer', { dial: 'write', permissions: 'default', lifecycle: 'coding', model: 'sonnet' });
  const task = def('CheckWork', { dial: 'read', opening: '{prompt}' });

  const both = resolveLaunchProfile(role, task);
  assert.equal(both.dial, 'read', 'the task states dial, so the task wins');
  assert.equal(both.permissions, 'default', 'the task is silent, so the role stands');
  assert.equal(both.lifecycle, 'coding', 'the task is silent, so the role stands');
  assert.equal(both.model, 'sonnet');

  const roleAlone = resolveLaunchProfile(role, undefined);
  assert.equal(roleAlone.dial, 'write', 'with no task, the role is the top layer');

  const taskAlone = resolveLaunchProfile(undefined, task);
  assert.equal(taskAlone.dial, 'read');
  assert.equal(taskAlone.permissions, 'default', 'the system default, with no role to state one');
  assert.equal(taskAlone.lifecycle, '', 'nothing states it, and the system says none');
  assert.equal(taskAlone.model, '', 'a bias nobody stated is no bias');
});

test('the system answers when both axes are blank, and blank is a legal launch', () => {
  const p = resolveLaunchProfile(undefined, undefined);
  assert.equal(p.job_role, '');
  assert.equal(p.session_task, '');
  assert.equal(p.dial, 'write');
  assert.equal(p.permissions, 'default');
  assert.equal(p.agent, true);
  assert.equal(p.ack, false);
  assert.equal(p.opening, '{prompt}');
  assert.equal(p.mcpDefault, false, 'an ordinary session is born with no MCP servers');
  assert.equal(p.capExempt, false);
  assert.equal(p.dir, '');
});

test('an explicit off overrides an inherited on — it is a value, not an absence', () => {
  const role = def('assistantish', { mcp: 'on' });
  const task = def('CutCode', { mcp: 'off' });
  assert.equal(resolveLaunchProfile(role, undefined).mcpDefault, true);
  assert.equal(resolveLaunchProfile(role, task).mcpDefault, false, 'the task states off, and off is a value');
  // And the other way round, so this is not an accident of which value is falsy.
  assert.equal(resolveLaunchProfile(def('r', { mcp: 'off' }), def('t', { mcp: 'on' })).mcpDefault, true);
});

test('posture is additive: the role is stated, then the task, and neither displaces the other', () => {
  const role = def('developer', { label: 'Developer', posture: 'You work on the owner’s code.' });
  const task = def('ChaseBug', { posture: 'Reproduce first.', opening: '{prompt}' });
  const p = resolveLaunchProfile(role, task);
  assert.deepEqual(p.posture, ['You work on the owner’s code.', 'Reproduce first.']);
  // WHO before WHAT, and the label names the durable half.
  assert.equal(p.label, 'Developer');
  assert.equal(resolveLaunchProfile(undefined, task).label, 'ChaseBug', 'with no role, the task names itself');
});

test('`mcp: always` is a lock — no layer may contradict it, and the message names both files', () => {
  const lock = def('personalassistant', { mcp: 'always' });
  assert.equal(resolveLaunchProfile(lock, undefined).mcpAlways, true);
  assert.equal(resolveLaunchProfile(lock, undefined).mcpDefault, true);

  assert.throws(
    () => resolveLaunchProfile(lock, def('CutCode', { mcp: 'off' })),
    (e: Error) => /born connected/.test(e.message)
      && e.message.includes('/definitions/personalassistant.md')
      && e.message.includes('/definitions/CutCode.md'),
  );
  // A task that AGREES is not a contradiction, and must not be refused.
  assert.equal(resolveLaunchProfile(lock, def('Ask', { mcp: 'always' })).mcpAlways, true);
});

test('`agent: none` voids a lower layer and REFUSES a higher one', () => {
  const role = def('developer', { dial: 'write', model: 'sonnet', permissions: 'bypass', opening: 'go: {prompt}', ack: 'yes' });
  const shell = def('OpenShell', { agent: 'none', dial: 'user' });

  // The role is BELOW the layer that declared agentless: it could not have known, so its
  // agent-only fields are dropped in silence. This is what lets OpenShell be shelved
  // anywhere without the shelf's ordinary defaults blowing it up.
  const p = resolveLaunchProfile(role, shell);
  assert.equal(p.agent, false);
  assert.equal(p.model, '');
  assert.equal(p.permissions, '');
  assert.equal(p.opening, '');
  assert.equal(p.ack, false);
  assert.deepEqual(p.posture, []);
  assert.equal(p.dial, 'user', 'a field that still means something for a terminal survives');

  // A layer AT OR ABOVE the declaring one is asserting an agent for a launch that has
  // none. That is a contradiction somebody wrote down, so it is refused by name.
  assert.throws(
    () => resolveLaunchProfile(def('terminalist', { agent: 'none' }), def('CutCode', { model: 'opus' })),
    (e: Error) => /launches no agent/.test(e.message) && e.message.includes('/definitions/CutCode.md'),
  );
  // Self-contradiction in one file is the same refusal.
  assert.throws(() => resolveLaunchProfile(undefined, def('Broken', { agent: 'none', model: 'opus' })), /launches no agent/);
});

test('`dir:` takes the install sentinel and nothing else', () => {
  assert.equal(resolveLaunchProfile(def('mikaassist', { dir: '{install}' }), undefined).dir, '{install}');
  assert.throws(
    () => resolveLaunchProfile(def('bad', { dir: '/home/someone/ronin' }), undefined),
    (e: Error) => /is not legal/.test(e.message) && e.message.includes('/definitions/bad.md'),
  );
});

test('cap and the remaining constants cascade like everything else', () => {
  assert.equal(resolveLaunchProfile(def('mikaassist', { cap: 'exempt' }), undefined).capExempt, true);
  assert.equal(resolveLaunchProfile(def('r', { cap: 'exempt' }), def('t', {})).capExempt, true);
  assert.equal(resolveLaunchProfile(undefined, undefined).capExempt, false);
  // `lifecycle: none` is how a definition says "no michi", and it resolves to blank
  // rather than to the literal word.
  assert.equal(resolveLaunchProfile(undefined, def('t', { lifecycle: 'none' })).lifecycle, '');
  assert.equal(resolveLaunchProfile(undefined, def('t', { ack: 'yes' })).ack, true);
  assert.equal(resolveLaunchProfile(def('r', { ack: 'yes' }), def('t', { ack: 'no' })).ack, false);
});
