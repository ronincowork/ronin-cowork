import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
const { dismissalIds } = await import(`../public/js/message-queue.js?ui=${Date.now()}`);

test('dismiss all uses exactly the displayed queue snapshot', () => {
  assert.deepEqual(dismissalIds([{ id: 'a' }, { id: 'b' }]), ['a', 'b']);
});
