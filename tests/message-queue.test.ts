import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { closeTestServer, openTestServer } from './helpers/testserver.js';

/** A test-owned tmux server gives queue tests a real recipient and birth key. The product
 *  reaches it because the helper puts the server's `tmux` wrapper first on PATH. */
async function liveTarget(t: TestContext, name: string): Promise<string> {
  const server = await openTestServer(`mq_${name}`, { onPath: true });
  t.after(() => closeTestServer(server));
  await server.run('new-session', '-d', '-s', name);
  return name;
}

test('a send to a missing target is refused with roster and wipeboard teaching', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?test=${Date.now()}`);
  await assert.rejects(
    queue.enqueueMessage('definitely_missing_session', 'hello', 'tell'),
    (error: Error) => error.name === 'MessageRefused' && /roster/.test(error.message) && /wipeboard/.test(error.message),
  );
  assert.deepEqual(await queue.listQueuedMessages(), []);
  await fs.rm(root, { recursive: true, force: true });
});

test('pending tells expose an existing sender-to-target lane before another is sent', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-lane-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?lane=${Date.now()}`);
  const target = await liveTarget(t, 'queue_lane_target');
  const first = await queue.enqueueMessage(target, 'one authoritative instruction', 'tell', 'machine_settings');
  await queue.enqueueMessage(target, 'another sender is a separate lane', 'tell', 'coordinator');
  await queue.enqueueMessage(target, 'owner notice is not this sender lane', 'owner');
  assert.deepEqual(
    (await queue.pendingTellsFrom('machine_settings', target)).map((item) => item.id),
    [first.id],
  );
  assert.equal((await queue.pendingTellsFrom('coordinator', target)).length, 1);
  await fs.rm(root, { recursive: true, force: true });
});

test('accepted mail binds to the target instance and a reused name cannot receive it', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?test=${Date.now()}`);
  const ownName = await liveTarget(t, 'queue_instance_target');
  const item = await queue.enqueueMessage(ownName, 'do not deliver this test message', 'house');
  assert.ok(item.target_key && item.target_key !== ownName, 'the live session birth key is stored');
  item.target_key = `${item.target_key}-dead-predecessor`;
  await fs.writeFile(path.join(root, `${item.id}.json`), JSON.stringify(item));
  const missing = await queue.attemptMessage(item.id, 'safe');
  assert.equal(missing?.state, 'target_missing');
  assert.equal(missing?.attempts, 0);
  assert.match(missing?.reason ?? '', /different session/);
  assert.equal(await queue.dismissMessage(item.id), true);
  await fs.rm(root, { recursive: true, force: true });
});

test('expired and pre-instance retained mail is reaped because the queue is transport', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?test=${Date.now()}`);
  const base = {
    id: '00000000-0000-0000-0000-000000000001', from: 'Agent', target: 'old', text: 'old',
    source: 'tell', state: 'stuck', reason: 'busy', attempts: 0,
    created_at: '2020-01-01T00:00:00.000Z', updated_at: '2020-01-01T00:00:00.000Z',
  };
  await fs.writeFile(path.join(root, `${base.id}.json`), JSON.stringify({ ...base, target_key: 'old-1', expires_at: '2020-01-03T00:00:00.000Z' }));
  const legacyId = '00000000-0000-0000-0000-000000000002';
  await fs.writeFile(path.join(root, `${legacyId}.json`), JSON.stringify({ ...base, id: legacyId }));
  assert.deepEqual(await queue.listQueuedMessages(), []);
  assert.deepEqual((await fs.readdir(root)).filter((name) => name.endsWith('.json')), []);
  await fs.rm(root, { recursive: true, force: true });
});

