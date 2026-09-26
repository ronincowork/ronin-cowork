import test from 'node:test';
import assert from 'node:assert/strict';

// The page says when it cannot reach Ronin, and the socket is the truth of that.
// A small DOM: the failure bar is the only thing drawn here.
class Node {
  constructor() { this.children = []; this.className = ''; this.textContent = ''; this.parent = null; }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  append(...kids) { for (const kid of kids) this.appendChild(kid); }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  insertBefore(child) { return this.appendChild(child); }
  addEventListener() {}
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  get firstChild() { return this.children[0] || null; }
}
const body = new Node();
globalThis.document = { createElement: () => new Node(), body, documentElement: body };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {} };
globalThis.location = { protocol: 'http:', host: 'test' };
const sockets = [];
globalThis.WebSocket = class { constructor() { this.readyState = 0; sockets.push(this); } send() {} };
const quiet = console.error;
console.error = () => {}; // showFailure logs every failure; the bar is what is under test

const { store } = await import('../public/js/store.js');
const { sayWhenUnreachable } = await import('../public/js/events.js');

const bar = () => body.children.find((child) => child.id === 'failbar');
const lines = () => (bar()?.children || []).filter((c) => c.className === 'failbar-line').map((c) => c.textContent);

const MESSAGE = 'cannot reach Ronin: the live connection is closed; what this page shows may be out of date. It reconnects on its own.';

test('the bar is up while the socket is closed — at boot and after — and each open takes it down', () => {
  sayWhenUnreachable();
  store.connect();
  sockets[0].readyState = 3;
  sockets[0].onclose(); // the server did not answer at boot
  assert.deepEqual(lines(), [MESSAGE]);

  store.renew(); // the store's own retry, brought forward
  sockets[1].readyState = 1;
  sockets[1].onopen();
  sockets[1].onmessage({ data: JSON.stringify({ t: 'sessions', list: [{ name: 'alpha' }] }) });
  assert.equal(bar(), undefined, 'the open took the failure off the screen');

  // The server goes away after boot: the page says so, once, however often the retry fails.
  sockets[1].readyState = 3;
  sockets[1].onclose();
  store.renew();
  sockets[2].readyState = 3;
  sockets[2].onclose();
  assert.deepEqual(lines(), [MESSAGE]);

  store.renew();
  sockets[3].readyState = 1;
  sockets[3].onopen();
  assert.equal(bar(), undefined, 'the reopen cleared it');
  console.error = quiet;
});

test('desktop and phone both say it, before their socket opens', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['main.js', 'phone.js']) {
    const text = await readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');
    assert.match(text, /guard\('say when Ronin is unreachable', sayWhenUnreachable\);\s*guard\('session event stream', connect\)/, file);
  }
});
