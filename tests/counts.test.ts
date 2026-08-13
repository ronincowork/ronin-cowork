/**
 * The counting socket's whole contract (src/counts.ts): a free build with no sink is
 * a no-op, a broken sink never reaches the route, a wired sink gets the fact intact.
 * Order matters — the no-sink case must run before any setCountSink().
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { count, setCountSink, type CountFields } from '../src/counts.js';

test('the free build: count() with no sink is a silent no-op', () => {
  count('dial.set', { dial: 'read' }); // must simply not throw
});

test('a throwing sink never reaches the caller', () => {
  setCountSink(() => {
    throw new Error('a broken counter');
  });
  count('tag.set'); // SOROBAN: counting never breaks a request
});

test('a wired sink receives the event and its fields verbatim', () => {
  const got: Array<[string, CountFields]> = [];
  setCountSink((e, f) => got.push([e, f]));
  count('ended', { name: 'a', end: 'harakiri' });
  count('board.post');
  assert.deepEqual(got, [
    ['ended', { name: 'a', end: 'harakiri' }],
    ['board.post', {}],
  ]);
});
