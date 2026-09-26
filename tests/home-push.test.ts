import test from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { feedPushedResources, handleEvents, homeSignature, refreshPushedResources } from '../src/ws/events.js';

// A browser on /events: records what it is sent, and can close.
function browser() {
  const sent: Array<Record<string, unknown>> = [];
  const handlers = new Map<string, () => void>();
  const ws = {
    OPEN: 1,
    readyState: 1,
    send(text: string) { sent.push(JSON.parse(text) as Record<string, unknown>); },
    on(event: string, fn: () => void) { handlers.set(event, fn); },
  };
  return {
    ws: ws as unknown as WebSocket,
    // The sessions message comes from live tmux on connect and is not what is tested here.
    pushed: (t: string) => sent.filter((msg) => msg.t === t),
    close() { ws.readyState = 3; handlers.get('close')?.(); },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('home rows and desks are pushed once per change, never on an unchanged tick, and whole to a fresh connection', async () => {
  let rows: Array<Record<string, unknown>> = [{ name: 'a', stance: 'idle', activity: 1, at: '2026-09-26T01:00:00Z', ctx: 10 }];
  let desks: Record<string, unknown> = { a: { session: 'a', desks: [] } };
  feedPushedResources({ home: async () => rows, desks: async () => desks });

  const first = browser();
  handleEvents(first.ws);
  await settle();
  assert.deepEqual(first.pushed('home'), [{ t: 'home', rows }], 'a fresh connection receives the rows');
  assert.deepEqual(first.pushed('desks'), [{ t: 'desks', list: desks }], 'and the desks');

  await refreshPushedResources();
  assert.equal(first.pushed('home').length, 1, 'an unchanged tick broadcasts nothing');
  assert.equal(first.pushed('desks').length, 1);

  rows = [{ ...rows[0], activity: 2, at: '2026-09-26T01:00:05Z' }];
  await refreshPushedResources();
  assert.equal(first.pushed('home').length, 1, 'activity and stance time are not painted, so they do not push');

  rows = [{ ...rows[0], stance: 'working', ctx: 42 }];
  await Promise.all([refreshPushedResources(), refreshPushedResources()]);
  await refreshPushedResources();
  assert.deepEqual(first.pushed('home').slice(1), [{ t: 'home', rows }], 'a changed row broadcasts home once');

  desks = { a: { session: 'a', desks: [{ dirty: true }] } };
  await refreshPushedResources();
  await refreshPushedResources();
  assert.deepEqual(first.pushed('desks').slice(1), [{ t: 'desks', list: desks }], 'a changed desk broadcasts desks once');

  const second = browser();
  handleEvents(second.ws);
  await settle();
  assert.deepEqual(second.pushed('home'), [{ t: 'home', rows }], 'a later connection receives the current rows, once');
  assert.equal(first.pushed('home').length, 2, 'and the connection already open is not sent them again');

  first.close();
  second.close();
});

test('the home signature ignores only activity and stance time', () => {
  const row = { name: 'a', stance: 'idle', activity: 1, at: 'x', tegami: { at: 'kept' } };
  assert.equal(homeSignature([row]), homeSignature([{ ...row, activity: 9, at: 'y' }]));
  assert.notEqual(homeSignature([row]), homeSignature([{ ...row, tegami: { at: 'changed' } }]));
  assert.notEqual(homeSignature([row]), homeSignature([{ ...row, stance: 'working' }]));
});
