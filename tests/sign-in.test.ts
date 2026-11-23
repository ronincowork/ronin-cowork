/**
 * Sign-in: with a password set, the page and the API are closed until login, open after it,
 * closed again after logout. Kept because a gate left open looks like nothing on the page.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { bootRonin } from './helpers/ronin.js';

const ronin = await bootRonin('signin');
test.after(() => ronin.stop());

test('open with no password; after one is set the page and API need a login, and logout closes them', async () => {
  assert.equal((await ronin.api('/api/sessions')).status, 200, 'no password: open');

  // `ronin password set`, the owner's command: it reaches Ronin over the operator socket.
  const set = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const payload = JSON.stringify({ args: ['set'], input: 'correct horse\ncorrect horse\n' });
    const request = http.request({ socketPath: ronin.socket, path: '/api/cli/auth', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
    });
    request.once('error', reject);
    request.end(payload);
  });
  assert.equal(set.status, 200, set.body);
  assert.match(JSON.parse(set.body).stdout, /password set/);

  const destination = '/m?view=team%2Fclean-round';
  for (const headers of [{ accept: 'text/html' }, { accept: 'text/html', host: 'ronin.example.ts.net:4810' }]) {
    const gated = await fetch(`${ronin.base}${destination}`, { redirect: 'manual', headers });
    assert.equal(gated.status, 302);
    assert.equal(gated.headers.get('location'), `/login?next=${encodeURIComponent(destination)}`);
  }
  assert.equal((await ronin.api('/api/sessions')).status, 401);

  const wrong = await ronin.api('/api/login', { body: { password: 'wrong' } });
  assert.notEqual(wrong.status, 200);

  const login = await fetch(`${ronin.base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'correct horse' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
  assert.match(cookie, /^ronin_session=/);
  assert.equal((await fetch(`${ronin.base}${destination}`, { redirect: 'manual', headers: { cookie } })).status, 200);
  assert.equal((await ronin.api('/api/sessions', { headers: { cookie } })).status, 200);

  assert.equal((await fetch(`${ronin.base}/api/logout`, { method: 'POST', headers: { cookie } })).status, 200);
  assert.equal((await fetch(`${ronin.base}${destination}`, { redirect: 'manual', headers: { accept: 'text/html' } })).status, 302);

  const tool = await ronin.tool('item', ['search']);
  assert.equal(tool.status, 0, `Agents' tools still reach Ronin over the socket: ${tool.stderr}`);
});