test('source-derived TTLs are clock-controlled and wipeboard content remains outside the transport sweep', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-ttl-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?ttl=${Date.now()}`);
  const target = await liveTarget(t, 'queue_ttl_target');
  const tell = await queue.enqueueMessage(target, 'short direct transport', 'tell', 'Agent');
  const board = await queue.enqueueMessage(target, 'durable text lives on the board', 'wipeboard_notice');
  const house = await queue.enqueueMessage(target, 'one-hour system transport', 'house');
  assert.equal(Date.parse(tell.expires_at) - Date.parse(tell.created_at), queue.TELL_TTL_MS);
  assert.equal(Date.parse(board.expires_at) - Date.parse(board.created_at), queue.WIPEBOARD_NOTICE_TTL_MS);
  assert.equal(Date.parse(house.expires_at) - Date.parse(house.created_at), queue.MESSAGE_TTL_MS);
  assert.deepEqual((await queue.listQueuedMessages(Date.parse(board.expires_at) + 1)).map((item) => item.id), [tell.id, house.id]);
  assert.deepEqual((await queue.listQueuedMessages(Date.parse(tell.expires_at) + 1)).map((item) => item.id), [house.id]);
  await fs.rm(root, { recursive: true, force: true });
});

test('dismissal during an active attempt cannot resurrect the exact message', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-race-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?race=${Date.now()}`);
  const target = await liveTarget(t, 'queue_race_target');
  const item = await queue.enqueueMessage(target, 'cancel while attempted', 'house');
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void;
  const active = new Promise<void>((resolve) => { started = resolve; });
  const attempt = queue.attemptMessage(item.id, 'safe', {
    safe: async (_target: string, _text: string, onAttempt: () => void) => {
      onAttempt(); started(); await held;
      return { delivered: false, submitted: true, reason: 'controlled failure' };
    },
    force: async () => ({ delivered: false, submitted: true, reason: 'unused' }),
  });
  await active;
  assert.equal(await queue.dismissMessage(item.id), true);
  release();
  assert.equal(await attempt, null);
  assert.deepEqual(await queue.listQueuedMessages(), []);
  await fs.rm(root, { recursive: true, force: true });
});

test('bulk dismissal is exact-ID and preserves unread arrivals', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-bulk-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?bulk=${Date.now()}`);
  const target = await liveTarget(t, 'queue_bulk_target');
  const first = await queue.enqueueMessage(target, 'selected', 'house');
  const second = await queue.enqueueMessage(target, 'also selected', 'house');
  const unread = await queue.enqueueMessage(target, 'arrived after selection', 'house');
  assert.deepEqual((await queue.dismissMessages([first.id, second.id, first.id])).dismissed, [first.id, second.id]);
  assert.deepEqual((await queue.listQueuedMessages()).map((item) => item.id), [unread.id]);
  await fs.rm(root, { recursive: true, force: true });
});

test('auto-force defaults to two minutes; an explicit 0 means never', async () => {
  const queue = await import(`../src/message-queue.ts?autodefault=${Date.now()}`);
  assert.equal(queue.autoForceMsFrom(undefined), 120_000);
  assert.equal(queue.autoForceMsFrom(null), 120_000);
  assert.equal(queue.autoForceMsFrom(''), 120_000);
  assert.equal(queue.autoForceMsFrom(0), 0);
  assert.equal(queue.autoForceMsFrom('0'), 0);
  assert.equal(queue.autoForceMsFrom(120), 120_000);
  assert.equal(queue.autoForceMsFrom('not a number'), 0);
});

test('bulk force is exact-ID, one pane at a time, and reports each outcome', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-bulkforce-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?bulkforce=${Date.now()}`);
  const target = await liveTarget(t, 'queue_bulkforce_target');
  const wins = await queue.enqueueMessage(target, 'forced through', 'house');
  const loses = await queue.enqueueMessage(target, 'forced and refused', 'house');
  const unread = await queue.enqueueMessage(target, 'arrived after selection', 'house');
  const order: string[] = [];
  const delivery = {
    safe: async () => ({ delivered: false, submitted: false, reason: 'unused' }),
    force: async (_target: string, text: string) => {
      order.push(text);
      return text === 'forced through'
        ? { delivered: true, submitted: true, reason: '' }
        : { delivered: false, submitted: true, reason: 'the pane refused it' };
    },
  };
  const result = await queue.forceMessages([wins.id, loses.id, wins.id, 'not-a-real-id'], delivery);
  assert.deepEqual(order, ['forced through', 'forced and refused']);
  assert.deepEqual(result.not_found, ['not-a-real-id']);
  assert.deepEqual(result.outcomes.map((o: { id: string; delivered: boolean }) => [o.id, o.delivered]), [[wins.id, true], [loses.id, false]]);
  const left = await queue.listQueuedMessages();
  assert.deepEqual(left.map((item: { id: string }) => item.id).sort(), [loses.id, unread.id].sort());
  assert.equal(left.find((item: { id: string }) => item.id === loses.id)?.state, 'failed');
  assert.equal(left.find((item: { id: string }) => item.id === unread.id)?.attempts, 0);
  await fs.rm(root, { recursive: true, force: true });
});

