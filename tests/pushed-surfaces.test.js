import test from 'node:test';
import assert from 'node:assert/strict';

// The wipeboard, the message queue, the Cron tab and the memory gauge: each opens by
// subscribing to the store, makes no request of its own, and paints each push.

// A permissive DOM: real children and text, and every other method a no-op.
const make = (tag = 'div') => {
  const node = {
    tagName: tag, children: [], options: [], dataset: {}, style: {}, textContent: '', className: '', hidden: false, value: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    append(...kids) { for (const kid of kids) if (kid && typeof kid === 'object') this.children.push(kid); else if (kid != null) this.children.push({ textContent: String(kid), children: [] }); },
    appendChild(kid) { this.append(kid); return kid; },
    replaceChildren(...kids) { this.children = []; this.append(...kids); },
    get childElementCount() { return this.children.length; },
  };
  return new Proxy(node, { get: (target, key) => (key in target ? target[key] : typeof key === 'string' ? () => make() : undefined) });
};
const text = (node) => [node.textContent || '', ...(node.children || []).map(text)].join(' ');

globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, innerWidth: 1000 };
const gaugeEl = make('span');
globalThis.document = { createElement: make, getElementById: (id) => (id === 'ramrpm' ? gaugeEl : null), body: make(), addEventListener() {}, hidden: false };
globalThis.Option = class { constructor(label, value) { this.textContent = label; this.value = value; this.children = []; } };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.Node = class { static [Symbol.hasInstance](value) { return Boolean(value && typeof value === 'object' && 'tagName' in value); } };
globalThis.confirm = () => true;
const requests = [];
globalThis.fetch = async (url) => { requests.push(String(url)); return new Response('{}'); };
const sent = [];
globalThis.location = { protocol: 'http:', host: 'test' };
globalThis.WebSocket = class { constructor() { this.readyState = 1; } send(text) { sent.push(JSON.parse(text)); } };

const { store } = await import('../public/js/store.js');
store.connect();
const { createTeamWipeboard } = await import('../public/js/team-wipeboard.js');
const { buildMessageQueue } = await import('../public/js/message-queue.js');
const { createTeamJikan } = await import('../public/js/team-jikan.js');
const { mountRamRpm } = await import('../public/js/ramrpm.js');

const post = (id, text) => ({ id, author: 'front2_store', at: '11:40', text });

test('the wipeboard asks for its board over the socket, paints each push, and stops on leave', () => {
  requests.length = 0; sent.length = 0;
  const board = createTeamWipeboard();
  board.setBoard('front-2');
  board.enter();
  assert.deepEqual(sent, [{ t: 'want', resource: 'wipeboard', board: 'front-2' }]);
  store.receive({ t: 'wipeboard', board: 'front-2', posts: [post('1', 'store is push-only')], more: false });
  assert.match(text(board.el), /store is push-only/);
  store.receive({ t: 'wipeboard', board: 'front-2', posts: [post('1', 'store is push-only'), post('2', 'queue next')], more: true });
  assert.match(text(board.el), /queue next/);
  assert.match(text(board.el), /earlier posts have cleared/);
  store.receive({ t: 'wipeboard', board: 'other', posts: [post('3', 'not this board')], more: false });
  assert.doesNotMatch(text(board.el), /not this board/);
  board.leave();
  store.receive({ t: 'wipeboard', board: 'front-2', posts: [post('4', 'after leave')], more: false });
  assert.doesNotMatch(text(board.el), /after leave/);
  assert.deepEqual(requests, []);
});

test('the message queue paints the held list and each push, and counts it', () => {
  requests.length = 0;
  const host = make();
  let count = -1;
  const queue = buildMessageQueue(host, (n) => { count = n; });
  store.receive({ t: 'messages', list: [{ id: 'm1', source: 'tell', from: 'front_fable', target: 'front2_store', text: 'waiting one', created_at: new Date().toISOString() }] });
  queue.enter(); // open: the list the store already holds
  assert.equal(count, 1);
  assert.match(text(host), /waiting one/);
  store.receive({ t: 'messages', list: [] }); // dismissed elsewhere
  assert.equal(count, 0);
  queue.leave();
  store.receive({ t: 'messages', list: [{ id: 'm2', source: 'tell', target: 'x', text: 'after leave', created_at: new Date().toISOString() }] });
  assert.equal(count, 0);
  assert.deepEqual(requests, []);
});

test('the Cron tab asks for its team over the socket and paints each push', () => {
  requests.length = 0; sent.length = 0;
  const jikan = createTeamJikan();
  jikan.setTeam('front-2', ['front2_store']);
  jikan.enter();
  assert.deepEqual(sent, [{ t: 'want', resource: 'jikan', team: 'front-2' }]);
  store.receive({ t: 'jikan', team: 'front-2', jobs: [{ id: 'j1', team: 'front-2', to: 'front2_store', when: 'daily 09:00', request: 'morning standup', state: 'scheduled' }] });
  assert.match(text(jikan.el), /morning standup/);
  jikan.leave();
  assert.deepEqual(requests, []);
});

test('the memory gauge paints the pushed reading and hides when the box is off', () => {
  requests.length = 0;
  const gauge = mountRamRpm();
  gauge.setVisible(true);
  store.receive({ t: 'memory', reading: { mem: { total_mb: 16384, available_mb: 8192 }, swap: { total_mb: 0, used_mb: 0 }, load: [0.4, 0.3, 0.2], cpus: 8, off: false } });
  assert.equal(gaugeEl.hidden, false, 'a reading shows the gauge');
  store.receive({ t: 'memory', reading: { off: true } });
  assert.equal(gaugeEl.hidden, true, 'off hides it');
  assert.deepEqual(requests, [], 'the gauge never asks');
});
