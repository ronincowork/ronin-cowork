import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-controls-'));
process.env.RONIN_CONFIG_DIR = path.join(temp, 'config');
process.env.RONIN_MESSAGE_QUEUE_DIR = path.join(temp, 'queue');
const { CONTROL_DEFAULTS, validateBindings, agentControlKeys, registerTerminalControls } = await import('../src/terminal-controls.js');
const { parseSessionIdentity } = await import('../src/tmux.js');

test('a remapped control has one persisted definition; invalid saves do not replace it', async () => {
  const app = express(); app.use(express.json()); registerTerminalControls(app);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/terminal-controls`;
    assert.deepEqual((await (await fetch(url)).json()).bindings, CONTROL_DEFAULTS);
    const bindings = { ...CONTROL_DEFAULTS, close: 'Ctrl+X' };
    assert.equal((await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bindings }) })).status, 200);
    assert.deepEqual((await (await fetch(url)).json()).bindings, bindings);
    const invalid = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bindings: { ...bindings, stop: 'Ctrl+X' } }) });
    assert.equal(invalid.status, 400);
    assert.deepEqual((await (await fetch(url)).json()).bindings, bindings);
    const stored = JSON.parse(await fs.readFile(path.join(temp, 'config/machine_settings.json'), 'utf8'));
    assert.deepEqual(stored.terminalControls.bindings, bindings);
    stored.terminalControls.bindings.copy = 'Ctrl+Shift+C';
    await fs.writeFile(path.join(temp, 'config/machine_settings.json'), JSON.stringify(stored));
    assert.deepEqual((await (await fetch(url)).json()).bindings, bindings);
    stored.terminalControls.bindings.close = 'Ctrl+C';
    await fs.writeFile(path.join(temp, 'config/machine_settings.json'), JSON.stringify(stored));
    assert.deepEqual((await (await fetch(url)).json()).bindings, CONTROL_DEFAULTS);

  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('bad, duplicate, browser and typing chords are rejected', () => {
  for (const close of ['C', 'Enter', 'Ctrl+C', 'Ctrl+W', 'Meta+C', 'Ctrl++C', 'Escape']) assert.throws(() => validateBindings({ ...CONTROL_DEFAULTS, close }));
  assert.throws(() => validateBindings({ stop: 'Escape' }));
  assert.deepEqual(validateBindings(CONTROL_DEFAULTS), CONTROL_DEFAULTS);
});

test('Clear reads the Agent document without classifying CLI state', async () => {
  assert.deepEqual(await agentControlKeys('codex', 'clear'), ['C-c']);
  assert.deepEqual(await agentControlKeys('claude', 'clear'), ['Escape']);
  for (const cli of ['gemini', 'grok', 'hermes']) {
    assert.deepEqual(await agentControlKeys(cli, 'clear'), ['C-c']);
  }
  assert.deepEqual(await agentControlKeys('codex', 'stop'), ['Escape']);
  assert.deepEqual(await agentControlKeys('grok', 'stop'), ['C-c']);
  await assert.rejects(() => agentControlKeys('bash', 'stop'), /No stop binding/);
  await assert.rejects(() => agentControlKeys('', 'clear'), /No clear binding/);
});

test('session identity distinguishes CLI from inference provider and model', () => {
  const identity = { sessionType: 'cowork_agent', cli: 'codex', provider: 'other-inference-vendor', model: 'other-model' };
  assert.deepEqual(parseSessionIdentity(JSON.stringify(identity)), identity);
  assert.equal(parseSessionIdentity('broken'), undefined);
  assert.equal(parseSessionIdentity('{"cli":"codex"}'), undefined);
});

test.after(async () => { await fs.rm(temp, { recursive: true, force: true }); });