test('auto-force fires once per retained message after the owner\'s delay, never before, never for a missing target', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-autoforce-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?autoforce=${Date.now()}`);
  const { setControl } = await import('../src/tmux.js');
  const target = await liveTarget(t, 'queue_autoforce_target');
  await setControl(target, 'read'); // safe delivery holds; the message is Waiting
  const item = await queue.enqueueMessage(target, 'stuck behind a dial', 'tell', 'sender');
  let forced = 0;
  const delivery = {
    safe: async () => ({ delivered: false, submitted: false, reason: 'unused' }),
    force: async () => { forced += 1; return { delivered: false, submitted: true, reason: 'pane never took it' }; },
  };
  const born = Date.parse(item.created_at);
  // Off: the sweep only makes safe attempts, which the Control setting holds.
  await queue.processMessageQueue({ now: born + 600_000, autoForceAfterMs: 0, delivery });
  assert.equal(forced, 0);
  // On, but younger than the delay: still held.
  await queue.processMessageQueue({ now: born + 60_000, autoForceAfterMs: 120_000, delivery });
  assert.equal(forced, 0);
  assert.equal((await queue.listQueuedMessages(born + 60_000))[0].auto_forced_at, undefined);
  // On and old enough: forced once, stamped, and the failure stays on the card.
  await queue.processMessageQueue({ now: born + 120_000, autoForceAfterMs: 120_000, delivery });
  assert.equal(forced, 1);
  const after = (await queue.listQueuedMessages(born + 120_000))[0];
  assert.equal(after.state, 'failed');
  assert.equal(after.reason, 'pane never took it');
  assert.equal(after.attempts, 1);
  assert.equal(after.auto_forced_at, new Date(born + 120_000).toISOString());
  // Later sweeps do not force it again; only a manual press would.
  await queue.processMessageQueue({ now: born + 240_000, autoForceAfterMs: 120_000, delivery });
  await queue.processMessageQueue({ now: born + 480_000, autoForceAfterMs: 120_000, delivery });
  assert.equal(forced, 1);
  await fs.rm(root, { recursive: true, force: true });
});

test('safe delivery honors Control while explicit Force keeps its documented override', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-control-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?control=${Date.now()}`);
  const { setControl } = await import('../src/tmux.js');
  const target = await liveTarget(t, 'queue_control_target');
  await setControl(target, 'read');
  const item = await queue.enqueueMessage(target, 'respect Control', 'house');
  let safeCalls = 0;
  let forceCalls = 0;
  const delivery = {
    safe: async () => { safeCalls += 1; return { delivered: false, submitted: false, reason: 'unused' }; },
    force: async () => { forceCalls += 1; return { delivered: false, submitted: true, reason: 'forced test' }; },
  };
  assert.match((await queue.attemptMessage(item.id, 'safe', delivery))?.reason ?? '', /Control/);
  assert.equal(safeCalls, 0);
  await queue.attemptMessage(item.id, 'force', delivery);
  assert.equal(forceCalls, 1);
  await fs.rm(root, { recursive: true, force: true });
});

test('manual and expired direct tells NACK once, but viewer senders and NACKs do not loop', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-nack-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?nack=${Date.now()}`);
  const { setControl } = await import('../src/tmux.js');
  const server = await openTestServer('mq_nack', { onPath: true });
  t.after(() => closeTestServer(server));
  const sender = 'queue_nack_sender';
  const target = 'queue_nack_target';
  await server.run('new-session', '-d', '-s', sender);
  await server.run('new-session', '-d', '-s', target);
  await setControl(sender, 'read');
  const direct = await queue.enqueueMessage(target, 'dismiss me', 'tell', sender);
  assert.equal(await queue.dismissMessage(direct.id), true);
  assert.equal(await queue.dismissMessage(direct.id), false);
  const expiring = await queue.enqueueMessage(target, 'expire me', 'tell', sender);
  await queue.listQueuedMessages(Date.parse(expiring.expires_at) + 1);
  const viewer = await queue.enqueueMessage(target, 'no viewer nack', 'tell', 'grid_fake');
  await queue.dismissMessage(viewer.id);
  const nack = await queue.enqueueMessage(target, 'already a NACK', 'house', 'Ronin House');
  await queue.dismissMessage(nack.id);
  const returns = (await queue.listQueuedMessages()).filter((item) => item.target === sender && item.source === 'house');
  const pane = await server.run('capture-pane', '-p', '-S', '-', '-t', sender);
  const evidence = `${returns.map((item) => item.text).join('\n')}\n${pane}`;
  assert.equal(evidence.split(`Your tell ${direct.id}`).length - 1, 1);
  assert.equal(evidence.split(`Your tell ${expiring.id}`).length - 1, 1);
  assert.doesNotMatch(evidence, new RegExp(viewer.id));
  assert.doesNotMatch(evidence, new RegExp(nack.id));
  await fs.rm(root, { recursive: true, force: true });
});
