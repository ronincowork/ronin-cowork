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
    return { status: 200, ok: true, text() { return this.json().then((b) => JSON.stringify(b)); }, json: async () => ({ ok: true, queued: true }) };
  };
  assert.equal((await sendComposerMessage('agent', 'one\ntwo')).ok, true);
  assert.deepEqual(sent, [['/api/messages', 'POST', { target: 'agent', text: 'one\ntwo' }]]);
});

test('accepted queued text belongs to the server; an unreachable server keeps the box', async (t) => {
  const before = globalThis.fetch;
  t.after(() => { globalThis.fetch = before; });
  globalThis.fetch = async () => ({ status: 200, ok: true, text() { return this.json().then((b) => JSON.stringify(b)); }, json: async () => ({ ok: true, queued: true }) });
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

import { readFile } from 'node:fs/promises';
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('the composer offers no microphone until Voice is rebuilt', async () => {
  const [composer, style] = await Promise.all([read('public/js/composer.js'), read('public/style.css')]);
  // Withdrawn whole (owner, 2026-09-24): speech-to-text and text-to-speech get their own
  // controls when Voice is rethought. It was drawn on any touch surface the BROWSER could
  // record on, which says nothing about whether the machine can transcribe — Koe is parked
  // here, and /api/health advertised transcribe:true off a default URL string that is
  // never empty, so the button was always drawn and always failed.
  assert.doesNotMatch(composer, /cmic|CAN_RECORD|wireDictation|dictation/);
  assert.doesNotMatch(style, /\.cmic/);
  // The engine stays standing; it is not what was wrong.
  const voice = await read('public/js/voice.js');
  assert.match(voice, /export function wireDictation/);
  assert.match(voice, /composer\.mic_title/);
  const lexicon = await read('ronin_catalogs/lexicons/professional_en.md');
  assert.match(lexicon, /composer\.mic_title/, 'voice.js still reads this word');
});

test('the keys row stands down in text entry', async () => {
  const [composer, style] = await Promise.all([read('public/js/composer.js'), read('public/style.css')]);
  // Two rows of controls above an on-screen keyboard is the screen twice over.
  //
  // The signal is FOCUS, not a measured keyboard height. Measuring looked more precise
  // and was not: it needed a pixel threshold to survive the stray offset iOS reports
  // while scrolling, that guess was wrong on the owner's phone, and the row never went
  // away. Focus is what entering text entry means and it needs no number.
  assert.match(composer, /ta\.addEventListener\('focus', \(\) => \{ wrap\.classList\.add\('kb-open'\)/);
  assert.match(composer, /blur[\s\S]{0,160}classList\.remove\('kb-open'\)/, 'leaving the box brings the row straight back');
  assert.doesNotMatch(composer, /kb > \d+/, 'no pixel threshold decides this any more');
  assert.match(style, /\.composer\.kb-open \.keysrow \{\s*display: none;/);
  // The hiding rule must out-rank the rule that shows the row, or nothing happens.
  const hide = style.indexOf('.composer.kb-open .keysrow');
  const show = style.indexOf(".tile:is(.tape-on, .keys-on, .transcript-on) .composer .keysrow {");
  assert.ok(hide >= 0 && show >= 0, 'both rules exist');
  assert.match(style.slice(hide, show), /display: none/);
});
