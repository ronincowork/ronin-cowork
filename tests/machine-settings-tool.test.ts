import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');

const campaign = {
  id: 'selected', title: 'Selected', description: 'Exact session Campaign', state: 'active',
  config: {
    installations: { ronin_services: false, gbrain: true, trello: false },
    defaults: { provider: 'dynamic', model: 'runtime-choice', behaviours: ['gbrain'], reach: 'plan', recruit: 'propose agents', output: ['code'], dial: 'write', launch_mode: 'configured' },
    cowork_defaults: { project_root: 'old', repos: ['old'] },
  },
  providers: { measured_at: 'now', providers: [{ id: 'dynamic', installed: true }] },
};

async function fixture() {
  const requests: Array<{ method: string; url: string; body: unknown }> = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      requests.push({ method: req.method ?? '', url: req.url ?? '', body: raw ? JSON.parse(raw) : null });
      res.setHeader('content-type', 'application/json');
      const answer = (value: unknown) => res.end(JSON.stringify(value));
      if (req.method === 'GET' && req.url === '/api/sessions') return answer([
        { name: 'other', campaign_id: 'home_machine' },
        { name: 'worker', campaign_id: 'selected' },
      ]);
      if (req.method === 'GET' && req.url === '/api/campaigns/selected') return answer(campaign);
      if (req.method === 'PUT' && req.url === '/api/campaigns/selected') return answer({ ...campaign, ...(raw ? JSON.parse(raw) : {}) });
      if (req.method === 'POST' && req.url === '/api/campaigns/selected/archive') return answer({ ...campaign, state: 'archived' });
      if (req.method === 'GET' && req.url === '/api/machine-settings') return answer({
        set: { machine: { name: 'box' }, owner: { name: 'Owner' }, agents: { sessions: { default: { provider: 'dynamic', model: 'runtime-choice' } } }, wanted: [] },
        observed: { machine: { host: 'host', ram_gb: 16 } }, status: { session_max: 4 }, needed: [], schema: {},
      });
      if (req.method === 'PATCH' && req.url === '/api/machine-settings') return answer({ ok: true });
      if (req.method === 'GET' && req.url === '/api/installations') return answer([
        { name: 'ronin_services', label: 'Ronin Services', provides: [], requires: [] },
        { name: 'gbrain', label: 'gbrain', provides: ['gbrain'], requires: [] },
        { name: 'trello', label: 'Trello', provides: ['trello'], requires: ['ronin_services'] },
      ]);
      if (req.method === 'GET' && req.url === '/api/installed') return answer({
        cowork: { commit: 'abc' }, services: { installed: true, activated: false, stage: 'not_requested', loaded: [], parked: [{ name: 'koshi' }], restart_needed: false },
      });
      if (req.method === 'GET' && req.url === '/api/provider-catalog') return answer({ providers: [{ provider: 'Dynamic', cli: 'dynamic', models: [{ model: 'runtime-choice' }] }] });
      if (req.method === 'GET' && req.url === '/api/project-roots/detail?campaign_id=selected') return answer({ roots: [{ name: 'repo', campaign_id: 'selected' }], untagged: 0 });
      if (req.method === 'POST' && req.url === '/api/project-roots') {
        if (raw && JSON.parse(raw).name === 'reject') return answer({ error: 'invalid repository profile' });
        return answer({ ok: true });
      }
      if (req.method === 'DELETE' && req.url === '/api/project-roots/repo') return answer({ ok: true });
      res.statusCode = 404;
      answer({ error: `unexpected ${req.method} ${req.url}` });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const run = async (args: string[], extra: Record<string, string> = {}) => {
    try {
      const result = await exec(path.join(root, 'ronin_bin', 'machine-settings'), args, {
        env: { ...process.env, RONIN_URL: `http://127.0.0.1:${address.port}`, RONIN_SESSION: 'worker', ...extra },
      });
      return { code: 0, output: result.stdout, error: result.stderr };
    } catch (error) {
      const e = error as { code?: number; stdout?: string; stderr?: string };
      return { code: e.code ?? 1, output: e.stdout ?? '', error: e.stderr ?? '' };
    }
  };
  return { requests, run, close: () => server.close() };
}

test('composed read inherits the exact live session Campaign and keeps four states separate', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const result = await f.run(['read']);
  assert.equal(result.code, 0, result.error);
  const out = JSON.parse(result.output);
  assert.equal(out.campaign.id, 'selected');
  assert.deepEqual(out.installations.map((row: Record<string, unknown>) => [row.name, row.catalogued, row.observed, row.campaign_on, row.default_selected]), [
    ['ronin_services', true, { state: 'installed', activated: false, stage: 'not_requested', loaded: [], parked: [{ name: 'koshi' }], restart_needed: false }, false, false],
    ['gbrain', true, { state: 'unknown' }, true, true],
    ['trello', true, { state: 'unknown' }, false, false],
  ]);
  assert.equal(out.providers.catalog.providers[0].models[0].model, 'runtime-choice');
  assert.deepEqual(f.requests.slice(0, 2).map(({ method, url }) => [method, url]), [
    ['GET', '/api/sessions'], ['GET', '/api/campaigns/selected'],
  ]);
  assert.ok(!f.requests.some((request) => request.url.includes('home_machine')), 'never substitutes the initial Campaign');
});

