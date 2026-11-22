/**
 * Setup and Help on a fresh box: Ronin answers health, Setup sees the provider CLIs, a
 * sign-in is noticed, the person's words are kept, and Help (Mika) launches once a provider
 * is signed in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { bootRonin, until } from './helpers/ronin.js';

const ronin = await bootRonin('setup');
test.after(() => ronin.stop());
type Provider = { id: string; installed: boolean; signed_in: boolean };
const provider = (body: { providers: Provider[] }, id: string) => body.providers.find((p) => p.id === id)!;

test('a fresh box answers health, the page, and an unanswered Setup', async () => {
  const health = await ronin.api('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  const page = await fetch(`${ronin.base}/`, { headers: { accept: 'text/html' } });
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') ?? '', /html/);
  // The ticks are the facts' (KAN-768): no provider is Activated on a fresh box, and nobody registered.
  const progress = (await ronin.api('/api/setup/progress')).body as { steps: Array<{ id: string; answered: boolean }> };
  assert.equal(progress.steps.find((s) => s.id === 'provider')?.answered, false);
  assert.equal(progress.steps.find((s) => s.id === 'register')?.answered, false);
});

test('Setup sees the installed CLIs, not yet signed in; Help will not start and says why', async () => {
  // The runtime answer reads only what is recorded; Ronin's start measures and records (Refresh all).
  await until(async () => (await ronin.api('/api/setup/runtime')).body.providers?.find((p: Provider) => p.id === 'claude')?.installed, 'the start measure', 30_000);
  const before = (await ronin.api('/api/setup/runtime')).body;
  assert.ok(before.providers, JSON.stringify(before).slice(0, 400));
  assert.equal(provider(before, 'claude').installed, true);
  assert.equal(provider(before, 'claude').signed_in, false);
  const refused = await ronin.api('/api/mika', { body: {} });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'mika_no_ready_provider');
});

test('a sign-in is noticed on refresh', async () => {
  await fs.mkdir(path.join(ronin.env.HOME!, '.claude'), { recursive: true });
  await fs.writeFile(path.join(ronin.env.HOME!, '.claude', '.credentials.json'), '{}');
  const after = (await ronin.api('/api/setup/providers/refresh', { body: {} })).body;
  assert.equal(provider(after, 'claude').signed_in, true);
});

test('the person\'s own words are kept and read back', async () => {
  const intro = 'I run a small bike shop and want help with the website.';
  assert.equal((await ronin.api('/api/setup/user-intro', { method: 'PUT', body: { intro } })).status, 200);
  assert.equal((await ronin.api('/api/setup/user-intro')).body.intro.trim(), intro);
});

test('checking out LIBRARY-1 makes its epic and tasks as plain live items held by the Agent (KAN-767)', async () => {
  await ronin.api('/api/launch', { body: { name: 'guide', provider: 'anthropic', prompt: 'Welcome them.' } });
  const asGuide = { TMUX_PANE: await ronin.tmux.run('display-message', '-p', '-t', '=guide:', '#{pane_id}') };
  const library = (await ronin.api('/api/work-items/LIBRARY-1')).body as { item: { title: string }; children: Array<{ title: string; objective: string }> };
  assert.ok(library.children?.length, 'the stock onboarding item is in the library');
  // Setup's selector: a pill opens what its task's Open line names (KAN-696).
  assert.ok(library.children.some((task) => /^Open:\s*`setup\.providers`/m.test(task.objective)), 'an Open line is read from the file');
  assert.ok(((await ronin.api('/api/work-items?library=1')).body.items as Array<{ id: string }>).some((one) => one.id === 'LIBRARY-1'), 'search --library lists it');

  const out = await ronin.tool('item', ['checkout', 'LIBRARY-1'], { env: asGuide });
  assert.equal(out.status, 0, out.stderr);
  const epic = /\bas (w\d+)\b/.exec(out.stdout)?.[1];
  assert.ok(epic, out.stdout);
  const tasks = await until(async () => { const now = ((await ronin.api(`/api/work-items/${epic}`)).body.children ?? []) as Array<{ id: string; title: string; status: string }>; return now.length && now; }, 'the copy has its tasks');
  assert.deepEqual(tasks.map((t) => t.title), library.children.map((t) => t.title), 'its tasks, in order');
  for (const task of tasks) {
    assert.equal(task.status, 'To Do');
    assert.deepEqual((await ronin.api(`/api/work-items/${task.id}`)).body.held_by, ['agent:guide']);
  }
});

test('Help (Mika) launches on the signed-in provider with her brief', async () => {
  const launched = await ronin.api('/api/mika', { body: {} });
  assert.equal(launched.status, 200, JSON.stringify(launched.body));
  const name = launched.body.name as string;
  assert.ok((await ronin.tmux.run('list-sessions', '-F', '#{session_name}')).split('\n').includes(name));
  await until(async () => (await ronin.cliRuns()).find((r) => r.argv.startsWith('claude ') && /Mika/.test(r.argv)), 'Mika\'s CLI');
  const sessions = path.join(ronin.scratch, 'data', 'sessions');
  const folder = (await fs.readdir(sessions)).find((f) => f.startsWith(`${name}-`));
  assert.ok(folder, `Mika's session folder under ${sessions}`);
  const brief = await fs.readFile(path.join(sessions, folder, 'AGENT_BIRTH_BRIEF.md'), 'utf8');
  assert.match(brief, /Setup/);
  assert.match(brief, /Know the rig[\s\S]*office read/);
});
