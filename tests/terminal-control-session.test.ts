import test from 'node:test';
import assert from 'node:assert/strict';
import { openTestServer, closeTestServer } from './helpers/testserver.js';
import { setSessionIdentity, listSessions } from '../src/tmux.js';
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
