/**
 * `team project …` and `work-record project …` against the real /api/work-items routes.
 * Checks from WORK_ITEM_STORE.md cut 3: each tool call leaves exactly one trail line; no
 * tool refuses a caller for not being the holder; every acknowledgement names the item and
 * the write that keeps it current.
 *
 * The routes run in this process on a free port (RONIN_URL). The tools see a fake tmux
 * answering for a session called "probe"; this process sees no tmux server at all, so its
 * session key for "probe" is "probe" too, and both find the same letter.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';

const root = path.resolve(import.meta.dirname, '..');
const dir = mkdtempSync(path.join(tmpdir(), 'work-item-tools-'));
delete process.env.TMUX;
process.env.TMUX_TMPDIR = mkdtempSync(path.join(tmpdir(), 'work-item-tools-tmux-'));
process.env.RONIN_SESSION_DIR = path.join(dir, 'sessions');
process.env.RONIN_WORK_ITEMS_DIR = path.join(dir, 'work-items');
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(dir, 'team_rosters');

const { registerWorkItems } = await import('../src/routes/work-items-api.js');
const { createTeamRoster } = await import('../src/team-rosters.js');
const { readLetterHolds, seedTegami } = await import('../src/tegami.js');
const { readItem } = await import('../src/work-items.js');

await createTeamRoster('crew', { objective: 'hold things' });
await seedTegami('probe');
const app = express();
app.use(express.json());
registerWorkItems(app);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
test.after(() => server.close());

const bin = path.join(dir, 'bin');
mkdirSync(bin);
// FAKE_SESSION names the session this tool call runs in; "probe" unless a test says so.
writeFileSync(path.join(bin, 'tmux'), [
  '#!/bin/sh',
  'S=${FAKE_SESSION:-probe}',
  'case "$1" in',
  '  display-message) echo "@1";;',
  "  list-windows) printf '%s\\t@1\\n' \"$S\";;",
  "  list-sessions) case \"$*\" in *ronin-key*) printf '%s\\t%s\\t1\\n' \"$S\" \"$S\";; *) printf '%s\\t\\n' \"$S\";; esac;;",
  '  *) exit 1;;',
  'esac',
  '',
].join('\n'), { mode: 0o755 });
const env: NodeJS.ProcessEnv = {
  ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, TMUX_PANE: '%1',
  RONIN_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
};
// Async on purpose: the routes answer from this same process, so a sync call would block them.
const run = (name: string, args: string[], as = 'probe', input?: string) => new Promise<{ status: number; stdout: string; stderr: string }>((resolve) => {
  const child = execFile(path.join(root, 'ronin_bin', name), args, { encoding: 'utf8', env: { ...env, FAKE_SESSION: as } }, (error, stdout, stderr) =>
    resolve({ status: error ? Number((error as { code?: number }).code ?? 1) : 0, stdout, stderr }));
  child.stdin?.end(input ?? '');
});
const tool = async (name: string, args: string[], as = 'probe', input?: string) => {
  const r = await run(name, args, as, input);
  assert.equal(r.status, 0, `${name} ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};
const trail = async (id: string) => (await readItem(id))!.trail;

/** Run one tool call and prove it appended exactly one line, returning that line. */
async function oneLine(id: string, name: string, args: string[]) {
  const before = (await trail(id)).length;
  const out = await tool(name, args);
  const after = await trail(id);
  assert.equal(after.length, before + 1, `${name} ${args.join(' ')} appended ${after.length - before} lines`);
  assert.match(out, new RegExp(`${id} .*\\. Keep it current: work-record project write ${id} --objective`), 'the acknowledgement nags');
  return after.at(-1)!;
}

