import test from 'node:test';
import assert from 'node:assert/strict';
import { wireTmuxNotifications } from '../src/ws/events.js';
import type { Notification, TmuxClient } from '../src/tmux-client.js';

test('all session-shape notifications feed the sessions refresh and activity is registered once', () => {
  const handlers = new Map<string, (notification: Notification) => void>();
  const removed: string[] = [];
  const client: Pick<TmuxClient, 'on'> = {
    on(kind, handler) {
      handlers.set(kind, handler);
      return () => { handlers.delete(kind); removed.push(kind); };
    },
  };
  let refreshes = 0;
  const stop = wireTmuxNotifications(client, () => { refreshes += 1; });
  const expected = [
    'sessions-changed', 'session-renamed', 'window-add', 'window-close',
    'unlinked-window-add', 'unlinked-window-close', 'unlinked-window-renamed',
  ];
  assert.deepEqual([...handlers.keys()], [...expected, 'subscription']);
  for (const kind of expected) handlers.get(kind)!({ kind, rawKind: `%${kind}`, line: `%${kind}`, args: [] });
  assert.equal(refreshes, expected.length);
  handlers.get('subscription')!({ kind: 'subscription', rawKind: '%subscription-changed', line: '', args: [] });
  assert.equal(refreshes, expected.length, 'activity is exposed for B4 without redundant roster refreshes');
  stop();
  assert.deepEqual(removed, [...expected, 'subscription']);
  assert.equal(handlers.size, 0);
});
