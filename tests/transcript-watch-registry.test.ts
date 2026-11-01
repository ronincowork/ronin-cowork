/**
 * WHO RECEIVES AN AGENT'S RECORDS — the connection half.
 *
 * The owner's rule: a phone should not be hit by anything that is not for a tab in chat mode
 * on that phone. Connections are Core's; what a reading admits is the transcript part's.
 * This is the Core half: one list per connection (a tile per entry), replaced whole when a tab
 * changes what it shows, and gone when the socket goes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverToWatchers, unwatch, watchFor, watcherCount } from '../src/ws/watchers.js';

const socket = () => {
  const sent: string[] = [];
  return { readyState: 1, OPEN: 1, send: (text: string) => sent.push(text), sent } as never as
    { readyState: number; OPEN: number; send: (t: string) => void; sent: string[] };
};

test('a record goes only to the connections watching that Agent', () => {
  const watchingA = socket();
  const watchingB = socket();
  const watchingNothing = socket();
  watchFor(watchingA as never, [{ session: 'alpha', reading: 'chat' }]);
  watchFor(watchingB as never, [{ session: 'bravo', reading: 'chat' }]);

  const sent = deliverToWatchers('alpha', () => ({ t: 'transcript', session: 'alpha' }));
  assert.equal(sent, 1);
  assert.equal(watchingA.sent.length, 1);
  assert.equal(watchingB.sent.length, 0, 'a tab watching another Agent heard nothing');
  assert.equal(watchingNothing.sent.length, 0, 'and a tab watching nothing heard nothing');
  unwatch(watchingA as never); unwatch(watchingB as never);
});

test('the reading is asked for once, however many tabs share it', () => {
  const one = socket(); const two = socket(); const work = socket();
  watchFor(one as never, [{ session: 'alpha', reading: 'chat' }]);
  watchFor(two as never, [{ session: 'alpha', reading: 'chat' }]);
  watchFor(work as never, [{ session: 'alpha', reading: 'work' }]);
  const asked: string[] = [];
  deliverToWatchers('alpha', (reading) => { asked.push(reading); return { reading }; });
  assert.deepEqual(asked.sort(), ['chat', 'work'], 'twenty tabs on one reading cost one application of it');
  assert.equal(one.sent.length, 1); assert.equal(two.sent.length, 1); assert.equal(work.sent.length, 1);
  unwatch(one as never); unwatch(two as never); unwatch(work as never);
});

test('a reading that admits nothing sends that tab nothing at all', () => {
  const chat = socket();
  watchFor(chat as never, [{ session: 'alpha', reading: 'chat' }]);
  // What the part answers when the record is a tool call and the tab is showing Chat.
  const sent = deliverToWatchers('alpha', (reading) => (reading === 'chat' ? null : { reading }));
  assert.equal(sent, 0);
  assert.equal(chat.sent.length, 0, 'silence, not an empty message');
  unwatch(chat as never);
});

test('a tab changing what it shows replaces its registration rather than adding one', () => {
  const tab = socket();
  watchFor(tab as never, [{ session: 'alpha', reading: 'chat' }]);
  watchFor(tab as never, [{ session: 'bravo', reading: 'work' }]);
  assert.equal(deliverToWatchers('alpha', () => ({})), 0, 'the Agent it left stops reaching it');
  assert.equal(deliverToWatchers('bravo', () => ({})), 1);
  // Nothing to unsubscribe: showing nothing is an empty list.
  watchFor(tab as never, []);
  assert.equal(deliverToWatchers('bravo', () => ({})), 0);
  assert.equal(watcherCount(), 0, 'and it is not remembered');
});

test('a closed socket is forgotten, and a dead one is not written to', () => {
  const gone = socket();
  watchFor(gone as never, [{ session: 'alpha', reading: 'chat' }]);
  unwatch(gone as never);
  assert.equal(deliverToWatchers('alpha', () => ({})), 0);
  assert.equal(watcherCount(), 0);

  const closing = socket();
  watchFor(closing as never, [{ session: 'alpha', reading: 'chat' }]);
  closing.readyState = 3; // CLOSED
  assert.equal(deliverToWatchers('alpha', () => ({})), 0, 'a socket on its way out is not written to');
  unwatch(closing as never);
});

test('one tab with two tiles in Chat hears both Agents, and one tile leaving keeps the other', () => {
  // Owner, 2026-11-01: one slot per tab meant a tile leaving Chat silenced every other tile.
  const tab = socket();
  watchFor(tab as never, [{ session: 'alpha', reading: 'chat' }, { session: 'bravo', reading: 'chat' }]);
  assert.equal(deliverToWatchers('alpha', () => ({})), 1);
  assert.equal(deliverToWatchers('bravo', () => ({})), 1);
  watchFor(tab as never, [{ session: 'alpha', reading: 'chat' }]);
  assert.equal(deliverToWatchers('alpha', () => ({})), 1, 'the tile still in Chat still hears its Agent');
  assert.equal(deliverToWatchers('bravo', () => ({})), 0);
  // Two tiles on one Agent and reading are one message: the page hands it to both.
  watchFor(tab as never, [{ session: 'alpha', reading: 'chat' }, { session: 'alpha', reading: 'chat' }]);
  assert.equal(deliverToWatchers('alpha', () => ({})), 1);
  unwatch(tab as never);
});
