import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
const { dismissalIds, reconcileMessageSelection } = await import(`../public/js/message-queue.js?ui=${Date.now()}`);

test('queue bulk UI derives exact IDs from the displayed snapshot', () => {
  const messages = [{ id: 'a', source: 'tell' }, { id: 'b', source: 'wipeboard_notice' }];
  const selected = new Set(['b', 'old']);
  assert.deepEqual([...reconcileMessageSelection(selected, messages)], ['b']);
  assert.deepEqual(dismissalIds(messages, selected, 'selected'), ['b']);
  assert.deepEqual(dismissalIds(messages, selected, 'all'), ['a', 'b']);
  assert.ok(!dismissalIds(messages, selected, 'all').includes('new-unread'));
});

test('wipeboard dismissal selects only displayed notification copies in a mixed queue', () => {
  const displayed = [
    { id: 'tell', source: 'tell' },
    { id: 'board-1', source: 'wipeboard_notice' },
    { id: 'house', source: 'house' },
    { id: 'owner', source: 'owner' },
    { id: 'cron', source: 'jikan' },
    { id: 'board-2', source: 'wipeboard_notice' },
  ];
  assert.deepEqual(dismissalIds(displayed, new Set(), 'wipeboard'), ['board-1', 'board-2']);
  assert.ok(!dismissalIds(displayed, new Set(), 'wipeboard').includes('new-board-notice'));
});
