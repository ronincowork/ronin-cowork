import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

globalThis.window = { matchMedia: () => ({ matches: false }) };
const { createSubmitGate, retireSession, runShutdownPolling } = await import(`../public/js/session-retire.js?test=${Date.now()}`);

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

test('safe shutdown publishes immediate and polled phases through success', async () => {
  const seen = [];
  const rows = [
    { id: 'op', state: 'running', phase: 'checking_desks', message: 'Checking assigned desks (2 found)' },
    { id: 'op', state: 'running', phase: 'closing_desks', message: 'Closing safe desks (2/2)' },
    { id: 'op', state: 'complete', phase: 'complete', message: 'Agent a and 2 assigned desk(s) closed' },
  ];
  const result = await runShutdownPolling('a', {
    start: async () => ({ id: 'op', state: 'running', phase: 'resolving_agent', message: 'Resolving Agent a' }),
    poll: async () => rows.shift(), wait: async () => {}, onProgress: (row) => seen.push(row.message),
  });
  assert.equal(seen[0], 'Resolving Agent…');
  assert.ok(seen.includes('Checking assigned desks (2 found)'));
  assert.ok(seen.includes('Closing safe desks (2/2)'));
  assert.equal(result.state, 'complete');
});

test('safe shutdown timeout is bounded and actionable', async () => {
  let clock = 0;
  await assert.rejects(() => runShutdownPolling('a', {
    start: async () => ({ id: 'op', state: 'running', message: 'Checking' }),
    poll: async () => ({ id: 'op', state: 'running', message: 'Checking' }),
    wait: async () => { clock += 20; }, now: () => clock, timeoutMs: 50,
  }), /timed out.*left available/);
});

test('a hung backend poll times out and returns control to the dialog', async () => {
  await assert.rejects(() => runShutdownPolling('a', {
    start: async () => ({ id: 'op', state: 'running', message: 'Checking' }),
    poll: async () => new Promise(() => {}), wait: async () => {}, pollTimeoutMs: 5,
  }), /status check timed out; controls restored/);
});

test('actionable backend refusal is rendered as the terminal failure', async () => {
  const refusal = 'ronin:team/t/a: dirty files: x. NEXT: run git status';
  await assert.rejects(() => runShutdownPolling('a', {
    start: async () => ({ id: 'op', state: 'running', message: 'Resolving' }),
    poll: async () => ({ id: 'op', state: 'failed', error: refusal, message: refusal }), wait: async () => {},
  }), new RegExp(refusal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
