/**
 * JIKAN (src/jikan.ts): the timing words compile to the moments they mean, the list is the
 * owner's file and survives a rewrite, a job fires once when due — through an injected
 * door, never tmux — a missed moment fires once and never as a backlog, a one-time job is
 * done after it fires, `lead` resolves live, and a gone session is a refusal, not a birth.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(tmpdir(), 'ronin-jikan-'));
process.env.RONIN_JIKAN_DIR = root;
const { parseWhen, nextRun, describeWhen, addJob, editJob, listJobs, removeJob, tick, runJob, checkDraft, resolveTarget, deliveryText } =
  await import('../src/jikan.js');

const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

test('the timing words compile to the moments they mean', () => {
  const tue = local(2026, 9, 1, 7, 30); // 2026-09-01 is a Tuesday
  const at = (spec: string, after: number) => { const s = parseWhen(spec); assert.ok(s, spec); return nextRun(s!, after, after); };
  assert.equal(at('daily 08:00', tue), local(2026, 9, 1, 8, 0));
  assert.equal(at('daily 08:00', local(2026, 9, 1, 8, 0)), local(2026, 9, 2, 8, 0), 'strictly after');
  assert.equal(at('weekdays 08:00', local(2026, 9, 4, 9, 0)), local(2026, 9, 7, 8, 0), 'Friday 09:00 → Monday');
  assert.equal(at('weekends 10:00', tue), local(2026, 9, 5, 10, 0));
  assert.equal(at('weekly mon 08:00', tue), local(2026, 9, 7, 8, 0));
  assert.equal(at('weekly mon,thu 08:00', tue), local(2026, 9, 3, 8, 0));
  assert.equal(at('monthly 1 09:00', tue), local(2026, 9, 1, 9, 0), 'later today counts');
  assert.equal(at('monthly 1 09:00', local(2026, 9, 1, 9, 0)), local(2026, 10, 1, 9, 0));
  assert.equal(at('hourly', tue), local(2026, 9, 1, 8, 0));
  assert.equal(at('every 30m', tue), tue + 30 * 60_000);
  assert.equal(at('every 2h', tue), tue + 2 * 3_600_000);
  assert.equal(at('0 8 * * 1-5', local(2026, 9, 4, 9, 0)), local(2026, 9, 7, 8, 0), 'a cron line');
  assert.equal(at('*/15 9-10 * * *', tue), local(2026, 9, 1, 9, 0));
  assert.equal(at('once 2026-09-04 08:00', tue), local(2026, 9, 4, 8, 0));
  assert.equal(at('at 2026-09-04', tue), local(2026, 9, 4, 0, 0));
  assert.equal(at('once 2026-08-01 08:00', tue), null, 'a once in the past never fires');
  for (const bad of ['', 'sometime', 'daily 25:00', 'weekly funday 08:00', 'every 0m', 'every 30s', '0 8 * *', 'once 2026-02-30 08:00']) {
    assert.equal(parseWhen(bad), null, `"${bad}" is not timing words`);
  }
  assert.equal(describeWhen('every 2h'), 'every 2 hours');
  assert.equal(describeWhen('every 1d'), 'every 1 day');
  assert.equal(describeWhen('weekdays 08:00'), 'weekdays 08:00');
});

test('a draft is held to its shape', () => {
  const now = local(2026, 9, 1, 7, 30);
  assert.throws(() => checkDraft({ request: '', when: 'daily 08:00' }, now), /what the request is/);
  assert.throws(() => checkDraft({ request: 'x', when: 'whenever' }, now), /Timing is/);
  assert.throws(() => checkDraft({ request: 'x', when: 'once 2026-01-01 08:00' }, now), /already passed/);
  assert.throws(() => checkDraft({ request: 'x', to: 'not a name!', when: 'hourly' }, now), /by name, or to `lead`/);
  const held = checkDraft({ request: '  +brief:  ', when: 'weekdays 08:00' }, now);
  assert.deepEqual([held.request, held.to, held.by], ['+brief:', 'lead', 'owner']);
  assert.equal(held.next_run, new Date(local(2026, 9, 1, 8, 0)).toISOString());
});

const sessions = [
  { name: 'chief', tags: ['office'], leads: ['office'] },
  { name: 'inbox', tags: ['office'], leads: [] },
  { name: 'stranger', tags: ['other'], leads: [] },
];

