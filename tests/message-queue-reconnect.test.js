import test from 'node:test';
import assert from 'node:assert/strict';

class FakeElement {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.textContent = ''; this.className = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute() {}
}

test('the message queue keeps its board and quietly reconnects when polling rejects', async () => {
  const beforeDocument = globalThis.document;
  const beforeFetch = globalThis.fetch;
  globalThis.document = { createElement: (tag) => new FakeElement(tag) };
  globalThis.fetch = async () => { throw new Error('restart'); };
  try {
    const { buildMessageQueue } = await import(`../public/js/message-queue.js?reconnect=${Date.now()}`);
    const host = new FakeElement('div');
    const queue = buildMessageQueue(host);
    const board = host.children[2];
    board.append(new FakeElement('article'));
    queue.enter();
    await new Promise((resolve) => setTimeout(resolve, 0));
    queue.leave();
    assert.equal(host.children[1].textContent, 'Reconnecting…');
    assert.equal(board.children.length, 1, 'the last rendered board remains visible');
  } finally {
    globalThis.document = beforeDocument;
    globalThis.fetch = beforeFetch;
  }
});
