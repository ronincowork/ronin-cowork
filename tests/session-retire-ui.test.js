import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

globalThis.window = { matchMedia: () => ({ matches: false }) };
const { createSubmitGate, retireSession, runShutdown } = await import(`../public/js/session-retire.js?test=${Date.now()}`);

class FakeNode {
  constructor(tag = '') {
    this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.attributes = {};
    this.className = ''; this.textContent = ''; this.disabled = false; this.isConnected = true;
    this.classList = { contains: (name) => this.className.split(/\s+/).includes(name), add: (name) => { this.className += ` ${name}`; }, remove: () => {} };
  }
  append(...nodes) { this.children.push(...nodes.flat()); for (const node of nodes.flat()) node.parentElement = this; }
  appendChild(node) { this.append(node); return node; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  querySelectorAll(selector) { return [...this.walk()].filter((node) => selector === 'button' && node.tagName === 'BUTTON'); }
  *walk() { for (const child of this.children) { yield child; yield* child.walk(); } }
  matches() { return false; }
  focus() { globalThis.document.activeElement = this; }
  contains(node) { return node === this || [...this.walk()].includes(node); }
  getClientRects() { return [1]; }
}

test('live tile distinctly names Archive, safe Delete, and confirmed Hard Delete', async () => {
  const source = await fs.readFile(new URL('../public/js/session-retire.js', import.meta.url), 'utf8');
  assert.match(source, /Archive is resumable and leaves desks alone/);
  assert.match(source, /Delete safely closes only clean/);
  assert.match(source, /Hard Delete irreversibly removes/);
  assert.match(source, /HARD DELETE \$\{name\} AND OWNED DESKS/);
  assert.match(source, /mode: 'hard_delete'/);
});

test('rendered retirement actions distinguish resumable, safe, and destructive intent', () => {
  const beforeDocument = globalThis.document;
  const beforeElement = globalThis.HTMLElement;
  const body = new FakeNode('body');
  globalThis.HTMLElement = FakeNode;
  globalThis.document = { body, activeElement: body, createElement: (tag) => new FakeNode(tag), addEventListener() {} };
  try {
    retireSession('agent', 0, async () => {});
    const buttons = [...body.walk()].filter((node) => node.tagName === 'BUTTON');
    assert.deepEqual(buttons.map(({ textContent, className }) => ({ text: textContent, className })), [
      { text: 'Archive', className: 'primary' },
      { text: 'Delete', className: '' },
      { text: 'Hard Delete', className: 'danger' },
    ]);
  } finally {
    globalThis.document = beforeDocument;
    globalThis.HTMLElement = beforeElement;
  }
});

test('submit gate rejects duplicate clicks until success or failure restores it', async () => {
  const gate = createSubmitGate();
  let release;
  let calls = 0;
  const first = gate(async () => { calls++; await new Promise((resolve) => { release = resolve; }); });
  assert.equal(await gate(async () => { calls++; }), false);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, true);
  await assert.rejects(() => gate(async () => { throw new Error('failed'); }), /failed/);
  assert.equal(await gate(async () => { calls++; }), true);
  assert.equal(calls, 2);
});

