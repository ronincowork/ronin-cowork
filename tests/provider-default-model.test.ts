/**
 * "GIVE ME ANTHROPIC" — a launch may name a provider without naming a model.
 *
 * Owner's ruling, 2026-08-29: *"if you start a session and you say, give me Anthropic,
 * but our default is OpenAI, it will give you Anthropic's default model."* Before this
 * there was no such thing as a provider's default. The install had exactly one default,
 * `agents.sessions.default`, which names a provider AND a model together — so a launch
 * could name a MODEL (and get its provider by implication) or a whole COMMAND, but had
 * no way to say "whichever model I prefer from this vendor". Naming the vendor meant
 * naming one of its models, which is the thing the owner did not want to have to know.
 *
 * So ⚙ Configuration grows one row per provider the launch table carries, landing at
 * `agents.sessions.by_provider.<provider>`, and `resolveForm` reads it for a launch that
 * names a provider and no model. This file is that path, end to end.
 *
 * The shipped launch table is used deliberately (`ronin_catalogs/PROJECT_ROOTS.md`):
 * "anthropic's first column" has to mean the real table, or the fallback is untested.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-provider-test-'));
const catalogs = path.join(temp, 'catalogs');
await fs.mkdir(catalogs, { recursive: true });
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
process.env.RONIN_CAMPAIGNS_DIR = path.join(temp, 'campaigns');
await fs.mkdir(path.join(temp, 'config'), { recursive: true });

/** The whole `agents` section as the owner's file would hold it. */
async function agents(sessions: Record<string, unknown>): Promise<void> {
  await fs.writeFile(path.join(temp, 'config', 'ronin.json'), JSON.stringify({ agents: { sessions } }));
}

const { resolveForm } = await import('../src/spawn.js');
type SpawnForm = import('../src/spawn.js').SpawnForm;

const launch = (over: Partial<SpawnForm> = {}): SpawnForm => ({
  session_role: 'CutCode',
  project_root: 'alpha',
  prompt: 'Cut the leg in the plan doc.',
  ...over,
});

test('the three ways an agent may ask, against one configuration', async () => {
  // Owner, 2026-08-29 — the agent-facing door has exactly three entry points, and the
  // first is saying nothing. An agent must pass only as much as the owner actually said;
  // inventing the next field down is the agent deciding something left open. Each case is
  // proven on its own below — this states them together, because the CONTRACT is that
  // they are three answers to one question and it is the shape that must not drift.
  await agents({
    default: { provider: 'openai', model: 'gpt-5.6-sol' },
    by_provider: { anthropic: 'fable', openai: 'gpt-5.6-terra' },
  });
  //  "give me an agent to do XYZ"  -> the install default, vendor and model both
  const lazy = await resolveForm(launch(), new Set());
  assert.ok(lazy.cmd.startsWith('codex --model gpt-5.6-sol'), `lazy: got "${lazy.cmd}"`);
  //  "give me an Anthropic agent"  -> that vendor's preferred model
  const vendor = await resolveForm(launch({ provider: 'anthropic' }), new Set());
  assert.ok(vendor.cmd.startsWith('claude --model fable'), `vendor: got "${vendor.cmd}"`);
  //  "open a fable five session"   -> that model
  const named = await resolveForm(launch({ model: 'opus' }), new Set());
  assert.ok(named.cmd.startsWith('claude --model opus'), `named: got "${named.cmd}"`);
  // Three different commands from three different asks — if any two of these ever agree,
  // one layer has started answering a question it was not asked.
  assert.equal(new Set([lazy.cmd, vendor.cmd, named.cmd]).size, 3);
});

test('Campaign Agent defaults answer before install defaults, and an explicit ask still wins', async () => {
  await agents({
    default: { provider: 'openai', model: 'gpt-5.6-sol' },
    by_provider: { anthropic: 'fable' },
  });
  await fs.mkdir(path.join(temp, 'campaigns'), { recursive: true });
  await fs.writeFile(path.join(temp, 'campaigns', 'work.json'), JSON.stringify({
    title: 'Work',
    config: { agent_defaults: { provider: 'anthropic' } },
  }));
  const inherited = await resolveForm(launch({ campaign_id: 'work' }), new Set());
  assert.ok(inherited.cmd.startsWith('claude --model fable'), inherited.cmd);
  const explicit = await resolveForm(launch({ campaign_id: 'work', model: 'gpt-5.6-terra' }), new Set());
  assert.ok(explicit.cmd.startsWith('codex --model gpt-5.6-terra'), explicit.cmd);
});

