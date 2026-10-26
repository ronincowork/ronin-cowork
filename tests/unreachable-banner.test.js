import test from 'node:test';
import assert from 'node:assert/strict';

class Node {
  constructor() { this.children = []; this.className = ''; this.textContent = ''; this.hidden = false; }
  appendChild(child) { this.children.push(child); return child; }
  append(...kids) { for (const kid of kids) this.appendChild(kid); }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  addEventListener() {}
}
const body = new Node();
globalThis.document = { createElement: () => new Node(), getElementById: () => null, body, documentElement: body };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {} };
globalThis.location = { protocol: 'http:', host: 'test' };
const sockets = [];
globalThis.WebSocket = class { constructor() { this.readyState = 0; sockets.push(this); } send() {} };

const { store } = await import('../public/js/store.js');
const { sayWhenUnreachable } = await import('../public/js/events.js');

test('a quick restart stays quiet; a lasting close says Reconnecting in the supplied bar slot until open', async () => {
  const status = new Node();
  status.hidden = true;
  sayWhenUnreachable(status);
  store.connect();

  sockets[0].readyState = 3;
  sockets[0].onclose();
  assert.equal(status.hidden, true, 'close is not immediately painted as an error or status');
  store.renew();
  sockets[1].readyState = 1;
  sockets[1].onopen();
  await new Promise((resolve) => setTimeout(resolve, 3100));
  assert.equal(status.hidden, true, 'a fast restart never appears');

  sockets[1].readyState = 3;
  sockets[1].onclose();
  await new Promise((resolve) => setTimeout(resolve, 3100));
  assert.equal(status.textContent, 'Reconnecting…');
  assert.equal(status.hidden, false);
  store.renew();
  sockets.at(-1).readyState = 1;
  sockets.at(-1).onopen();
  assert.equal(status.hidden, true, 'open clears the quiet status');
});

test('desktop and phone both install the quiet top-bar status', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('../public/js/main.js', import.meta.url), 'utf8');
  const phone = await readFile(new URL('../public/js/phone.js', import.meta.url), 'utf8');
  const events = await readFile(new URL('../public/js/events.js', import.meta.url), 'utf8');
  const desktop = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(main, /sayWhenUnreachable\(document\.getElementById\('connectionstate'\)\)/);
  assert.match(phone, /sayWhenUnreachable\(connectionStatus\)/);
  assert.match(phone, /paintBar = \(\.\.\.nodes\) => bar\.replaceChildren\(\.\.\.nodes, connectionStatus\)/);
  assert.match(desktop, /id="connectionstate" class="connection-state" hidden/);
  assert.doesNotMatch(events, /showFailure|clearFailure|failbar|new Error/);
});