test('team project verbs: create, assign, return, backlog, done, restore, write, parent — one line each', async () => {
  const created = await tool('team', ['project', 'create', 'crew', '--title', 'Overall', '--objective', 'The team item']);
  const id = /Work item (w\d+)/.exec(created)![1]!;
  assert.deepEqual((await trail(id)).map((line) => [line.op, line.to]), [['create', 'team:crew']]);

  assert.equal((await oneLine(id, 'team', ['project', 'assign', id, 'probe'])).to, 'agent:probe');
  assert.deepEqual((await readLetterHolds('probe'))!.holds, [id]);
  assert.equal((await oneLine(id, 'team', ['project', 'return', 'crew', id])).to, 'team:crew');
  assert.equal((await oneLine(id, 'team', ['project', 'backlog', id])).op, 'release');
  assert.equal((await oneLine(id, 'team', ['project', 'done', id])).to, 'DONE');
  const restored = await oneLine(id, 'team', ['project', 'restore', 'crew', id]);
  assert.deepEqual([restored.op, restored.to], ['assign', 'team:crew']);
  assert.equal((await readItem(id))!.stage, 'IDEA', 'restore returns the item to the stage it left');
  assert.equal((await oneLine(id, 'team', ['project', 'write', id, '--objective', 'Sharper words'])).op, 'edit');

  const child = /Work item (w\d+)/.exec(await tool('team', ['project', 'create', 'crew', '--title', 'Piece', '--objective', 'part']))![1]!;
  assert.deepEqual([(await oneLine(child, 'team', ['project', 'parent', child, id])).to], [id]);
  const cycle = await run('team', ['project', 'parent', id, child]);
  assert.equal(cycle.status, 4);
  assert.match(cycle.stderr, /^REFUSED: .* → /);
  const listed = JSON.parse(await tool('team', ['project', 'list', 'crew'])) as { items: Array<{ id: string }> };
  assert.ok(listed.items.some((item) => item.id === child));
});

test('work-record project verbs: one line each, and nobody is refused for not holding the item', async () => {
  const created = await tool('work-record', ['project', 'create', '--title', 'Mine', '--objective', 'Do it']);
  const id = /Work item (w\d+)/.exec(created)![1]!;
  const item = (await readItem(id))!;
  assert.deepEqual([item.stage, item.trail[0]!.by, item.trail[0]!.to], ['PLAN', 'probe', 'agent:probe']);

  const working = await oneLine(id, 'work-record', ['project', 'working', id]);
  assert.deepEqual([working.op, working.to], ['exit', 'agent'], 'a new item is already yellow, so only the exit moves');
  assert.equal((await readLetterHolds('probe'))!.at?.item, id, 'working focuses the item');
  assert.equal((await oneLine(id, 'work-record', ['project', 'ready', id, '--for', 'lead'])).to, 'green');
  assert.equal((await oneLine(id, 'work-record', ['project', 'blocked', id, '--on', 'user'])).to, 'red');
  assert.equal((await oneLine(id, 'work-record', ['project', 'advance', id, '--to', 'REVIEW'])).to, 'REVIEW');
  const both = await oneLine(id, 'work-record', ['project', 'write', id, '--objective', 'Now this', '--evidence', 'commit abc123']);
  assert.deepEqual([both.op, both.note], ['evidence', 'commit abc123; also objective']);
  assert.equal((await oneLine(id, 'work-record', ['project', 'return', id, '--team', 'crew'])).to, 'team:crew');

  // Held by the Team now, not by probe: probe still changes it, and the trail says so.
  const other = await oneLine(id, 'work-record', ['project', 'stuck', id]);
  assert.equal(other.by, 'probe');
  assert.equal((await oneLine(id, 'work-record', ['project', 'backlog', id])).op, 'release');
  assert.equal((await oneLine(id, 'work-record', ['project', 'done', id])).to, 'DONE');
  assert.equal(JSON.parse(await tool('work-record', ['project', 'read', id])).id, id);

  const bad = await run('work-record', ['project', 'ready', id, '--for', 'agent']);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /--for lead\|user/);
});

test('a ladder write with nothing held creates one item held by the Agent, titled from its objective', async () => {
  await tool('work-record', ['update_record', '--objective', 'Solo objective'], 'solo');
  assert.deepEqual((await readLetterHolds('solo'))!.holds, []);
  const out = await tool('work-record', ['update_record', '--phase', 'First phase', '--leg', '1', 'first leg'], 'solo');
  const letter = (await readLetterHolds('solo'))!;
  assert.equal(letter.holds.length, 1, 'exactly one item made');
  const item = (await readItem(letter.holds[0]!))!;
  assert.deepEqual([item.title, item.trail.length, item.trail[0]!.op, item.trail[0]!.to], ['Solo objective', 1, 'create', 'agent:solo']);
  assert.deepEqual(item.ladder, [{ phase: 'First phase', status: 'PLANNED', legs: [{ title: 'first leg', status: 'PLANNED' }] }]);
  assert.equal(letter.at?.item, item.id, 'the new item is the focus');
  assert.match(out, /Keep it current/);
  await tool('work-record', ['update_record', '--gate', 'owner go'], 'solo');
  assert.equal((await readLetterHolds('solo'))!.holds.length, 1, 'the next write lands on it: no second item');
});

