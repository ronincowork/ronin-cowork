import test from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import type { SessionInfo } from '../src/tmux.js';
import { feedEvents, handleEvents, homeSignature, publishHeld, pushJikan, pushMessages, pushTeams, pushWipeboard, sessionsSignature, tick, watchStore } from '../src/ws/events.js';

// A browser on /events: records what it is sent, and can close.
function browser() {
  const sent: Array<Record<string, unknown>> = [];
  const handlers = new Map<string, (raw?: unknown) => void>();
  const ws = {
    OPEN: 1,
    readyState: 1,
    send(text: string) { sent.push(JSON.parse(text) as Record<string, unknown>); },
    on(event: string, fn: (raw?: unknown) => void) { handlers.set(event, fn); },
  };
  return {
    ws: ws as unknown as WebSocket,
    got: (t: string) => sent.filter((msg) => msg.t === t),
    close() { ws.readyState = 3; handlers.get('close')?.(); },
    // What the browser says on the socket, as the server receives it.
    say(msg: unknown) { handlers.get('message')?.(Buffer.from(JSON.stringify(msg))); },
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

const session = (name: string, patch: Record<string, unknown> = {}) => ({ name, tags: [], leads: [], campaign_id: '', activity: 1, ...patch }) as unknown as SessionInfo;
// Joins whatever tick is in flight (a connection starts one), then lets its sends land.
const settle = async () => { await tick(); await new Promise((resolve) => setImmediate(resolve)); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

test('a changed row broadcasts home once; an unchanged tick broadcasts nothing; a fresh connection receives the rows', async (t) => {
  let rows: Array<Record<string, unknown>> = [{ name: 'a', stance: 'idle', activity: 1, at: '2026-09-26T01:00:00Z', ctx: 10 }];
  feedEvents({ teams: async () => [], list: async () => [session('a')], home: async () => rows });

  const first = open(t);
  await settle();
  assert.deepEqual(first.got('home'), [{ t: 'home', rows }], 'a fresh connection receives the rows');
  assert.equal(first.got('sessions').length, 1, 'and the session list');

  await tick();
  assert.equal(first.got('home').length, 1, 'an unchanged tick broadcasts nothing');
  assert.equal(first.got('sessions').length, 1);

  rows = [{ ...rows[0], activity: 2, at: '2026-09-26T01:00:05Z' }];
  await tick();
  assert.equal(first.got('home').length, 1, 'activity and stance time are not painted, so they do not push');

  rows = [{ ...rows[0], stance: 'working', ctx: 42 }];
  await Promise.all([tick(), tick()]);
  await tick();
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
    teams: async () => [],
    list: async () => { listings += 1; return [session('a'), session('b')]; },
    home: async (sessions) => { seen.push(sessions.map((s) => s.name)); return sessions.map((s) => ({ name: s.name })); },
  });
  open(t);
  await settle();
  listings = 0;
  seen.length = 0;
  await tick();
  assert.equal(listings, 1);
  assert.deepEqual(seen, [['a', 'b']], 'the home rows are built from the listing the tick took');
});

test('a failing loader leaves a fresh tab with no rows, and the next successful tick sends them', async (t) => {
  let fail = true;
  const rows = [{ name: 'a', stance: 'idle' }];
  feedEvents({ teams: async () => [], list: async () => [session('a')], home: async () => { if (fail) throw new Error('capture failed'); return rows; } });
  const b = open(t);
  await settle();
  assert.deepEqual(b.got('home'), [], 'nothing is sent in place of rows that could not be read');
  assert.equal(b.got('sessions').length, 1, 'the session list still arrives');
  fail = false;
  await tick();
  assert.deepEqual(b.got('home'), [{ t: 'home', rows }]);
});

test('a tab that connects while the listing fails is sent what every other tab holds', async (t) => {
  let fail = false;
  const rows = [{ name: 'a', stance: 'idle' }];
  feedEvents({ teams: async () => [], list: async () => { if (fail) throw new Error('tmux is restarting'); return [session('a')]; }, home: async () => rows });
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
  feedEvents({ teams: async () => [], list: async () => [session('a')], home: () => rows.promise });
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

test('the session list pushes when a painted field moves, and never for activity alone', async (t) => {
  let listing = [session('a', { title: 'one' })];
  feedEvents({ teams: async () => [], list: async () => listing, home: async () => [] });
  const b = open(t);
  await settle();
  assert.equal(b.got('sessions').length, 1);
  listing = [session('a', { title: 'one', activity: 99 })];
  await tick();
  assert.equal(b.got('sessions').length, 1, 'activity is not painted: a notification that only moved it sends nothing');
  listing = [session('a', { title: 'two', activity: 99 })];
  await tick();
  assert.equal(b.got('sessions').length, 2, 'a title is painted, so it pushes though names, Teams and leads did not move');
  assert.equal(sessionsSignature([{ name: 'a', activity: 1 }]), sessionsSignature([{ name: 'a', activity: 2 }]));
});

test('the rosters are read once per write, pushed when they moved, and held for a fresh connection', async (t) => {
  let reads = 0;
  let rosters: unknown[] = [{ name: 'front-2', projects: [] }];
  feedEvents({ list: async () => [session('a')], home: async () => [], teams: async () => { reads += 1; return rosters; } });
  const first = open(t);
  await settle();
  await pushTeams();
  assert.deepEqual(first.got('teams'), [{ t: 'teams', rosters }], 'the first read is pushed');
  await pushTeams();
  assert.equal(first.got('teams').length, 1, 'a write that changed nothing sends nothing');
  const second = open(t);
  await settle();
  assert.deepEqual(second.got('teams'), [{ t: 'teams', rosters }], 'a fresh connection gets what every other tab holds, once');
  rosters = [{ name: 'front-2', projects: [{ id: 'front-2/12' }] }];
  reads = 0;
  await pushTeams();
  assert.equal(reads, 1, 'one read for every open tab');
  for (const b of [first, second]) assert.deepEqual(b.got('teams').at(-1), { t: 'teams', rosters });
  assert.equal(second.got('teams').length, 2);
});

test('roster reads land in write order', async (t) => {
  const gates: Array<(value: unknown[]) => void> = [];
  feedEvents({ list: async () => [session('a')], home: async () => [], teams: () => new Promise((resolve) => gates.push(resolve)) });
  const b = open(t);
  await settle();
  const one = pushTeams();
  const two = pushTeams();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gates.length, 1, 'the second read waits for the first');
  gates[0]!([{ name: 'old' }]);
  await one;
  gates[1]!([{ name: 'new' }]);
  await two;
  assert.deepEqual(b.got('teams').map((m) => m.rosters), [[{ name: 'old' }], [{ name: 'new' }]]);
});

test('the home signature ignores only activity and stance time', () => {
  const row = { name: 'a', stance: 'idle', activity: 1, at: 'x', tegami: { at: 'kept' } };
  assert.equal(homeSignature([row]), homeSignature([{ ...row, activity: 9, at: 'y' }]));
  assert.notEqual(homeSignature([row]), homeSignature([{ ...row, tegami: { at: 'changed' } }]));
  assert.notEqual(homeSignature([row]), homeSignature([{ ...row, stance: 'working' }]));
});

test('held messages are sent when they change, and whole to a fresh connection', async (t) => {
  let list: unknown[] = [{ id: 'm1' }];
  feedEvents({ list: async () => [session('a')], messages: async () => list });
  const first = open(t);
  await settle();
  await pushMessages();
  assert.deepEqual(first.got('messages'), [{ t: 'messages', list }]);
  await pushMessages();
  assert.equal(first.got('messages').length, 1, 'a read that found the same queue sends nothing');
  list = [];
  await pushMessages();
  assert.deepEqual(first.got('messages').at(-1), { t: 'messages', list: [] });
  assert.equal(publishHeld({ t: 'memory', reading: { off: true } }), true);
  assert.equal(publishHeld({ t: 'memory', reading: { off: true } }), false, 'off is pushed once');
  const second = open(t);
  await settle();
  assert.deepEqual(second.got('messages'), [{ t: 'messages', list: [] }], 'a fresh tab gets the queue every tab holds');
  assert.deepEqual(second.got('memory'), [{ t: 'memory', reading: { off: true } }]);
});

test('a want answers that one connection with the message a write sends everybody', async (t) => {
  const boards: Record<string, unknown> = { 'front-2': { brief: 'b', posts: [{ id: '1' }], more: false } };
  feedEvents({
    list: async () => [session('a')],
    wipeboard: async (board) => (boards[board] as Record<string, unknown>) ?? null,
    jikan: async (team) => team === '*' ? [{ id: 'j', team: 'front-2' }] : team === 'front-2' ? [{ id: 'j' }] : null,
  });
  const asker = open(t);
  const other = open(t);
  await settle();
  asker.say({ t: 'want', resource: 'wipeboard', board: 'front-2' });
  asker.say({ t: 'want', resource: 'jikan', team: '*' });
  asker.say({ t: 'want', resource: 'wipeboard', board: 'nope' });
  await settle();
  assert.deepEqual(asker.got('wipeboard'), [{ t: 'wipeboard', board: 'front-2', brief: 'b', posts: [{ id: '1' }], more: false }]);
  assert.deepEqual(asker.got('jikan'), [{ t: 'jikan', team: '*', jobs: [{ id: 'j', team: 'front-2' }] }]);
  assert.deepEqual(other.got('wipeboard'), [], 'only the connection that asked');
});

test('a burst of file events from one write is one read and one push', async (t) => {
  let reads = 0;
  let posts = [{ id: '1' }];
  feedEvents({ list: async () => [session('a')], wipeboard: async () => { reads += 1; return { posts }; } });
  const b = open(t);
  await settle();
  posts = [{ id: '1' }, { id: '2' }];
  await Promise.all([pushWipeboard('front-2'), pushWipeboard('front-2'), pushWipeboard('front-2'), pushWipeboard('front-2')]);
  assert.ok(reads <= 2, `one read running and one waiting, not four (${reads})`);
  assert.deepEqual(b.got('wipeboard'), [{ t: 'wipeboard', board: 'front-2', posts }]);
  await pushWipeboard('front-2');
  assert.equal(b.got('wipeboard').length, 1, 'the same board read again sends nothing');
});

test('a Team\'s jobs changing pushes that Team and every Team', async (t) => {
  let jobs = [{ id: 'j1' }];
  feedEvents({ list: async () => [session('a')], jikan: async (team) => team === '*' ? jobs.map((j) => ({ ...j, team: 'front-2' })) : jobs });
  const b = open(t);
  await settle();
  jobs = [{ id: 'j1' }, { id: 'j2' }];
  await pushJikan('front-2');
  assert.deepEqual(b.got('jikan').map((m) => [m.team, (m.jobs as unknown[]).length]), [['front-2', 2], ['*', 2]]);
});

test('GitHub setup is watched while a setup session is attached, and once after it closes', async (t) => {
  let attached = false;
  let answer = { authenticated: false };
  feedEvents({ list: async () => [session('a')], github: { attached: async () => attached, answer: async () => answer } });
  const b = open(t);
  await settle();
  assert.deepEqual(b.got('github-setup'), [], 'nothing while nothing is attached');
  attached = true;
  await tick();
  assert.deepEqual(b.got('github-setup'), [{ t: 'github-setup', github: { authenticated: false } }]);
  await tick();
  assert.equal(b.got('github-setup').length, 1, 'an unchanged answer sends nothing');
  answer = { authenticated: true };
  attached = false; // the login finished and its session closed
  await tick();
  assert.deepEqual(b.got('github-setup').at(-1), { t: 'github-setup', github: { authenticated: true } });
  answer = { authenticated: false };
  await tick();
  assert.equal(b.got('github-setup').length, 2, 'then nothing until a session is attached again');
});

test('a store folder change names the file that changed', async (t) => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-watch-'));
  const seen: string[] = [];
  const stop = watchStore(dir, (file) => seen.push(file));
  t.after(async () => { stop(); await fs.rm(dir, { recursive: true, force: true }); });
  await fs.mkdir(path.join(dir, 'front-2', 'posts'), { recursive: true });
  await fs.writeFile(path.join(dir, 'front-2', 'posts', '1.md'), 'hello');
  for (let i = 0; i < 50 && !seen.some((f) => f.startsWith('front-2/posts')); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(seen.some((f) => f.split('/')[0] === 'front-2'), `saw ${seen.join(', ')}`);
});
