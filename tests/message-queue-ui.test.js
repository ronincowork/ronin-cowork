import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
const { attentionIds, dismissalIds, forceableIds, reconcileMessageSelection } = await import(`../public/js/message-queue.js?ui=${Date.now()}`);

test('queue bulk UI derives exact IDs from the displayed snapshot', () => {
  const messages = [{ id: 'a', source: 'tell' }, { id: 'b', source: 'wipeboard_notice' }];
  const selected = new Set(['b', 'old']);
  assert.deepEqual([...reconcileMessageSelection(selected, messages)], ['b']);
  assert.deepEqual(dismissalIds(messages, selected, 'selected'), ['b']);
  assert.deepEqual(dismissalIds(messages, selected, 'all'), ['a', 'b']);
  assert.ok(!dismissalIds(messages, selected, 'all').includes('new-unread'));
});

test('bulk force acts on the chosen cards only, and never on a missing target', () => {
  const displayed = [
    { id: 'tell', source: 'tell', state: 'stuck' },
    { id: 'board-1', source: 'wipeboard_notice', state: 'failed' },
    { id: 'gone', source: 'house', state: 'target_missing' },
    { id: 'owner', source: 'owner', state: 'stuck' },
  ];
  const selected = new Set(['tell', 'gone', 'owner', 'new-unread']);
  assert.deepEqual(forceableIds(displayed, selected), ['tell', 'owner']);
  assert.deepEqual(forceableIds(displayed, new Set()), []);
});

test('the flash fires once per auto-forced message, and never for an un-forced one', () => {
  const displayed = [
    { id: 'fresh', state: 'stuck' },
    { id: 'failed-by-hand', state: 'failed' },
    { id: 'auto-forced', state: 'failed', auto_forced_at: '2026-09-09T10:00:00.000Z' },
  ];
  assert.deepEqual(attentionIds(displayed), ['auto-forced']);
});