test("the owner's scenario: default is OpenAI, the launch says anthropic, and it gets anthropic's preferred model", async () => {
  await agents({
    default: { provider: 'openai', model: 'gpt-5.6-sol' },
    by_provider: { anthropic: 'fable', openai: 'gpt-5.6-terra' },
  });
  const r = await resolveForm(launch({ provider: 'anthropic' }), new Set());
  assert.ok(r.cmd.startsWith('claude --model fable'), `expected anthropic's preference, got "${r.cmd}"`);
  // The install default is NOT what answered — that is the whole point of the ruling.
  assert.doesNotMatch(r.cmd, /codex|gpt-5\.6-sol/, 'naming a provider must beat the install default');
  // And it is attributed to the owner's configuration, not to this file's fallbacks:
  // the provider was the launch's word, the model was ⚙'s.
  assert.deepEqual(r.stated_by.cmd, [{ layer: 'system', source: '⚙ Configuration (agents.sessions)' }]);
});

test('a provider with no preference set falls back to its first column in the launch table', async () => {
  await agents({ default: { provider: 'openai', model: 'gpt-5.6-terra' }, by_provider: {} });
  // Anthropic's first column in ronin_catalogs/PROJECT_ROOTS.md is `opus`. The fallback
  // is what makes the setting optional rather than a thing you must fill in before the
  // feature works at all.
  const r = await resolveForm(launch({ provider: 'anthropic' }), new Set());
  assert.ok(r.cmd.startsWith('claude --model opus'), `expected the first column, got "${r.cmd}"`);
  // Nobody stated the model, so it reads as the system's answer, not the owner's.
  assert.deepEqual(r.stated_by.cmd, [{ layer: 'system', source: 'src/spawn.ts' }]);
  // An explicit null is the same as absent: the owner cleared the row, they did not
  // express a preference.
  await agents({ default: { provider: 'openai', model: 'gpt-5.6-terra' }, by_provider: { anthropic: null } });
  const cleared = await resolveForm(launch({ provider: 'anthropic' }), new Set());
  assert.ok(cleared.cmd.startsWith('claude --model opus'), `cleared must fall back too, got "${cleared.cmd}"`);
});

test('naming no provider still lands on the install default — the general default is untouched', async () => {
  await agents({
    default: { provider: 'openai', model: 'gpt-5.6-sol' },
    by_provider: { anthropic: 'fable', openai: 'gpt-5.6-terra' },
  });
  const r = await resolveForm(launch(), new Set());
  // NOT openai's per-provider preference (`gpt-5.6-terra`): a launch that named nothing
  // gets the one general default, exactly as before. The per-provider map answers a
  // question this launch did not ask.
  assert.ok(r.cmd.startsWith('codex --model gpt-5.6-sol'), `expected the general default, got "${r.cmd}"`);
});

test('a provider narrows an explicit model rather than competing with it', async () => {
  await agents({ default: { provider: 'openai', model: 'gpt-5.6-sol' }, by_provider: { anthropic: 'fable' } });
  // Both named: the pair must be a real cell, and the model wins over the preference.
  const r = await resolveForm(launch({ provider: 'anthropic', model: 'haiku' }), new Set());
  assert.ok(r.cmd.startsWith('claude --model haiku'), `expected the named pair, got "${r.cmd}"`);
  assert.deepEqual(r.stated_by.cmd, [{ layer: 'explicit_launch', source: 'launch request' }]);
  // A model that provider does not offer is refused, and the message names what it does
  // offer — not the whole table, which would be a list the caller cannot act on.
  await assert.rejects(
    () => resolveForm(launch({ provider: 'anthropic', model: 'gpt-5.6-sol' }), new Set()),
    (e: Error) => /anthropic offers/.test(e.message) && /opus/.test(e.message) && !/codex/.test(e.message),
  );
});

test('an unknown provider is refused by name, and a provider beside a cmd is a contradiction', async () => {
  await agents({ default: { provider: 'openai', model: 'gpt-5.6-sol' }, by_provider: {} });
  await assert.rejects(
    () => resolveForm(launch({ provider: 'mistral' }), new Set()),
    (e: Error) => /Unknown provider "mistral"/.test(e.message) && /anthropic/.test(e.message),
  );
  // A cmd already says whose CLI it runs, so naming a provider too is somebody asserting
  // two answers — refused rather than ranked, exactly as `model` + `cmd` is.
  await assert.rejects(
    () => resolveForm(launch({ provider: 'anthropic', cmd: 'codex --model gpt-5.6-sol' }), new Set()),
    /provider OR a cmd/,
  );
});

test('an agentless launch takes no provider resolution at all', async () => {
  await agents({ default: { provider: 'openai', model: 'gpt-5.6-sol' }, by_provider: { anthropic: 'fable' } });
  // `OpenShell` is `agent: none` — there is no CLI, so there is nothing for a provider
  // to choose between and no command to build.
  const r = await resolveForm(launch({ session_role: 'OpenShell', provider: 'anthropic' }), new Set());
  assert.equal(r.agent, false);
  assert.equal(r.cmd, '', 'a terminal launches nothing, whatever provider was named');
});