/** A socket the test drives: pushes and reopens, with nothing sent on a clock. */
function rig() {
  const hear = new Set();
  const opens = new Set();
  const timers = [];
  const wants = [];
  return {
    hear, opens, timers, wants,
    push: (message) => { for (const fn of [...hear]) fn(message); },
    reopen: () => { for (const fn of [...opens]) fn(); },
    options: (extra = {}) => ({
      listen: (fn) => { hear.add(fn); return () => hear.delete(fn); },
      onOpen: (fn) => { opens.add(fn); return () => opens.delete(fn); },
      later: (fn) => { timers.push(fn); return timers.length; },
      cancel: () => {},
      want: (id) => { wants.push(id); for (const fn of [...hear]) fn({ t: 'shutdown', id, state: 'complete', message: 'done while away' }); },
      ...extra,
    }),
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('safe shutdown paints each pushed phase through success, and asks nothing after the POST', async () => {
  const seen = [];
  const socket = rig();
  const done = runShutdown('a', socket.options({
    start: async () => ({ id: 'op', state: 'running', phase: 'resolving_agent', message: 'Resolving Agent a' }),
    onProgress: (row) => seen.push(row.message),
  }));
  await settle();
  socket.push({ t: 'shutdown', id: 'other', state: 'complete', message: 'someone else' });
  socket.push({ t: 'shutdown', id: 'op', state: 'running', phase: 'checking_desks', message: 'Checking assigned worktrees (2 found)' });
  socket.push({ t: 'shutdown', id: 'op', state: 'running', phase: 'closing_desks', message: 'Closing safe worktrees (2/2)' });
  socket.push({ t: 'shutdown', id: 'op', state: 'complete', phase: 'complete', message: 'Agent a and 2 assigned worktree(s) closed' });
  const result = await done;
  assert.equal(seen[0], 'Resolving Agent…');
  assert.ok(seen.includes('Checking assigned worktrees (2 found)'));
  assert.ok(seen.includes('Closing safe worktrees (2/2)'));
  assert.ok(!seen.includes('someone else'), 'another shutdown\'s phases are not this one\'s');
  assert.equal(result.state, 'complete');
  assert.deepEqual(socket.wants, [], 'nothing asked while the socket stays up');
  assert.equal(socket.hear.size + socket.opens.size, 0, 'finished: nothing left listening');
});

test('a phase pushed before the POST answers is not lost', async () => {
  const socket = rig();
  let answer;
  const done = runShutdown('a', socket.options({ start: () => new Promise((resolve) => { answer = resolve; }) }));
  socket.push({ t: 'shutdown', id: 'op', state: 'complete', message: 'fast' });
  answer({ id: 'op', state: 'running', message: 'Resolving' });
  assert.equal((await done).message, 'fast');
});

test('a reopened socket asks for the state once, for the pushes it missed', async () => {
  const socket = rig();
  const done = runShutdown('a', socket.options({ start: async () => ({ id: 'op', state: 'running', message: 'Resolving' }) }));
  await settle();
  socket.reopen();
  assert.equal((await done).message, 'done while away');
  assert.deepEqual(socket.wants, ['op']);
});

test('a socket that stays silent is bounded by the overall deadline', async () => {
  const socket = rig();
  const done = runShutdown('a', socket.options({ start: async () => ({ id: 'op', state: 'running', message: 'Checking' }) }));
  await settle();
  socket.timers[0]();
  await assert.rejects(() => done, /timed out.*left available/);
});

test('actionable backend refusal is rendered as the terminal failure', async () => {
  const refusal = 'ronin:team/t/a: dirty files: x. NEXT: run git status';
  const socket = rig();
  const done = runShutdown('a', socket.options({ start: async () => ({ id: 'op', state: 'running', message: 'Resolving' }) }));
  await settle();
  socket.push({ t: 'shutdown', id: 'op', state: 'failed', error: refusal, message: refusal });
  await assert.rejects(() => done, new RegExp(refusal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('closing an Agent that already ended says so, and takes a fresh feed that drops its row', async () => {
  const saved = { document: globalThis.document, HTMLElement: globalThis.HTMLElement, fetch: globalThis.fetch, WebSocket: globalThis.WebSocket, location: globalThis.location };
  const body = new FakeNode('body');
  globalThis.HTMLElement = FakeNode;
  globalThis.document = { body, activeElement: body, createElement: (tag) => {
    const node = new FakeNode(tag);
    node.classList.toggle = () => {};
    node.remove = () => {};
    return node;
  }, addEventListener() {}, removeEventListener() {} };
  // The server's answer when the tmux session is already gone.
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'No such session.' }), { status: 404, headers: { 'content-type': 'application/json' } });
  const feeds = [];
  globalThis.location = { protocol: 'http:', host: 'rig' };
  globalThis.WebSocket = class { constructor(url) { this.readyState = 0; feeds.push(url); } close() {} };
  let done = 0;
  try {
    retireSession('front_fable', 'gone', async () => { done += 1; });
    const del = [...body.walk()].find((node) => node.tagName === 'BUTTON' && node.textContent === 'Delete');
    del.listeners.click[0]();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const said = [...body.walk()].filter((node) => node.id === 'toast').map((node) => node.textContent);
    assert.deepEqual(said, ['front_fable had already ended; its row is removed.']);
    assert.deepEqual(feeds, ['ws://rig/events'], 'a fresh feed, sent the list whole');
    assert.equal(done, 1, 'the sheet is finished');
  } finally {
    Object.assign(globalThis, saved);
  }
});
