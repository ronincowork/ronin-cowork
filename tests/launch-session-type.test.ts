/**
 * `POST /api/launch` is keyed on session_type. These refusals run before tmux, so the
 * route contract can be proved without creating a session on the developer's machine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';

process.env.BIND = '127.0.0.1';
const { registerLaunch } = await import('../src/routes/launch.js');

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

test('the route refuses to infer session_type from the retired keying inputs', async () => {
  for (const body of [{ name: 'proof' }, { name: 'proof', session_role: 'CutCode' }, { name: 'proof', team: 'alpha' }, { name: 'proof', agent: true }]) {
    const result = await launch(body);
    assert.equal(result.status, 400);
    assert.match(result.error, /session_type/);
    assert.match(result.error, /does not infer/);
  }
});

test('name is required for every session_type', async () => {
  for (const session_type of ['cowork_agent', 'bare_metal_agent', 'terminal']) {
    const result = await launch({ session_type });
    assert.equal(result.status, 400);
    assert.match(result.error, /name.*required/);
  }
});

test('terminal refuses Agent-only fields with teaching text', async () => {
  for (const key of ['provider', 'model', 'instructions', 'mandate', 'behaviours', 'session_role']) {
    const result = await launch({ session_type: 'terminal', name: 'proof', [key]: key === 'mandate' ? {} : 'x' });
    assert.equal(result.status, 400, key);
    assert.match(result.error, /terminal.*no Agent/);
    assert.match(result.error, new RegExp(key));
  }
});

test('bare-metal Agent refuses Ronin-only fields and a managed desk', async () => {
  for (const [key, value] of [['mandate', {}], ['behaviours', []], ['routines', {}], ['seed', []], ['desk', 'own']] as const) {
    const result = await launch({ session_type: 'bare_metal_agent', name: 'proof', [key]: value });
    assert.equal(result.status, 400, key);
    assert.match(result.error, /bare_metal_agent/);
    assert.match(result.error, new RegExp(key));
  }
});

test('server-owned resolved fields are refused on every type', async () => {
  const result = await launch({ session_type: 'cowork_agent', name: 'proof', stated_by: {} });
  assert.equal(result.status, 400);
  assert.match(result.error, /resolved and returned/);
  assert.match(result.error, /stated_by/);
});

test.after(() => server.close());
