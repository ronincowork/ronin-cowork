import test from 'node:test';
import assert from 'node:assert/strict';
import { PARCEL_TIMEOUT_MS, TileWire } from '../public/js/tilewire.js';
import { settleComposer } from '../public/js/composer-rules.js';
import { deliverParcel, parcelInputActions } from '../src/viewer.ts';
import { isParcel } from '../src/ws/pty.ts';

// The phone fault (2026-09-08): a composer message rode the keystroke frame, the host
// discarded it while the shared pane was in copy mode, and the box cleared anyway.

test('a composer parcel leaves a scrolled-back view first; at the bottom it is just typed', () => {
  assert.deepEqual(parcelInputActions({ inMode: true, appWantsMouse: false }), ['cancel', 'write']);
  assert.deepEqual(parcelInputActions({ inMode: true, appWantsMouse: true }), ['cancel', 'write']);
  assert.deepEqual(parcelInputActions({ inMode: false, appWantsMouse: false }), ['write']);
  assert.deepEqual(parcelInputActions({ inMode: false, appWantsMouse: true }), ['write']);
});

test('delivery cancels copy mode, then writes, and says ok only after the write', async () => {
  const log = [];
  let inMode = true;
  const io = {
    state: async () => { log.push('state'); return { inMode, appWantsMouse: false }; },
    leave: async () => { log.push('leave'); inMode = false; },
  };
  const outcome = await deliverParcel('probe', 'hello\r', (d) => log.push(`write:${d}`), io);
  assert.deepEqual(outcome, { ok: true });
  assert.deepEqual(log, ['state', 'leave', 'state', 'write:hello\r']);
});

test('delivery at the bottom is one read and one write, no cancel', async () => {
  const log = [];
  const io = { state: async () => ({ inMode: false, appWantsMouse: false }), leave: async () => log.push('leave') };
  assert.deepEqual(await deliverParcel('probe', 'x\r', (d) => log.push(d), io), { ok: true });
  assert.deepEqual(log, ['x\r']);
});

test('a pane that will not leave copy mode is a refusal with a reason, and nothing is written', async () => {
  const written = [];
  const io = { state: async () => ({ inMode: true, appWantsMouse: false }), leave: async () => {} };
  const outcome = await deliverParcel('probe', 'x\r', (d) => written.push(d), io);
  assert.equal(outcome.ok, false);
  assert.match(outcome.why, /scrolled-back/);
  assert.deepEqual(written, []);
});

test('the parcel frame is its own message type with an id; keystroke frames are untouched', () => {
  assert.equal(isParcel({ t: 'm', id: '1', d: 'hello\r' }), true);
  assert.equal(isParcel({ t: 'i', d: 'hello\r' }), false);
  assert.equal(isParcel({ t: 'm', d: 'hello\r' }), false);
  assert.equal(isParcel({ t: 'm', id: '', d: 'hello\r' }), false);
  assert.equal(isParcel({ t: 'm', id: 'x'.repeat(65), d: 'hello\r' }), false);
  assert.equal(isParcel({ t: 'p', id: '1', d: '\x1b[>0;276;0c' }), false);
});

const fakeSocket = (sent) => ({ readyState: 1, send: (raw) => sent.push(JSON.parse(raw)), close() { this.readyState = 3; } });

test('the wire sends a parcel as {t:"m"} and resolves on the host answer of the same id', async () => {
  const wire = new TileWire({ onDrop: () => assert.fail('a connected send is not a drop') });
  const sent = [];
  wire.ws = fakeSocket(sent);
  const first = wire.sendParcel('one\r');
  const second = wire.sendParcel('two\r');
  assert.deepEqual(sent, [{ t: 'm', id: '1', d: 'one\r' }, { t: 'm', id: '2', d: 'two\r' }]);
  // Answers come back out of order; each settles its own parcel.
  assert.equal(wire.parcels.size, 2);
  wire.parcels.get('2')({ ok: false, why: 'the pane stayed in its scrolled-back view' });
  wire.parcels.get('1')({ ok: true });
  assert.deepEqual(await first, { ok: true });
  assert.deepEqual(await second, { ok: false, why: 'the pane stayed in its scrolled-back view' });
  assert.equal(wire.parcels.size, 0);
});