test('a ladder write with a focus item changes that item and nothing else, one line per write', async () => {
  const a = /Work item (w\d+)/.exec(await tool('work-record', ['project', 'create', '--title', 'A', '--objective', 'a'], 'duo'))![1]!;
  const b = /Work item (w\d+)/.exec(await tool('work-record', ['project', 'create', '--title', 'B', '--objective', 'b'], 'duo'))![1]!;
  await tool('work-record', ['project', 'working', b], 'duo');
  const before = structuredClone(await readItem(a));
  const lines = (await trail(b)).length;
  await tool('work-record', ['update_record', '--phase', 'p', '--leg', '1', 'x', '--leg', '1', 'y', '--done', '1.1', '--active', '1.2'], 'duo');
  assert.deepEqual(await readItem(a), before, 'the other held item is untouched');
  const item = (await readItem(b))!;
  assert.equal(item.trail.length, lines + 1, 'five verbs, one request, one line');
  assert.deepEqual(item.ladder[0]!.legs, [{ title: 'x', status: 'DONE' }, { title: 'y', status: 'ACTIVE' }]);

  await tool('work-record', ['update_record', '--gate', 'wait', '--rung', '2', 'wait for owner', '--leg', '1.1', 'x renamed', '--status', '2', 'ACTIVE'], 'duo');
  await tool('work-record', ['update_record', '--drop', '1.2'], 'duo');
  assert.deepEqual((await readItem(b))!.ladder, [
    { phase: 'p', status: 'PLANNED', legs: [{ title: 'x renamed', status: 'DONE' }] },
    { gate: 'wait for owner', status: 'ACTIVE' },
  ]);
  const refused = await run('work-record', ['update_record', '--leg', '2', 'on a gate'], 'duo');
  assert.equal(refused.status, 3);
  assert.match(refused.stderr, /rung 2 is a gate/);
  const rungs = await tool('work-record', ['read', '--rungs'], 'duo');
  assert.match(rungs, /^1\s+phase p/m);
  assert.match(rungs, /^2\s+GATE\s+wait for owner/m);
});

test('the marker places the Agent on its focus ladder and carries the ladder; a shape change clears it', async () => {
  await tool('work-record', ['update_record'], 'mark', JSON.stringify({ objective: 'Marked', ladder: [
    { gate: 'go', status: 'PLANNED' }, { phase: 'one', legs: [{ title: 'a' }, { title: 'b' }] },
  ] }));
  const id = (await readLetterHolds('mark'))!.holds[0]!;
  await tool('work-record', ['update_record', '--session', 'mark', '--at', '2.2'], 'lead');
  const item = (await readItem(id))!;
  assert.deepEqual(item.ladder.map((r) => r.gate !== undefined ? r.status : r.legs!.map((l) => l.status)), ['DONE', ['DONE', 'ACTIVE']]);
  assert.equal(item.trail.at(-1)!.by, 'lead');
  assert.deepEqual((await readLetterHolds('mark'))!.at, { item: id, rung: 2, leg: 2 });
  await tool('work-record', ['update_record', '--leg', '2.1', 'a, renamed'], 'mark');
  assert.deepEqual((await readLetterHolds('mark'))!.at, { item: id }, 'a title edit is a shape change: the position goes');
});

test('docs live on the focus item and the Docs reading lists every held item\'s docs', async () => {
  const doc = path.join(dir, 'plan.md');
  writeFileSync(doc, '# plan\n');
  const other = path.join(dir, 'other.md');
  writeFileSync(other, '# other\n');
  await tool('work-record', ['document', 'add', doc], 'docs');
  const first = (await readLetterHolds('docs'))!.holds[0]!;
  assert.deepEqual((await readItem(first))!.docs, [doc], 'holding nothing, the first doc made an item');
  const second = /Work item (w\d+)/.exec(await tool('work-record', ['project', 'create', '--title', 'Two', '--objective', 't'], 'docs'))![1]!;
  await tool('work-record', ['project', 'working', second], 'docs');
  await tool('work-record', ['document', 'add', other], 'docs');
  assert.deepEqual((await readItem(second))!.docs, [other]);
  assert.deepEqual(JSON.parse(await tool('work-record', ['document', 'list'], 'docs')).sort(), [doc, other].sort());
  const missing = await run('work-record', ['document', 'add', path.join(dir, 'nope.md')], 'docs');
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /no such file/);
  await tool('work-record', ['document', 'remove', other], 'docs');
  assert.deepEqual((await readItem(second))!.docs, []);
});
