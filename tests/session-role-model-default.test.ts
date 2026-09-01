/**
 * THE OWNER'S SESSION DEFAULT IS THE DEFAULT — and a session_role may not move it.
 *
 * Owner's ruling, 2026-08-29: session roles carry no automatic model preference. Every
 * stock definition used to state `- **model:** …`, `src/launch-profile.ts` cascaded it,
 * and `src/spawn.ts` resolved it into a command that outranked `agents.sessions.default`.
 * Two failures came out of that, and this file is the regression for both:
 *
 *  1. THE DEFAULT WAS SILENTLY OVERRIDDEN. The owner sets one model for new sessions, in
 *     one place, and a catalog file the owner never edited won instead.
 *  2. THE PROVIDER WAS SWITCHED. The bias was matched by model NAME against the launch
 *     table, preferring the default provider's row and then ANY row. So `CutCode`'s
 *     `sonnet` — a name only Anthropic's table carries — moved an OpenAI-default box
 *     onto Anthropic. That is the sharper defect: not the wrong model, the wrong vendor,
 *     the wrong account, and the wrong bill.
 *
 * The launch table used here is the SHIPPED one (`ronin_catalogs/PROJECT_ROOTS.md`),
 * because a stock role biasing toward a stock table row is the exact failure. Only the
 * owner-scope halves are redirected — no tmux, no socket, no live store.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-role-model-test-'));
const catalogs = path.join(temp, 'catalogs');
await fs.mkdir(catalogs, { recursive: true });
// The owner's own root list. The launch TABLE is not overridden here: a user-scope
// PROJECT_ROOTS.md shadows the roots, and the shipped provider tables still answer.
await fs.writeFile(
  path.join(catalogs, 'PROJECT_ROOTS.md'),
  ['# PROJECT_ROOTS — yours', '', '## alpha', `- **dir:** ${temp}`, '- **remit:** the only root', ''].join('\n'),
);
process.env.RONIN_CATALOGS_DIR = catalogs;
process.env.RONIN_SESSION_BOOT_DIR = path.join(temp, 'shelf');
process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
process.env.RONIN_CONFIG_DIR = path.join(temp, 'config');
process.env.RONIN_LEDGER_DIR = path.join(temp, 'ledger');
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(temp, 'team_rosters');
await fs.mkdir(path.join(temp, 'config'), { recursive: true });

/** The one setting that decides what a new Agent launches as. */
async function sessionDefault(provider: string, model: string): Promise<void> {
  await fs.writeFile(
    path.join(temp, 'config', 'ronin.json'),
    JSON.stringify({ agents: { sessions: { default: { provider, model } } } }),
  );
}

const { resolveForm } = await import('../src/spawn.js');
type SpawnForm = import('../src/spawn.js').SpawnForm;

/**
 * A plain CutCode launch: the role that used to state `model: sonnet`.
 *
 * Every assertion below matches the cmd by PREFIX, because a launch resolving the brain
 * disconnected has the provider's own `gbrain_disconnected` tokens appended to the cell — the mechanism's
 * business, and not what this file is about. The prefix is the whole claim: which
 * provider, and which model.
 */
const cutCode = (over: Partial<SpawnForm> = {}): SpawnForm => ({
  session_role: 'CutCode',
  project_root: 'alpha',
  prompt: 'Cut the leg in the plan doc.',
  ...over,
});

test('a CutCode launch naming no model is born on the OpenAI default, and does not change provider', async () => {
  await sessionDefault('openai', 'gpt-5.6-sol');
  const r = await resolveForm(cutCode(), new Set());
  assert.equal(r.session_role, 'CutCode');
  // The exact cell from the shipped OpenAI table — the owner's stated default, resolved
  // through the launch table rather than through any catalog definition.
  assert.match(r.cmd, /^codex --model gpt-5\.6-sol\b/, `expected the owner's default, got "${r.cmd}"`);
  // THE PROVIDER DEFENCE, stated on its own so it cannot be lost in a cmd rewrite: no
  // Anthropic CLI, and none of the Anthropic model names a role used to bias toward.
  assert.doesNotMatch(r.cmd, /claude/, 'a session_role may not move an OpenAI box to Anthropic');
  assert.doesNotMatch(r.cmd, /\b(sonnet|opus|fable|haiku)\b/, 'and may not name an Anthropic model');
  // Attribution must say the same thing the launch did: nobody stated the command, so
  // the system answers. A definition file appearing here is the bias coming back.
  assert.deepEqual(r.stated_by.cmd, [{ layer: 'system', source: 'src/spawn.ts' }]);
  assert.ok(!('model' in r.stated_by), 'there is no model reading to attribute');
});

test('the same launch on an Anthropic default lands on the Anthropic default, not on `sonnet`', async () => {
  // The mirror case, and the one that proves the first is not passing by accident: with
  // Anthropic configured, CutCode still gets the OWNER's model. Its retired bias was
  // `sonnet`; the configured default here is `opus`, so a bias would be visible.
  await sessionDefault('anthropic', 'opus');
  const r = await resolveForm(cutCode(), new Set());
  assert.ok(r.cmd.startsWith('claude --model opus'), `expected the owner's default, got "${r.cmd}"`);
  assert.doesNotMatch(r.cmd, /sonnet/, 'the role no longer states a model, so nothing biases one');
});

test('every stock session_role resolves to the same command — the role never decides it', async () => {
  // The general form of the ruling. If any shipped definition regrows a `model:` that the
  // resolver honours, exactly one of these rows will differ from the rest.
  await sessionDefault('openai', 'gpt-5.6-terra');
  const { readDefinitions } = await import('../src/definitions.js');
  const roles = await readDefinitions('session_roles');
  const agentRoles = roles.filter((d) => !/^none$/i.test(d.get('agent')));
  assert.ok(agentRoles.length >= 5, 'the stock shelf is populated, so this proves something');
  for (const role of agentRoles) {
    const r = await resolveForm(cutCode({ session_role: role.name }), new Set());
    assert.ok(
      r.cmd.startsWith('codex --model gpt-5.6-terra'),
      `${role.name} (${role.file}) must not choose a model — got "${r.cmd}"`,
    );
  }
});

test('an explicit model on the launch still wins, and that is the only thing that does', async () => {
  await sessionDefault('openai', 'gpt-5.6-sol');
  // By NAME — the ＋ New form's model field.
  const named = await resolveForm(cutCode({ model: 'opus' }), new Set());
  assert.ok(named.cmd.startsWith('claude --model opus'), `the owner named it, got "${named.cmd}"`);
  assert.deepEqual(named.stated_by.cmd, [{ layer: 'launch', source: 'launch request' }]);
  // By CMD — a whole cell from the launch table.
  const cmd = await resolveForm(cutCode({ cmd: 'claude --model haiku' }), new Set());
  assert.ok(cmd.cmd.startsWith('claude --model haiku'), `explicit cmd must lead, got "${cmd.cmd}"`);
  assert.deepEqual(cmd.stated_by.cmd, [{ layer: 'launch', source: 'launch request' }]);
});