test('a parcel answer is consumed by the wire and never reaches the tile as a control message', async () => {
  const control = [];
  const wire = new TileWire({ onStatus() {}, onOpen() {}, onControl: (m) => control.push(m), onBytes() {}, onDrop() {}, reopen() {} });
  // Build the real onmessage through open() against a stub WebSocket.
  const sockets = [];
  const RealWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = class { constructor(url) { this.url = url; this.readyState = 1; sockets.push(this); } send(raw) { this.sent = (this.sent || []).concat(JSON.parse(raw)); } close() { this.readyState = 3; } };
  globalThis.location = { protocol: 'http:', host: 'rig' };
  try {
    wire.open({ session: 'probe', locked: true, cols: 80, rows: 24 });
    const ws = sockets[0];
    const pending = wire.sendParcel('hello\r');
    ws.onmessage({ data: JSON.stringify({ t: 'm', id: '1', ok: true }) });
    ws.onmessage({ data: JSON.stringify({ t: 'ready', session: 'probe' }) });
    assert.deepEqual(await pending, { ok: true });
    assert.deepEqual(control, [{ t: 'ready', session: 'probe' }]);
  } finally {
    globalThis.WebSocket = RealWebSocket;
    delete globalThis.location;
  }
});

test('a socket that closes under a waiting parcel settles it as disconnected, without a retry', async () => {
  const wire = new TileWire({ onStatus() {}, onOpen() {}, onControl() {}, onBytes() {}, onDrop() {}, reopen() {} });
  const sockets = [];
  const RealWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = class { constructor() { this.readyState = 1; sockets.push(this); } send() { this.count = (this.count || 0) + 1; } close() { this.readyState = 3; } };
  globalThis.location = { protocol: 'http:', host: 'rig' };
  try {
    wire.open({ session: 'probe', locked: true, cols: 80, rows: 24 });
    const ws = sockets[0];
    const pending = wire.sendParcel('hello\r');
    ws.onclose();
    assert.deepEqual(await pending, { ok: false, why: 'disconnected' });
    assert.equal(ws.count, 1);
  } finally {
    globalThis.WebSocket = RealWebSocket;
    delete globalThis.location;
  }
});

test('a parcel with no socket is refused at once and reported as a drop', async () => {
  let drops = 0;
  const wire = new TileWire({ onDrop: () => { drops++; } });
  assert.deepEqual(await wire.sendParcel('hello\r'), { ok: false, why: 'not connected' });
  assert.equal(drops, 1);
});

test('a host that never answers leaves the parcel unconfirmed after the timeout', async () => {
  const wire = new TileWire({ onDrop() {} });
  wire.ws = fakeSocket([]);
  assert.ok(PARCEL_TIMEOUT_MS >= 1000);
  assert.deepEqual(await wire.sendParcel('hello\r', 10), { ok: false, why: 'unconfirmed' });
  assert.equal(wire.parcels.size, 0);
});

test('the composer clears only on ok, and only if the box still holds what was sent', () => {
  assert.deepEqual(settleComposer({ ok: true }, 'hello', 'hello'), { clear: true, why: null });
  assert.deepEqual(settleComposer({ ok: true }, 'hello', 'hello and more'), { clear: false, why: null });
  assert.deepEqual(settleComposer({ ok: false, why: 'disconnected' }, 'hello', 'hello'), { clear: false, why: 'disconnected' });
  assert.deepEqual(settleComposer({ ok: false }, 'hello', 'hello'), { clear: false, why: 'refused' });
  assert.deepEqual(settleComposer(undefined, 'hello', 'hello'), { clear: false, why: 'refused' });
});
