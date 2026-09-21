import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { closeTestServer, openTestServer } from './helpers/testserver.js';

const ROOT = path.resolve(import.meta.dirname, '..');

const freePort = async (): Promise<number> => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') return reject(new Error('no scratch port'));
    server.close(() => resolve(address.port));
  });
});

const overSocket = (socketPath: string, body: object): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request({
      socketPath, path: '/api/cli/auth', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text }));
    });
    request.once('error', reject);
    request.end(payload);
  });

async function stop(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  const hard = setTimeout(() => child.kill('SIGKILL'), 4_000);
  hard.unref();
  await exited;
  clearTimeout(hard);
}

test('password command protects local and proxied browser addresses through login, refresh, and logout', async (t) => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-password-walk-'));
  const tmux = await openTestServer(`password-${process.pid}`, { onPath: false });
  const port = await freePort();
  let child: ChildProcess | undefined;
  t.after(async () => {
    await stop(child);
    await closeTestServer(tmux);
    await fs.rm(scratch, { recursive: true, force: true });
  });
  const env = {
    ...process.env,
    PATH: `${tmux.root}${path.delimiter}${process.env.PATH ?? ''}`,
    BIND: '127.0.0.1', PORT: String(port), NODE_ENV: 'production',
    RONIN_DATA_ROOT: path.join(scratch, 'data'),
    RONIN_USER_ROOT: path.join(scratch, 'user'),
    RONIN_TESTSERVER_ROOT: path.join(scratch, 'testservers'),
  };
  delete env.RONIN_TEST_RUNNER;
  delete env.RONIN_SOCKET;
  delete env.TMUX;
  delete env.TMUX_PANE;
  child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`scratch Ronin did not start:\n${output}`)), 10_000);
    const inspect = (chunk: Buffer) => {
      output += chunk.toString();
      if (!output.includes('agent tools answer at') || !output.includes('[tmux-ronin] listening on')) return;
      clearTimeout(timer); resolve();
    };
    child!.stdout!.on('data', inspect);
    child!.stderr!.on('data', inspect);
    child!.once('exit', (code) => { clearTimeout(timer); reject(new Error(`scratch Ronin exited ${code}:\n${output}`)); });
  });

  const socket = path.join(scratch, 'data', 'run', 'ronin.sock');
  const set = await overSocket(socket, { args: ['set'], input: 'correct horse\ncorrect horse\n' });
  assert.equal(set.status, 200);
  assert.match(JSON.parse(set.body).stdout, /password set/);

  const base = `http://127.0.0.1:${port}`;
  const destination = '/m?view=team%2Fclean-round';
  for (const headers of [{ accept: 'text/html' }, { accept: 'text/html', host: 'ronin.example.ts.net:4810' }]) {
    const gated = await fetch(`${base}${destination}`, { redirect: 'manual', headers });
    assert.equal(gated.status, 302);
    assert.equal(gated.headers.get('location'), `/login?next=${encodeURIComponent(destination)}`);
  }
  const loginPage = await fetch(`${base}/login?next=${encodeURIComponent(destination)}`);
  assert.equal(loginPage.status, 200);
  assert.match(await loginPage.text(), /id="pw"/);

  const login = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'correct horse' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  assert.match(cookie ?? '', /^ronin_session=/);
  const refreshed = await fetch(`${base}${destination}`, { redirect: 'manual', headers: { cookie: cookie! } });
  assert.equal(refreshed.status, 200);

  const logout = await fetch(`${base}/api/logout`, { method: 'POST', headers: { cookie: cookie! } });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie') ?? '', /ronin_session=;/);
  const afterLogout = await fetch(`${base}${destination}`, { redirect: 'manual', headers: { accept: 'text/html' } });
  assert.equal(afterLogout.status, 302);
  assert.equal(afterLogout.headers.get('location'), `/login?next=${encodeURIComponent(destination)}`);
});
