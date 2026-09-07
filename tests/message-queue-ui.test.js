import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
const { dismissalIds, reconcileMessageSelection } = await import(`../public/js/message-queue.js?ui=${Date.now()}`);

test('queue bulk UI derives exact IDs from the displayed snapshot', () => {
  const messages = [{ id: 'a' }, { id: 'b' }];
  const selected = new Set(['b', 'old']);
  assert.deepEqual([...reconcileMessageSelection(selected, messages)], ['b']);
  assert.deepEqual(dismissalIds(messages, selected, 'selected'), ['b']);
  assert.deepEqual(dismissalIds(messages, selected, 'all'), ['a', 'b']);
  assert.ok(!dismissalIds(messages, selected, 'all').includes('new-unread'));
});
