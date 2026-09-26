import test from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import type { SessionInfo } from '../src/tmux.js';
import { feedEvents, handleEvents, homeSignature, tick } from '../src/ws/events.js';

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
    got: (t: string) => sent.filter((msg) => msg.t === t),
    close() { ws.readyState = 3; handlers.get('close')?.(); },
  };
}

// Every test starts from a fresh feed and closes its browsers, so the module's held rows,
// signatures and connections never carry from one test into the next.
function open(t: { after: (fn: () => void) => void }) {
  const b = browser();
  handleEvents(b.ws);
  t.after(() => b.close());
  return b;
}

const session = (name: string) => ({ name, tags: [], leads: [], campaign_id: '', activity: 1 }) as unknown as SessionInfo;
// Joins whatever tick is in flight (a connection starts one), then lets its sends land.
const settle = async () => { await tick(false); await new Promise((resolve) => setImmediate(resolve)); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

test('a changed row broadcasts home once; an unchanged tick broadcasts nothing; a fresh connection receives the rows', async (t) => {
  let rows: Array<Record<string, unknown>> = [{ name: 'a', stance: 'idle', activity: 1, at: '2026-09-26T01:00:00Z', ctx: 10 }];
  feedEvents({ list: async () => [session('a')], home: async () => rows });

  const first = open(t);
  await settle();
  assert.deepEqual(first.got('home'), [{ t: 'home', rows }], 'a fresh connection receives the rows');
  assert.equal(first.got('sessions').length, 1, 'and the session list');

  await tick(false);
  assert.equal(first.got('home').length, 1, 'an unchanged tick broadcasts nothing');
  assert.equal(first.got('sessions').length, 1);

  rows = [{ ...rows[0], activity: 2, at: '2026-09-26T01:00:05Z' }];
  await tick(false);
  assert.equal(first.got('home').length, 1, 'activity and stance time are not painted, so they do not push');

  rows = [{ ...rows[0], stance: 'working', ctx: 42 }];
  await Promise.all([tick(false), tick(false)]);
  await tick(false);
  assert.deepEqual(first.got('home').slice(1), [{ t: 'home', rows }], 'a changed row broadcasts home once');

  const second = open(t);
  await settle();
  assert.deepEqual(second.got('home'), [{ t: 'home', rows }], 'a later connection receives the current rows, once');
  assert.equal(first.got('home').length, 2, 'and the connection already open is not sent them again');
});

test('one session listing per tick feeds the session list and the home rows', async (t) => {
  let listings = 0;
  const seen: string[][] = [];
  feedEvents({
    list: async () => { listings += 1; return [session('a'), session('b')]; },
    home: async (sessions) => { seen.push(sessions.map((s) => s.name)); return sessions.map((s) => ({ name: s.name })); },
  });
  open(t);
  await settle();
  listings = 0;
  seen.length = 0;
  await tick(true);
  assert.equal(listings, 1);
  assert.deepEqual(seen, [['a', 'b']], 'the home rows are built from the listing the tick took');
});

test('a failing loader leaves a fresh tab with no rows, and the next successful tick sends them', async (t) => {
  let fail = true;
  const rows = [{ name: 'a', stance: 'idle' }];
  feedEvents({ list: async () => [session('a')], home: async () => { if (fail) throw new Error('capture failed'); return rows; } });
  const b = open(t);
  await settle();
  assert.deepEqual(b.got('home'), [], 'nothing is sent in place of rows that could not be read');
  assert.equal(b.got('sessions').length, 1, 'the session list still arrives');
  fail = false;
  await tick(false);
  assert.deepEqual(b.got('home'), [{ t: 'home', rows }]);
});

test('a tab that connects while the listing fails is sent what every other tab holds', async (t) => {
  let fail = false;
  const rows = [{ name: 'a', stance: 'idle' }];
  feedEvents({ list: async () => { if (fail) throw new Error('tmux is restarting'); return [session('a')]; }, home: async () => rows });
  const first = open(t);
  await settle();
  assert.equal(first.got('sessions').length, 1);
  fail = true;
  const late = open(t);
  await settle();
  assert.deepEqual(late.got('sessions').map((m) => (m.list as Array<{ name: string }>).map((s) => s.name)), [['a']], 'the last good session list');
  assert.deepEqual(late.got('home'), [{ t: 'home', rows }], 'and the rows');
  assert.equal(first.got('sessions').length, 1, 'the tab already open is sent nothing again');
});

test('a connection arriving while a tick is in flight receives each message once', async (t) => {
  const rows = deferred<unknown[]>();
  feedEvents({ list: async () => [session('a')], home: () => rows.promise });
  const first = open(t);
  while (!first.got('sessions').length) await new Promise((resolve) => setImmediate(resolve));
  // The tick has broadcast the session list and now waits on the rows.
  const late = open(t); // joins that tick: the session list went out before it arrived
  rows.resolve([{ name: 'a', stance: 'idle' }]);
  await settle();
  for (const b of [first, late]) {
    assert.equal(b.got('sessions').length, 1, 'the session list once: broadcast, or sent because the broadcast missed it');
    assert.equal(b.got('home').length, 1, 'the rows once: the broadcast reached it');
  }
});

test('the home signature ignores only activity and stance time', () => {
  const row = { name: 'a', stance: 'idle', activity: 1, at: 'x', tegami: { at: 'kept' } };
  assert.equal(homeSignature([row]), homeSignature([{ ...row, activity: 9, at: 'y' }]));
  assert.notEqual(homeSignature([row]), homeSignature([{ ...row, tegami: { at: 'changed' } }]));
  assert.notEqual(homeSignature([row]), homeSignature([{ ...row, stance: 'working' }]));
});
