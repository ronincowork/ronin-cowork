/**
 * JIKAN (src/jikan.ts): the timing words mean the moments they say, a job is one due date,
 * a tick fires what is due at or before now through a fake door — done for a once, the
 * next due for a repeat — and `now` puts a job on the next tick. The store is a temp dir;
 * no tmux, no socket, no stopwatch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(tmpdir(), 'ronin-jikan-'));
process.env.RONIN_JIKAN_DIR = root;
const { parseWhen, nextRun, addJob, setJob, listJobs, removeJob, tick, deliveryText } = await import('../src/jikan.js');
const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

test('the timing words mean the moments they say', () => {
  const tue = local(2026, 9, 1, 7, 30); // a Tuesday
  const at = (w: string, after: number) => { const s = parseWhen(w); assert.ok(s, w); return nextRun(s!, after); };
  assert.equal(at('daily 08:00', tue), local(2026, 9, 1, 8, 0));
  assert.equal(at('daily 08:00', local(2026, 9, 1, 8, 0)), local(2026, 9, 2, 8, 0), 'strictly after');
  assert.equal(at('weekdays 08:00', local(2026, 9, 4, 9, 0)), local(2026, 9, 7, 8, 0), 'Friday 09:00 → Monday');
  assert.equal(at('weekly mon,thu 08:00', tue), local(2026, 9, 3, 8, 0));
  assert.equal(at('monthly 1 09:00', local(2026, 9, 1, 9, 0)), local(2026, 10, 1, 9, 0));
  assert.equal(at('hourly', tue), local(2026, 9, 1, 8, 0));
  assert.equal(at('every 30m', tue), tue + 30 * 60_000);
  assert.equal(at('0 8 * * 1-5', local(2026, 9, 4, 9, 0)), local(2026, 9, 7, 8, 0));
  assert.equal(at('once 2026-09-04 08:00', tue), local(2026, 9, 4, 8, 0));
  assert.equal(at('once 2026-08-01 08:00', tue), null, 'a once in the past never fires');
  for (const bad of ['', 'sometime', 'daily 25:00', 'weekly funday 08:00', 'every 30s', '0 8 * *', 'once 2026-02-30 08:00']) assert.equal(parseWhen(bad), null, bad);
});

const sessions = [{ name: 'chief', tags: ['office'], leads: ['office'] }, { name: 'inbox', tags: ['office'], leads: [] }];

test('a tick fires what is due, marks a once done, and moves a repeat on', async () => {
  let now = local(2026, 9, 1, 7, 59);
  const sent: string[] = [];
  const door = { now: () => now, sessions: async () => sessions, deliver: async (target: string, text: string) => { sent.push(`${target}: ${text}`); return target === 'inbox' ? 'queued' as const : 'delivered' as const; } };
  const brief = await addJob('office', { request: '+brief:', when: 'weekdays 08:00', by: 'chief' }, now);
  const once = await addJob('office', { request: 'ring', to: 'nobody', when: 'once 2026-09-01 08:00' }, now);
  await assert.rejects(addJob('office', { request: '', when: 'hourly' }, now), /what the request is/);
  await assert.rejects(addJob('office', { request: 'x', when: 'whenever' }, now), /Choose a date and time/);
  assert.equal(brief.due, new Date(local(2026, 9, 1, 8, 0)).toISOString());

  assert.deepEqual(await tick(door), [], 'nothing due at 07:59');
  now = local(2026, 9, 1, 8, 0);
  const fired = await tick(door);
  assert.deepEqual(fired.map((j) => [j.id, j.state, j.last.slice(25)]).sort(), [[brief.id, 'active', 'delivered'], [once.id, 'done', 'refused: nobody is not on office']].sort());
  assert.deepEqual(sent, [`chief: ${deliveryText(brief)}`]);
  const after = await listJobs('office');
  assert.equal(after.find((j) => j.id === brief.id)?.due, new Date(local(2026, 9, 2, 8, 0)).toISOString(), 'a repeat moves on from now');
  assert.equal(after.find((j) => j.id === once.id)?.due, '');
  assert.deepEqual(await tick(door), [], 'the same minute does not fire twice');

  // Two days of downtime: one firing, then on from now — a missed beat is just missed.
  now = local(2026, 9, 4, 12, 30);
  assert.equal((await tick(door)).length, 1);
  assert.equal((await listJobs('office')).find((j) => j.id === brief.id)?.due, new Date(local(2026, 9, 7, 8, 0)).toISOString());
});

test('paused holds, resume counts from now, now means the next tick, remove removes', async () => {
  let now = local(2026, 9, 10, 8, 0);
  const door = { now: () => now, sessions: async () => sessions, deliver: async () => 'delivered' as const };
  const job = await addJob('quiet', { request: 'tick', to: 'inbox', when: 'hourly' }, now);
  assert.equal((await setJob('quiet', job.id, 'paused', now)).due, '');
  now = local(2026, 9, 10, 12, 0);
  assert.deepEqual((await tick(door)).filter((j) => j.id === job.id), []);
  assert.equal((await setJob('quiet', job.id, 'active', now)).due, new Date(local(2026, 9, 10, 13, 0)).toISOString());
  assert.equal((await setJob('quiet', job.id, 'now', now)).due, new Date(now).toISOString());
  assert.equal((await tick(door)).filter((j) => j.id === job.id).length, 1, 'now fires at the next tick');
  assert.equal(await removeJob('quiet', job.id), true);
  assert.equal(await removeJob('quiet', job.id), false);
  await assert.rejects(setJob('quiet', job.id, 'paused'), /No such job/);
});

test('expiry is stored, keeps recent outcomes, and moves a recurring job to done', async () => {
  let now = local(2026, 9, 1, 7, 0);
  const expires = new Date(local(2026, 9, 1, 8, 0)).toISOString();
  const job = await addJob('office', { request: 'check', when: 'every 30m', expires }, now);
  assert.equal(job.expires, expires);
  now = local(2026, 9, 1, 8, 1);
  const door = { now: () => now, sessions: async () => sessions, deliver: async () => 'delivered' as const };
  assert.deepEqual((await tick(door)).map((row) => row.id), []);
  const expired = (await listJobs('office')).find((row) => row.id === job.id)!;
  assert.equal(expired.state, 'done');
  assert.match(expired.last, / expired$/);
  assert.deepEqual(expired.history, [expired.last]);
});

test.after(async () => { delete process.env.RONIN_JIKAN_DIR; await rm(root, { recursive: true, force: true }); });
