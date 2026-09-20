import test from 'node:test';
import assert from 'node:assert/strict';
import { settleComposer, sendComposerMessage } from '../public/js/composer-rules.js';

test('the composer clears only on ok, and only if the box still holds what was sent', () => {
  assert.deepEqual(settleComposer({ ok: true }, 'hello', 'hello'), { clear: true, why: null });
  assert.deepEqual(settleComposer({ ok: true }, 'hello', 'hello and more'), { clear: false, why: null });
  assert.deepEqual(settleComposer({ ok: false, why: 'disconnected' }, 'hello', 'hello'), { clear: false, why: 'disconnected' });
  assert.deepEqual(settleComposer({ ok: false }, 'hello', 'hello'), { clear: false, why: 'refused' });
  assert.deepEqual(settleComposer(undefined, 'hello', 'hello'), { clear: false, why: 'refused' });
});

test('one composer send uses the HTTP message funnel with plain text, without a terminal socket', async (t) => {
  const before = globalThis.fetch;
  t.after(() => { globalThis.fetch = before; });
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push([url, init.method, JSON.parse(init.body)]);
    return { status: 200, ok: true, json: async () => ({ ok: true, queued: true }) };
  };
  assert.equal((await sendComposerMessage('agent', 'one\ntwo')).ok, true);
  assert.deepEqual(sent, [['/api/messages', 'POST', { target: 'agent', text: 'one\ntwo' }]]);
});

test('accepted queued text belongs to the server; an unreachable server keeps the box', async (t) => {
  const before = globalThis.fetch;
  t.after(() => { globalThis.fetch = before; });
  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({ ok: true, queued: true }) });
  assert.equal((await sendComposerMessage('agent', 'hello')).ok, true);
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal((await sendComposerMessage('agent', 'hello')).ok, false);
});

test('mobile box Enter sends once even with the terminal socket down; edits during send survive', async (t) => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const oldResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  class Element {
    constructor() {
      this.value = ''; this.style = {}; this.events = {}; this.children = [];
      const classes = new Set();
      this.classList = {
        add: (v) => classes.add(v), remove: (v) => classes.delete(v), contains: (v) => classes.has(v),
        toggle: (v, on) => on ? classes.add(v) : classes.delete(v),
      };
    }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.append(child); }
    setAttribute() {}
    addEventListener(name, handler) { this.events[name] = handler; }
  }
  globalThis.document = { createElement: () => new Element() };
  t.after(() => { globalThis.window = oldWindow; globalThis.document = oldDocument; globalThis.ResizeObserver = oldResizeObserver; });
  const { buildComposer } = await import('../public/js/composer.js');
  const sent = [];
  let finish;
  const composer = buildComposer(new Element(), {
    connected: () => false, send: () => assert.fail('message must not use terminal keys'),
    activate() {}, clearOverlays() {}, scrollToBottom() {},
    sendMessage: (text) => { sent.push(text); return new Promise((resolve) => { finish = resolve; }); },
  });
  composer.ta.value = 'one press';
  const enter = () => composer.ta.events.keydown({ key: 'Enter', preventDefault() {} });
  enter(); enter();
  assert.deepEqual(sent, ['one press']);
  finish({ ok: true });
  await Promise.resolve();
  assert.equal(composer.ta.value, '');
  composer.ta.value = 'second';
  enter();
  composer.ta.value = 'new draft';
  finish({ ok: true });
  await Promise.resolve();
  assert.equal(composer.ta.value, 'new draft');
});
