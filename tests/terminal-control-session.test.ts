import test from 'node:test';
import assert from 'node:assert/strict';
import { openTestServer, closeTestServer } from './helpers/testserver.js';
import { setSessionIdentity, listSessions, parseSessionRows } from '../src/tmux.js';
import { ControlTmuxClient } from '../src/tmux-client.js';
import { registerTerminalControls } from '../src/terminal-controls.js';
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

test('live sessions carry launch identity and a stale Tile cannot send a control', async () => {
  const name = `controls-${process.pid}`;
  const rig = await openTestServer(name, { onPath: true });
  try {
    await rig.run('new-session', '-d', '-s', 'agent', 'cat');
    const identity = { sessionType: 'bare_metal_agent', cli: 'codex', provider: 'alternate-provider', model: 'chosen-model' };
    await setSessionIdentity('agent', identity);
    const found = (await listSessions()).find((s) => s.name === 'agent');
    assert.deepEqual(found?.identity, identity);
    assert.equal(found?.agent, 'codex');
    const app = express(); app.use(express.json()); registerTerminalControls(app);
    const server = createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sessions/agent/control-action`;
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intent: 'stop', key: 'wrong-birth' }) });
      assert.equal(r.status, 409);
      assert.match((await r.json()).error, /session changed/);
      await setSessionIdentity('agent', { ...identity, cli: 'unknown' });
      const clear = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intent: 'clear', key: found?.key }) });
      assert.equal(clear.status, 422);
      assert.match((await clear.json()).error, /No clear binding/);
      assert.equal((await rig.run('list-sessions', '-F', '#{session_name}')).includes('agent'), true);
    } finally { await new Promise<void>((r) => server.close(() => r())); }
  } finally { await closeTestServer(name); }
});

test('a real control-mode session listing keeps Mika name separate from every metadata field', async () => {
  const name = `controls-list-${process.pid}`;
  const rig = await openTestServer(name, { onPath: true });
  const client = new ControlTmuxClient();
  try {
    await rig.run('new-session', '-d', '-s', 'mika_agent', 'cat');
    await rig.run('set-option', '-t', '=mika_agent:', '@ronin-tags', 'ronin_helpers');
    await rig.run('set-option', '-t', '=mika_agent:', '@ronin-key', 'mika_agent-1789653551276');
    await rig.run('set-option', '-t', '=mika_agent:', '@ronin-agent', 'claude');
    await rig.run('set-option', '-t', '=mika_agent:', '@ronin-campaign', 'home_machine');
    await rig.run('set-option', '-t', '=mika_agent:', '@ronin-identity', '{"sessionType":"cowork_agent","cli":"claude","provider":"anthropic","model":"haiku"}');
    await client.connect();
    const raw = await client.run([
      'list-sessions', '-F',
      '#{session_name}\t#{@ronin-title}\t#{session_windows}\t#{?session_attached,1,0}\t#{session_created}\t#{?@ronin_note,1,0}\t#{@ronin-tags}\t#{@ronin-lead}\t#{@ronin-key}\t#{@ronin-agent}\t#{@ronin-campaign}\t#{@ronin-rireki}\t#{window_activity}\t#{@ronin-identity}',
    ]);
    const mika = raw.split('\n').find((line) => line.startsWith('mika_agent\t'));
    assert.ok(mika, `Mika record was not delimited in: ${raw}`);
    const fields = mika.split('\t');
    assert.equal(fields.length, 14);
    assert.equal(fields[0], 'mika_agent');
    assert.equal(fields[6], 'ronin_helpers');
    assert.equal(fields[8], 'mika_agent-1789653551276');
    assert.equal(fields[9], 'claude');
    assert.equal(fields[10], 'home_machine');
    assert.deepEqual(JSON.parse(fields[13]!), { sessionType: 'cowork_agent', cli: 'claude', provider: 'anthropic', model: 'haiku' });
  } finally {
    await closeTestServer(name);
  }
});

test('a flattened Mika metadata record can never become a displayed session name', () => {
  const identity = '{"sessionType":"cowork_agent","cli":"claude","provider":"anthropic","model":"haiku"}';
  const valid = `mika_agent\t\t1\t0\t1789653552\t0\tronin_helpers\t\tmika_agent-1789653551276\tclaude\thome_machine\t\t1789653902\t${identity}`;
  assert.equal(parseSessionRows(valid)[0]?.name, 'mika_agent');
  assert.deepEqual(parseSessionRows(valid.replaceAll('\t', '_')), [], 'a record with lost separators is not one giant session');
  assert.deepEqual(parseSessionRows(valid.replaceAll('\t', '\\011')), [], 'an undecoded control reply is not one giant session');
});