test('Campaign/default/installation writes use only the selected Campaign typed route', async (t) => {
  const f = await fixture();
  t.after(f.close);
  for (const args of [
    ['campaign', 'write', 'title', 'Changed'],
    ['defaults', 'write', 'reach', 'execute'],
    ['installations', 'write', 'gbrain', 'off'],
  ]) assert.equal((await f.run(args)).code, 0);
  const writes = f.requests.filter((request) => request.method === 'PUT');
  assert.equal(writes.length, 3);
  assert.ok(writes.every((request) => request.url === '/api/campaigns/selected'));
  assert.deepEqual(writes[0].body, { title: 'Changed' });
  assert.equal((writes[1].body as any).config.defaults.reach, 'execute');
  assert.equal((writes[2].body as any).config.installations.gbrain, false);
  assert.ok(!f.requests.some((request) => (request.body as any)?.family === 'campaigns' || (request.body as any)?.family === 'record-section'));
});

test('Cowork defaults use the Campaign route and preserve the other Cowork choice', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const read = await f.run(['cowork-defaults', 'read']);
  assert.equal(read.code, 0, read.error);
  assert.deepEqual(JSON.parse(read.output), { project_root: 'old', repos: ['old'] });
  assert.equal((await f.run(['cowork-defaults', 'write', 'born-in', 'samurai_lab'])).code, 0);
  assert.equal((await f.run(['cowork-defaults', 'write', 'workspaces', 'samurai_lab,ronin_cowork'])).code, 0);
  const writes = f.requests.filter((request) => request.method === 'PUT');
  assert.deepEqual(writes.map((request) => request.url), ['/api/campaigns/selected', '/api/campaigns/selected']);
  assert.deepEqual((writes[0].body as any).config.cowork_defaults, { project_root: 'samurai_lab', repos: ['old'] });
  assert.deepEqual((writes[1].body as any).config.cowork_defaults, { project_root: 'old', repos: ['samurai_lab', 'ronin_cowork'] });
});

test('Machine/provider writes use named Machine Settings families, never a generic store', async (t) => {
  const f = await fixture();
  t.after(f.close);
  assert.equal((await f.run(['machine', 'write', 'monitor', 'on'])).code, 0);
  assert.equal((await f.run(['provider', 'write-default', 'dynamic', 'runtime-choice'])).code, 0);
  const patches = f.requests.filter((request) => request.method === 'PATCH').map((request) => request.body);
  assert.deepEqual(patches, [
    { family: 'machine', value: { monitor: true } },
    { family: 'agents', value: { sessions: { default: { provider: 'dynamic', model: 'runtime-choice' } } } },
  ]);
});

test('Campaign omission refuses without exact session context and help carries only the dynamic model-source contract', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const missing = await f.run(['campaign', 'read'], { RONIN_SESSION: '' });
  assert.equal(missing.code, 3);
  assert.match(missing.error, /NO-CAMPAIGN/);
  const help = await f.run(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.output, /canonical Campaign\/provider model catalog shared with\s+the UI dropdowns/);
  assert.doesNotMatch(help.output, /gpt-|claude-|gemini-|sonnet|opus/i);
});

test('machine settings writes and Workspace Folder operations do not depend on Agent identity or confirmation tokens', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const env = { RONIN_MACHINE_SETTINGS_AUTHORITY: 'mika' };
  const write = await f.run(['machine', 'write', 'monitor', 'on'], env);
  assert.equal(write.code, 0, write.error);
  const create = await f.run(['project-root', 'create', 'another', '--dir', '/tmp/another'], env);
  assert.equal(create.code, 0, create.error);
  const exclude = await f.run(['project-root', 'exclude', 'repo'], env);
  assert.equal(exclude.code, 0, exclude.error);
  assert.deepEqual(f.requests.filter((request) => ['PATCH', 'POST', 'DELETE'].includes(request.method)).map(({ method, url }) => [method, url]), [
    ['PATCH', '/api/machine-settings'], ['POST', '/api/project-roots'], ['DELETE', '/api/project-roots/repo'],
  ]);
  assert.deepEqual((f.requests.find((request) => request.method === 'POST')?.body as Record<string, unknown>), {
    name: 'another', dir: '/tmp/another', campaign_id: 'selected',
  });
});

test('a rejected write reports the route, reason, and help command', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const result = await f.run(['project-root', 'create', 'reject', '--dir', '/tmp/reject']);
  assert.equal(result.code, 4);
  assert.match(result.error, /\/api\/project-roots/);
  assert.match(result.error, /invalid repository profile/);
  assert.match(result.error, /machine-settings --help/);
});