test('the list is the owner\'s file, and a job fires once when due through the injected door', async () => {
  let now = local(2026, 9, 1, 7, 59);
  const delivered: Array<{ target: string; text: string; from: string }> = [];
  const clock = {
    now: () => now,
    sessions: async () => sessions,
    deliver: async (target: string, text: string, from: string) => { delivered.push({ target, text, from }); return target === 'inbox' ? 'queued' as const : 'delivered' as const; },
  };
  const brief = await addJob('office', { request: '+brief:', when: 'weekdays 08:00', by: 'chief' }, now);
  const triage = await addJob('office', { request: '+triage:', to: 'inbox', when: 'every 30m' }, now);
  const once = await addJob('office', { request: 'ring the bell', to: 'stranger', when: 'once 2026-09-01 08:00' }, now);
  assert.match(await readFile(path.join(root, 'office.md'), 'utf8'), /^## j[a-z0-9]{6}$/m);
  assert.equal((await listJobs('office')).length, 3);

  assert.deepEqual(await tick(clock), [], 'nothing due at 07:59');
  now = local(2026, 9, 1, 8, 0);
  const fired = await tick(clock);
  assert.deepEqual(fired.map((o) => [o.id, o.target, o.outcome]).sort(), [
    [brief.id, 'chief', 'delivered'],
    [once.id, '', 'refused: stranger is not a live session on office'],
  ].sort(), 'the every-30m is not due until 08:29');
  assert.equal(delivered[0].from, 'Cron jobs');
  assert.equal(delivered[0].text, deliveryText(brief));
  assert.match(delivered[0].text, /job j[a-z0-9]{6}, set by chief\): \+brief:$/);

  const after = await listJobs('office');
  const b = after.find((j) => j.id === brief.id)!;
  assert.equal(b.runs, 1);
  assert.equal(b.last_outcome, 'delivered');
  assert.equal(b.next_run, new Date(local(2026, 9, 2, 8, 0)).toISOString(), 'a repeat is rescheduled from now');
  const o = after.find((j) => j.id === once.id)!;
  assert.equal(o.state, 'done', 'a one-time job is done after it fires, even refused');
  assert.equal(o.next_run, '');

  assert.deepEqual(await tick(clock), [], 'the same minute does not fire twice');
  now = local(2026, 9, 1, 8, 29);
  assert.deepEqual((await tick(clock)).map((x) => [x.id, x.outcome]), [[triage.id, 'queued']]);
});

test('a missed moment fires once, never a backlog; paused holds; released counts from now', async () => {
  let now = local(2026, 9, 10, 8, 0);
  const clock = { now: () => now, sessions: async () => sessions, deliver: async () => 'delivered' as const };
  const job = await addJob('quiet', { request: 'tick', when: 'hourly' }, now);
  now = local(2026, 9, 12, 12, 30); // Ronin was down for two days
  const fired = (await tick(clock)).filter((o) => o.team === 'quiet');
  assert.equal(fired.length, 1, 'one firing for the whole gap');
  assert.equal((await listJobs('quiet'))[0].next_run, new Date(local(2026, 9, 12, 13, 0)).toISOString());

  await editJob('quiet', job.id, { state: 'paused' }, now);
  now = local(2026, 9, 13, 9, 0);
  assert.deepEqual((await tick(clock)).filter((o) => o.team === 'quiet'), [], 'paused holds');
  const released = await editJob('quiet', job.id, { state: 'active' }, now);
  assert.equal(released.next_run, new Date(local(2026, 9, 13, 10, 0)).toISOString(), 'released: from now');
  await assert.rejects(editJob('quiet', job.id, { state: 'done' as 'active' }, now), /done is the clock/);
  const moved = await editJob('quiet', job.id, { when: 'daily 07:00', request: 'tock' }, now);
  assert.equal(moved.next_run, new Date(local(2026, 9, 14, 7, 0)).toISOString());
  assert.equal(moved.request, 'tock');
  assert.equal(await removeJob('quiet', job.id), true);
  assert.equal(await removeJob('quiet', job.id), false);
  assert.deepEqual(await listJobs('quiet'), []);
});

test('`lead` resolves live, and run-now fires whatever the clock says', async () => {
  const job = { id: 'jabc123', request: 'r', to: 'lead', when: 'hourly', state: 'active' as const, by: 'owner', created: '', next_run: '', last_run: '', last_outcome: '', runs: 0 };
  assert.deepEqual(resolveTarget(job, 'office', sessions), { target: 'chief' });
  assert.deepEqual(resolveTarget(job, 'other', sessions), { refused: 'refused: other has no lead right now' });
  assert.deepEqual(resolveTarget({ ...job, to: 'inbox' }, 'office', sessions), { target: 'inbox' });
  assert.deepEqual(resolveTarget({ ...job, to: 'stranger' }, 'office', sessions), { refused: 'refused: stranger is not a live session on office' });

  const now = local(2026, 9, 1, 12, 0);
  const clock = { now: () => now, sessions: async () => sessions, deliver: async () => 'delivered' as const };
  const added = await addJob('office', { request: 'now please', when: 'daily 23:00' }, now);
  const out = await runJob('office', added.id, clock);
  assert.equal(out.target, 'chief');
  assert.equal((await listJobs('office')).find((j) => j.id === added.id)?.runs, 1);
  await assert.rejects(runJob('office', 'jzzzzzz', clock), /No such job/);
});

test.after(async () => {
  delete process.env.RONIN_JIKAN_DIR;
  await rm(root, { recursive: true, force: true });
});
