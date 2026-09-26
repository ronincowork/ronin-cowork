import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');

async function fixture(
  sessions: unknown[] = [],
  modelFacts?: { provider: string; cli: string; model: string },
) {
  const requests: Array<{ method: string; url: string; body: string }> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      requests.push({ method: req.method ?? '', url: req.url ?? '', body });
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET' && req.url === '/api/sessions') {
        res.end(JSON.stringify(sessions));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/provider-catalog') {
        const facts = modelFacts ?? { provider: 'fixture-provider', cli: 'fixture-cli', model: `fixture-model-${process.pid}` };
        res.end(JSON.stringify({ providers: [{ provider: facts.provider, cli: facts.cli, provider_label: 'Fixture Provider', models: [{ model: facts.model, name: 'Friendly Fixture', tier: 'fixture-tier' }] }] }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/setup/runtime') {
        const facts = modelFacts ?? { provider: 'fixture-provider', cli: 'fixture-cli', model: `fixture-model-${process.pid}` };
        res.end(JSON.stringify({ providers: [{ id: facts.cli, installed: true, signed_in: true, activated: true }] }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/launch-seed') {
        const facts = modelFacts ?? { provider: 'fixture-provider', cli: 'fixture-cli', model: `fixture-model-${process.pid}` };
        res.end(JSON.stringify({ seeds: { provider: { value: facts.provider, stated_by: [{ source: 'fixture Campaign default' }] }, model: { value: facts.model, stated_by: [{ source: 'fixture Campaign default' }] } } }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/session') {
        const stated = JSON.parse(body || '{}') as { name?: string; team?: string };
        res.end(JSON.stringify({ ok: true, name: stated.name ?? 'unused', receipt: { team: stated.team } }));
        return;
      }
      if (req.method === 'POST' && req.url?.startsWith('/api/sessions/')) {
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const run = async (tool: string, args: string[]) => {
    try {
      const result = await exec(path.join(root, 'ronin_bin', tool), args, {
        env: { ...process.env, RONIN_URL: `http://127.0.0.1:${address.port}`, RONIN_CLI_TOKEN: 'test' },
      });
      return { code: 0, output: result.stdout + result.stderr };
    } catch (error) {
      const e = error as { code?: number; stdout?: string; stderr?: string };
      return { code: e.code ?? 1, output: (e.stdout ?? '') + (e.stderr ?? '') };
    }
  };
  return { requests, run, close: () => server.close() };
}

test('checking an unused name is GET-only and never creates it', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const result = await f.run('session_check', ['unused']);
  assert.equal(result.code, 3);
  assert.match(result.output, /NO-SESSION/);
  assert.deepEqual(f.requests, [{ method: 'GET', url: '/api/sessions', body: '' }]);
});

test('creation is an explicit command and uses the launch door', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const result = await f.run('session_create', ['unused', '--prompt', 'Review it']);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /BORN unused/);
  assert.equal(f.requests.length, 1);
  assert.deepEqual({ method: f.requests[0].method, url: f.requests[0].url }, { method: 'POST', url: '/api/session' });
});

test('project custody and lead designation are ordinary unknown creation options', async (t) => {
  const f = await fixture();
  t.after(f.close);
  for (const args of [['builder', '--project', 'build/7'], ['builder', '--lead']]) {
    const result = await f.run('session_create', args);
    assert.equal(result.code, 2);
    assert.match(result.output, new RegExp(`BAD-ARG: ${args[1]}\\. Run session_create --help\\.`));
  }
  assert.deepEqual(f.requests, []);
});

test('creation help renders exact launch ids, availability, and Campaign defaults', async (t) => {
  const facts = { provider: `provider-${process.pid}`, cli: `cli-${process.pid}`, model: `model-${process.pid}` };
  const f = await fixture([], facts);
  t.after(f.close);
  const result = await f.run('session_create', ['--help']);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, new RegExp(`${facts.provider} \\(Fixture Provider\\) — available`));
  assert.match(result.output, new RegExp(`${facts.model} \\(Friendly Fixture\\) · fixture-tier — available`));
  assert.match(result.output, new RegExp(`Current launch default: ${facts.provider}/${facts.model} — fixture Campaign default`));
  assert.match(result.output, /--root <workspace-folder-handle>/);
  assert.match(result.output, /ronin_lab/);
  assert.match(result.output, /not by its filesystem path/);
  assert.doesNotMatch(result.output, /--root <path>/);
  assert.doesNotMatch(result.output, /--project|--lead/);
  assert.deepEqual(f.requests.map(({ method, url }) => `${method} ${url}`), [
    'GET /api/provider-catalog', 'GET /api/setup/runtime', 'GET /api/launch-seed',
  ]);
});

test('creation forwards the selected provider and model unchanged', async (t) => {
  const facts = { provider: `provider-${process.pid}`, cli: `cli-${process.pid}`, model: `model-${process.pid}` };
  const f = await fixture([], facts);
  t.after(f.close);
  const result = await f.run('session_create', ['unused', '--provider', facts.provider, '--model', facts.model]);
  assert.equal(result.code, 0, result.output);
  assert.deepEqual(f.requests.map(({ method, url }) => `${method} ${url}`), [
    'POST /api/session',
  ]);
  const body = JSON.parse(f.requests[0]!.body);
  assert.equal(body.name, 'unused');
  assert.equal(body.provider, facts.provider);
  assert.equal(body.model, facts.model);
});

test('creation passes an unlisted model through to the provider launch route', async (t) => {
  const facts = { provider: `provider-${process.pid}`, cli: `cli-${process.pid}`, model: `model-${process.pid}` };
  const f = await fixture([], facts);
  t.after(f.close);
  const missing = `missing-${process.pid}`;
  const result = await f.run('session_create', ['unused', '--provider', facts.provider, '--model', missing]);
  assert.equal(result.code, 0, result.output);
  assert.deepEqual(f.requests.map(({ method, url }) => `${method} ${url}`), ['POST /api/session']);
  assert.equal(JSON.parse(f.requests[0]!.body).model, missing);
});

test('CLI passes both a refreshed full id and a provider alias unchanged', async (t) => {
  const f = await fixture([], { provider: 'anthropic', cli: 'claude', model: 'claude-fable-5-1' });
  t.after(f.close);
  const full = await f.run('session_create', ['full_id', '--provider', 'anthropic', '--model', 'claude-fable-5-1']);
  assert.equal(full.code, 0, full.output);
  const alias = await f.run('session_create', ['alias', '--provider', 'anthropic', '--model', 'fable']);
  assert.equal(alias.code, 0, alias.output);
  assert.equal(JSON.parse(f.requests.at(-1)!.body).model, 'fable');
});

test('updating a missing name refuses after its read and never creates it', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const result = await f.run('session_set', ['unused', '--root', 'lab']);
  assert.equal(result.code, 3);
  assert.match(result.output, /NO-SESSION.*session_create/s);
  assert.deepEqual(f.requests, [{ method: 'GET', url: '/api/sessions', body: '' }]);
});

test('recorded root can be set or cleared without claiming to move the birth directory', async (t) => {
  const f = await fixture([{ name: 'active', tags: [], leads: [] }]);
  t.after(f.close);
  const set = await f.run('session_set', ['active', '--root', 'samurai_lab']);
  assert.equal(set.code, 0, set.output);
  assert.match(set.output, /recorded_root=samurai_lab \(birth and shell directory unchanged\)/);
  const clear = await f.run('session_set', ['active', '--clear-root']);
  assert.equal(clear.code, 0, clear.output);
  assert.match(clear.output, /recorded_root=cleared \(birth and shell directory unchanged\)/);
  assert.deepEqual(f.requests.map(({ method, url, body }) => ({ method, url, body: body ? JSON.parse(body) : null })), [
    { method: 'GET', url: '/api/sessions', body: null },
    { method: 'POST', url: '/api/sessions/active/project-root', body: { project_root: 'samurai_lab' } },
    { method: 'GET', url: '/api/sessions', body: null },
    { method: 'POST', url: '/api/sessions/active/project-root', body: { project_root: '' } },
  ]);
});

test('value-taking flags refuse a missing value before making a request', async (t) => {
  const f = await fixture();
  t.after(f.close);
  for (const [tool, args] of [
    ['session_create', ['unused', '--prompt']],
    ['session_create', ['unused', '--team', '--lead']],
    ['session_set', ['unused', '--team']],
    ['session_set', ['unused', '--root', '--lead']],
  ] as const) {
    const result = await f.run(tool, [...args]);
    assert.equal(result.code, 2);
    assert.match(result.output, /BAD-ARG: .* requires a value/);
  }
  assert.deepEqual(f.requests, []);
});

test('updating safely JSON-encodes accepted Team names and lead payloads', async (t) => {
  const f = await fixture([{ name: 'active', tags: [], leads: [], control: 'read' }]);
  t.after(f.close);
  const result = await f.run('session_set', ['active', '--team', 'design-review_2', '--lead']);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /UPDATED active team=design-review_2 人=design-review_2/);
  assert.deepEqual(f.requests.map(({ method, url, body }) => ({ method, url, body: body ? JSON.parse(body) : null })), [
    { method: 'GET', url: '/api/sessions', body: null },
    { method: 'POST', url: '/api/sessions/active/tags', body: { tags: 'design-review_2' } },
    { method: 'POST', url: '/api/sessions/active/team_lead', body: { teams: ['design-review_2'] } },
  ]);
});
