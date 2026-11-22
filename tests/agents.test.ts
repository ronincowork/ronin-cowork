/**
 * Launch an Agent, archive it, restore it: the path every user takes first.
 * A real Ronin on a private tmux server; the provider CLIs are stubs that record how they
 * were started (tests/helpers/ronin.ts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { bootRonin, until, ROOT } from './helpers/ronin.js';

const ronin = await bootRonin('agents');
test.after(() => ronin.stop());

const sessions = async () => (await ronin.api('/api/sessions')).body as Array<{ name: string; key: string; agent: string; identity?: { provider: string } }>;
const onServer = async () => (await ronin.tmux.run('list-sessions', '-F', '#{session_name}')).split('\n').filter(Boolean);

test('an Agent launches: its CLI starts with its brief, Ronin\'s tools on PATH and its own temp', async () => {
  const launched = await ronin.api('/api/launch', { body: { name: 'ana', provider: 'anthropic', prompt: 'Look at the shop.' } });
  assert.equal(launched.status, 200, JSON.stringify(launched.body));
  assert.equal(launched.body.name, 'ana');

  const [run] = await until(ronin.cliRuns, 'the CLI to start');
  assert.match(run.argv, /^claude /);
  const brief = /Read first: (\S+AGENT_BIRTH_BRIEF\.md)/.exec(run.argv)?.[1];
  assert.ok(brief, run.argv);
  const text = await fs.readFile(brief, 'utf8');
  assert.match(text, /— end of packet for ana —/);
  assert.ok(!text.includes('### Helpful Assistant'), 'an ordinary Agent is not told the Helpful Assistant (KAN-708)');
  assert.ok(brief.startsWith(ronin.scratch), 'the brief is in the private data root');

  const PATH = run.env.PATH.split(':');
  assert.ok(PATH.includes(path.join(ROOT, 'ronin_bin')), 'Ronin\'s tools are on the Agent\'s PATH');
  assert.equal(run.env.RONIN_SOCKET, ronin.socket, 'the Agent is told the operator socket');
  assert.ok(run.env.TMPDIR && run.env.TMPDIR !== ronin.env.TMPDIR, `its temp is its own: ${run.env.TMPDIR}`);
  assert.equal(run.env.CLAUDE_CODE_TMPDIR, run.env.TMPDIR, 'and the CLI is told it');
  assert.ok((await fs.stat(run.env.TMPDIR)).isDirectory());

  const listed = (await sessions()).find((s) => s.name === 'ana');
  assert.equal(listed?.agent, 'claude');
  assert.equal(listed?.identity?.provider, 'anthropic');
});

test('Ronin lists exactly the sessions on its own tmux server', async () => {
  assert.deepEqual((await sessions()).map((s) => s.name).sort(), (await onServer()).filter((n) => n !== 'grid_ctl').sort());
});

test('a Codex Agent launches its own CLI', async () => {
  const launched = await ronin.api('/api/launch', { body: { name: 'cody', provider: 'openai', prompt: 'Hello.' } });
  assert.equal(launched.status, 200, JSON.stringify(launched.body));
  const runs = await until(async () => (await ronin.cliRuns()).filter((r) => r.argv.startsWith('codex ')).length && ronin.cliRuns(), 'codex to start');
  assert.ok(runs.some((r) => r.argv.startsWith('codex ')));
});

test('a stock behaviour told only when added: the Helpful Assistant in full; the user\'s own file replaces it whole (KAN-708)', async () => {
  const told = async (name: string): Promise<string> => {
    const before = (await ronin.cliRuns()).length;
    const launched = await ronin.api('/api/launch', { body: { name, provider: 'anthropic', prompt: 'Hello.', brief: { add: [{ name: 'irasshai', depth: 'full' }] } } });
    assert.equal(launched.status, 200, JSON.stringify(launched.body));
    const runs = await until(async () => { const r = await ronin.cliRuns(); return r.length > before && r; }, `${name}'s CLI`);
    const brief = /Read first: (\S+AGENT_BIRTH_BRIEF\.md)/.exec(runs.at(-1)!.argv)![1];
    return fs.readFile(brief, 'utf8');
  };
  const stock = await fs.readFile(path.join(ROOT, 'ronin_stock', 'behaviours', 'irasshai.md'), 'utf8');
  const first = stock.split('\n\n')[1].split('\n')[0];
  const text = await told('helper');
  assert.ok(text.includes('### Helpful Assistant') && text.includes(first), 'added: the stock text, in full');
  const own = path.join(ronin.env.RONIN_USER_ROOT!, 'custom', 'behaviours', 'irasshai.md');
  await fs.mkdir(path.dirname(own), { recursive: true });
  await fs.writeFile(own, '# Helpful Assistant\n- **seed:** the owner\'s own\n- **depth:** none\n\nThe owner\'s own words.\n');
  const shadowed = await told('helper2');
  assert.ok(shadowed.includes('The owner\'s own words.') && !shadowed.includes(first), 'the user\'s file wins whole');
  await fs.rm(own);
});

test('a terminal launches with no Agent CLI', async () => {
  const before = (await ronin.cliRuns()).length;
  const launched = await ronin.api('/api/launch', { body: { session_type: 'terminal', name: 'term' } });
  assert.equal(launched.status, 200, JSON.stringify(launched.body));
  assert.ok((await onServer()).includes('term'));
  assert.equal((await sessions()).find((s) => s.name === 'term')?.agent, '');
  assert.equal((await ronin.cliRuns()).length, before);
});

test('a launch with no name, a bad name or a taken name is refused and starts nothing', async () => {
  const before = await onServer();
  for (const body of [{ provider: 'anthropic' }, { name: 'two words', provider: 'anthropic' }, { name: 'ana', provider: 'anthropic' }]) {
    const refused = await ronin.api('/api/launch', { body });
    assert.ok(refused.status >= 400, `${JSON.stringify(body)} → ${refused.status}`);
  }
  assert.deepEqual(await onServer(), before);
});

test('archive stops the Agent; restore resumes the same conversation under the same name', async () => {
  const key = (await sessions()).find((s) => s.name === 'ana')!.key;
  const sessionId = /--session-id (\S+)/.exec((await ronin.cliRuns())[0].argv)?.[1];
  assert.ok(sessionId, 'the launch names its provider conversation');

  const archived = await ronin.api('/api/sessions/ana/archive', { body: {} });
  assert.equal(archived.status, 200, JSON.stringify(archived.body));
  assert.ok(!(await onServer()).includes('ana'), 'the session is stopped');
  const shelf = (await ronin.api('/api/archived-sessions')).body as Array<{ id: string; name: string }>;
  const entry = shelf.find((a) => a.name === 'ana');
  assert.ok(entry);

  const runsBefore = (await ronin.cliRuns()).length;
  const restored = await ronin.api(`/api/archived-sessions/${entry.id}/rehydrate`, { body: {} });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  const runs = await until(async () => { const r = await ronin.cliRuns(); return r.length > runsBefore && r; }, 'the restored CLI');
  const resumed = runs.at(-1)!;
  assert.match(resumed.argv, new RegExp(`--resume ${sessionId}`));
  assert.ok(resumed.env.PATH.split(':').includes(path.join(ROOT, 'ronin_bin')), 'a restore gets the launch environment');
  assert.equal((await sessions()).find((s) => s.name === 'ana')?.key, key, 'same session key');
  assert.ok(!((await ronin.api('/api/archived-sessions')).body as Array<{ name: string }>).some((a) => a.name === 'ana'), 'off the shelf');
});
