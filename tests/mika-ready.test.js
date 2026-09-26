import test from 'node:test';
import assert from 'node:assert/strict';

// readyMika asks once and waits for the server to say so by push.
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, setTimeout };
const node = () => ({ classList: { add() {} }, dataset: {}, append() {}, appendChild() {}, addEventListener() {}, setAttribute() {}, style: {} });
globalThis.document = { createElement: node, head: node(), body: node(), documentElement: node(), addEventListener() {}, querySelector: () => null };
globalThis.sessionStorage = { getItem: () => null, setItem() {} };
globalThis.location = { protocol: 'http:', host: 'test', hash: '' };
const sockets = [];
globalThis.WebSocket = class { constructor() { this.readyState = 1; sockets.push(this); } send() {} };
const posts = [];
let answer = { ok: false, state: 'starting' };
globalThis.fetch = async (url, init) => {
  posts.push(`${init?.method || 'GET'} ${url}`);
  return new Response(JSON.stringify(answer), { status: answer.ok ? 200 : answer.state === 'starting' ? 202 : 409, headers: { 'content-type': 'application/json' } });
};

const { store } = await import('../public/js/store.js');
store.connect();
const { readyMika } = await import('../public/js/mika-ready.js');
const settle = () => new Promise((resolve) => setImmediate(resolve));
const push = (message) => sockets[sockets.length - 1].onmessage({ data: JSON.stringify(message) });

test('one request, then a push says she is ready', async () => {
  posts.length = 0; answer = { ok: false, state: 'starting' };
  let result = null;
  void readyMika('help').then((r) => { result = r; });
  await settle();
  push({ t: 'mika', ok: false, state: 'starting' });
  await settle();
  assert.equal(result, null, 'starting keeps waiting');
  push({ t: 'mika', ok: true, state: 'ready' });
  await settle();
  assert.deepEqual(result, { ok: true, status: 200, data: { ok: true, state: 'ready' } });
  assert.deepEqual(posts, ['POST /api/mika/ready'], 'exactly one request');
});

test('action_required settles it with the 409 the route would answer', async () => {
  posts.length = 0; answer = { ok: false, state: 'starting' };
  const pending = readyMika('help');
  await settle();
  push({ t: 'mika', ok: false, state: 'action_required', code: 'provider_confirmation_required' });
  const result = await pending;
  assert.equal(result.status, 409);
  assert.equal(result.data.code, 'provider_confirmation_required');
  assert.equal(posts.length, 1);
});

test('a ready answer that beats the POST is not missed', async () => {
  posts.length = 0; answer = { ok: false, state: 'starting' };
  const pending = readyMika('help');
  push({ t: 'mika', ok: true, state: 'ready' }); // before the POST has answered
  const result = await pending;
  assert.equal(result.ok, true);
});

test('a POST that answers ready settles it at once', async () => {
  posts.length = 0; answer = { ok: true, state: 'ready' };
  const result = await readyMika('help');
  assert.equal(result.ok, true);
  assert.equal(posts.length, 1);
});

test('the socket closing settles it as unreachable', async () => {
  posts.length = 0; answer = { ok: false, state: 'starting' };
  const pending = readyMika('help');
  await settle();
  const ws = sockets[sockets.length - 1];
  ws.readyState = 3;
  ws.onclose();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.status, 0);
  assert.match(result.message, /could not reach Ronin/);
});
