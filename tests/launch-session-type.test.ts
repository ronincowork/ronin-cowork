/**
 * `POST /api/launch` is keyed on session_type. Unusable caller material is ignored before
 * tmux and recorded for the eventual birth receipt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';

process.env.BIND = '127.0.0.1';
const { registerLaunch } = await import('../src/routes/launch.js');
const { acceptedLaunchBody } = await import('../src/routes/launch.js');

const app = express();
app.use(express.json());
registerLaunch(app);
const server: Server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function launch(body: Record<string, unknown>): Promise<{ status: number; error: string }> {
  const response = await fetch(`${base}/api/launch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, error: String((await response.json()).error ?? '') };
}

test('missing session_type defaults to the ordinary cowork_agent path', async () => {
  const result = await launch({});
  assert.equal(result.status, 400);
  assert.match(result.error, /name.*required/);
  assert.doesNotMatch(result.error, /session_type/);
});

test('an invalid stated session_type resolves to cowork_agent and is noted for the receipt', () => {
  const result = acceptedLaunchBody({ session_type: 'mystery', name: 'proof' });
  assert.equal(result.body.session_type, 'cowork_agent');
  assert.deepEqual(result.ignored, ['session_type']);
});

test('the live legacy launcher states cowork_agent until FORMS_UI retires it', async () => {
  const source = await fs.readFile(new URL('../public/js/launcher.js', import.meta.url), 'utf8');
  const post = source.match(/request\('\/api\/launch',[\s\S]*?\n\s*}\);/)?.[0] ?? '';
  assert.match(post, /session_type:\s*'cowork_agent'/);
});

test('name is required for every session_type', async () => {
  for (const session_type of ['cowork_agent', 'bare_metal_agent', 'terminal']) {
    const result = await launch({ session_type });
    assert.equal(result.status, 400);
    assert.match(result.error, /name.*required/);
  }
});

test('terminal ignores Agent-only fields and notes each one for the receipt', () => {
  for (const key of ['provider', 'model', 'instructions', 'mandate', 'behaviours', 'session_role']) {
    const result = acceptedLaunchBody({ session_type: 'terminal', name: 'proof', [key]: key === 'mandate' ? {} : 'x' });
    assert.equal(result.body[key], undefined, key);
    assert.deepEqual(result.ignored, [key]);
  }
});

test('bare-metal Agent ignores Ronin-only fields and a managed desk', () => {
  for (const [key, value] of [['mandate', {}], ['behaviours', []], ['routines', {}], ['seed', []], ['desk', 'own']] as const) {
    const result = acceptedLaunchBody({ session_type: 'bare_metal_agent', name: 'proof', project_root: 'home', [key]: value });
    assert.equal(result.body[key], undefined, key);
    assert.deepEqual(result.ignored, [key]);
  }
});

test('unknown, retired, invalid, and server-owned fields are ignored and noted together', () => {
  const result = acceptedLaunchBody({
    name: 'proof', lifecycle: 'old', mystery: true, dial: 'loud', stated_by: {},
  });
  assert.deepEqual(result.body, { name: 'proof', session_type: 'cowork_agent' });
  assert.deepEqual(result.ignored, ['dial', 'lifecycle', 'mystery', 'stated_by']);
});

test('cowork kind and behaviours survive body acceptance while unusable shapes are ignored', () => {
  const accepted = acceptedLaunchBody({ name: 'proof', kind: 'coding', behaviours: ['sops:github'] });
  assert.equal(accepted.body.kind, 'coding');
  assert.deepEqual(accepted.body.behaviours, ['sops:github']);
  assert.deepEqual(accepted.ignored, []);

  const ignored = acceptedLaunchBody({ name: 'proof', kind: 'mystery', behaviours: 'sops:github' });
  assert.equal(ignored.body.kind, undefined);
  assert.equal(ignored.body.behaviours, undefined);
  assert.deepEqual(ignored.ignored, ['behaviours', 'kind']);
});

test('a template token is provenance input only on a cowork birth', () => {
  const accepted = acceptedLaunchBody({ name: 'proof', template: 'document_it' });
  assert.equal(accepted.body.template, 'document_it');
  assert.deepEqual(accepted.ignored, []);

  const malformed = acceptedLaunchBody({ name: 'proof', template: '../document_it' });
  assert.equal(malformed.body.template, undefined);
  assert.deepEqual(malformed.ignored, ['template']);

  const terminal = acceptedLaunchBody({ session_type: 'terminal', name: 'proof', template: 'document_it' });
  assert.equal(terminal.body.template, undefined);
  assert.deepEqual(terminal.ignored, ['template']);
});

test.after(() => server.close());
