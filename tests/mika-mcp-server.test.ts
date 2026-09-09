import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Mika MCP exposes exactly three validated tools and calls only fixed socket brokers', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-mika-mcp-'));
  const socket = path.join(temp, 'operator.sock');
  const reached: Array<{ method: string; url: string; body: string }> = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      reached.push({ method: req.method ?? '', url: req.url ?? '', body });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, route: req.url }));
    });
  });
  await new Promise<void>((resolve) => server.listen(socket, resolve));
  const child = spawn(process.execPath, ['bin/mika-mcp-server.mjs'], {
    cwd: path.resolve('.'), env: { RONIN_SOCKET: socket }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { out += chunk; });
  const call = async (message: object): Promise<any> => {
    const before = out.split('\n').filter(Boolean).length;
    child.stdin.write(`${JSON.stringify(message)}\n`);
    for (let i = 0; i < 100; i++) {
      const rows = out.split('\n').filter(Boolean);
      if (rows.length > before) return JSON.parse(rows[before]);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('MCP reply timeout');
  };
  try {
    const listed = await call({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    assert.deepEqual(listed.result.tools.map((tool: { name: string }) => tool.name), ['lookup', 'wheres_waldo', 'show']);
    assert.ok(listed.result.tools.every((tool: { inputSchema: { additionalProperties: boolean } }) => tool.inputSchema.additionalProperties === false));
    const bad = await call({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'lookup', arguments: { ref: 'mika-source:ok.md', path: '/tmp' } } });
    assert.equal(bad.error.code, -32602);
    assert.equal(reached.length, 0);
    assert.equal((await call({ jsonrpc: '2.0', id: 20, method: 'unknown' })).error.code, -32601);
    assert.equal((await call({ jsonrpc: '2.0', id: 21, method: 'ping', path: '/tmp' })).error.code, -32600);
    for (const [id, name, args] of [
      [3, 'lookup', { ref: 'mika-source:docs/help.md' }],
      [4, 'wheres_waldo', { view_id: '0123456789abcdef0123456789abcdef' }],
      [5, 'show', { view_id: '0123456789abcdef0123456789abcdef', surface: 'setup.services' }],
    ] as const) {
      const reply = await call({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
      assert.equal(reply.result.content[0].type, 'text');
      assert.match(reply.result.content[0].text, /"ok":true/);
    }
    assert.deepEqual(reached.map(({ method, url }) => ({ method, url })), [
      { method: 'POST', url: '/api/mika/broker/lookup' },
      { method: 'POST', url: '/api/mika/broker/wheres-waldo' },
      { method: 'POST', url: '/api/mika/broker/show' },
    ]);
  } finally {
    child.kill('SIGTERM'); server.close(); await rm(temp, { recursive: true, force: true });
  }
});
