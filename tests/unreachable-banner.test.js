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

test('a socket that never opens shows the message; an open that delivers sessions clears it', () => {
  sayWhenUnreachable();
  store.connect();
  sockets[0].readyState = 3;
  sockets[0].onclose(); // the server did not answer
  assert.deepEqual(lines(), ['could not load the session list: Ronin did not answer on /events']);

  store.renew(); // the store's own retry, brought forward
  sockets[1].readyState = 1;
  sockets[1].onopen();
  sockets[1].onmessage({ data: JSON.stringify({ t: 'sessions', list: [{ name: 'alpha' }] }) });
  assert.equal(bar(), undefined, 'the open took the failure off the screen');

  // Once the page has its list, a dropped connection is the retry's business, not a banner.
  sockets[1].readyState = 3;
  sockets[1].onclose();
  assert.equal(bar(), undefined);
  console.error = quiet;
});
