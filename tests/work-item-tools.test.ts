/**
 * `item …` against the real /api/work-items routes (docs/using-ronin/work-items.md): each act
 * names its item and leaves exactly one trail line; no tool refuses a caller for not being
 * the holder; `item` is the one tool for work items.
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
// Every store under private roots: holder scans and arrival notices never reach live ones.
process.env.RONIN_DATA_ROOT = path.join(dir, 'data');
process.env.RONIN_USER_ROOT = path.join(dir, 'user');
delete process.env.RONIN_SOCKET;
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
async function oneLine(id: string, args: string[], as = 'probe') {
  const before = (await trail(id)).length;
  const out = await tool('item', args, as);
  const after = await trail(id);
  assert.equal(after.length, before + 1, `item ${args.join(' ')} appended ${after.length - before} lines`);
  assert.match(out, new RegExp(`^${id} `), 'the acknowledgement is the line of what the act did');
  return after.at(-1)!;
}
const made = (out: string) => /^(w\d+) was created/m.exec(out)![1]!;

test('item acts, each naming its item, one trail line each', async () => {
  const epic = made(await tool('item', ['create', '--title', 'Overall', '--kind', 'Epic']));
  assert.deepEqual([(await readItem(epic))!.level, (await trail(epic)).map((line) => [line.op, line.to])], [1, [['create', 'none']]]);
  const id = made(await tool('item', ['create', '--title', 'Piece', '--objective', 'part', '--parent', epic, '--kind', 'Task']));
  assert.match(await tool('item', ['read', id]), /"level": 0/);

  assert.equal((await oneLine(id, ['assign', id, 'probe'])).to, 'agent:probe');
  assert.deepEqual((await readLetterHolds('probe'))!.holds, [id]);
  assert.equal((await oneLine(id, ['assign', id, 'team:crew'])).to, 'team:crew');
  assert.equal((await oneLine(id, ['handoff', id, 'none'])).op, 'handoff');
  assert.equal((await oneLine(id, ['transition', id, 'Done'])).to, 'Done');
  assert.equal((await run('item', ['edit', id, '--status', 'In Progress'])).status, 2, 'status is transition\'s, not edit\'s');
  const flagged = await oneLine(id, ['flag', id, 'stuck on the API']);
  assert.deepEqual([flagged.op, (await readItem(id))!.flagged, (await readItem(id))!.comments.at(-1)!.text], ['flag', true, 'stuck on the API']);
  assert.equal((await oneLine(id, ['unflag', id])).to, 'false');
  assert.equal((await run('item', ['edit', id, '--flagged', 'true'])).status, 2, 'flagging is its own act');
  assert.equal((await run('item', ['edit', id, '--jira', 'RON-7'])).status, 2, 'the Jira pair is written by the bridge alone');
  assert.equal((await oneLine(id, ['comment', id, 'one remark'])).op, 'comment');
  assert.equal((await oneLine(id, ['edit', id, '--priority', 'Highest', '--kind', 'Feature'])).note, 'kind Feature, priority Highest');
  assert.equal((await oneLine(id, ['comment', id, '--edit', '2', 'one remark, fixed'])).from, '2');
  const doc = path.join(dir, 'plan.md');
  writeFileSync(doc, '# plan\n');
  await oneLine(id, ['attach', id, doc]);
  assert.deepEqual((await readItem(id))!.attachments, [doc]);
  const missing = await run('item', ['attach', id, path.join(dir, 'nope.md')]);
  assert.match(missing.stderr, /no such file/);

  const sub = made(await tool('item', ['create', '--title', 'Sub', '--parent', id]));
  assert.equal((await readItem(sub))!.level, -1);
  const children = JSON.parse(await tool('item', ['read', id])).children as Array<{ id: string }>;
  assert.deepEqual(children.map((child) => child.id), [sub]);
  const peer = made(await tool('item', ['create', '--title', 'Peer']));
  const stuck = await run('item', ['edit', id, '--parent', peer]);
  assert.deepEqual([stuck.status, stuck.stderr.trim()], [4, `${id} can't go there.`]);
  const loose = made(await tool('item', ['create', '--title', 'Loose']));
  const moved = await oneLine(loose, ['edit', loose, '--parent', epic]);
  assert.deepEqual([moved.op, moved.to, (await readItem(loose))!.level], ['move', epic, 0]);
  assert.equal((await oneLine(peer, ['link', peer, 'Blocks', loose])).note, `Blocks ${loose}`);
  assert.match(await tool('item', ['read', loose]), new RegExp(`"from": "${peer}"`));
  assert.equal((await oneLine(peer, ['link', peer, 'Blocks', loose, '--remove'])).note, `Blocks ${loose}: link removed`);

  const listed = JSON.parse(await tool('item', ['search', '--parent', epic])) as { items: Array<{ id: string }> };
  assert.deepEqual(listed.items.map((item) => item.id).sort(), [id, loose].sort());
  const roots = JSON.parse(await tool('item', ['search', '--no-parent', '--status', 'To Do'])) as { items: Array<{ parent: string | null; status: string }> };
  assert.ok(roots.items.length && roots.items.every((item) => item.parent === null && item.status === 'To Do'));
  assert.match(await tool('item', ['delete', id]), new RegExp(`^${id} was deleted; with its subtasks ${sub}`));
  assert.equal(await readItem(sub), null);
  for (const verb of ['move', 'list', 'doc', 'plan', 'focus', 'evidence', 'write']) assert.equal((await run('item', [verb, loose])).status, 2, `item ${verb} is not an act`);
});

test('item is the one tool for work items: team and work-record have no item acts', async () => {
  assert.notEqual((await run('team', ['item', 'read', 'w1'])).status, 0);
  assert.notEqual((await run('work-record', ['item', 'read', 'w1'])).status, 0);
  assert.notEqual((await run('work-record', ['document', 'add', path.join(dir, 'plan.md')])).status, 0);
  assert.notEqual((await run('work-record', ['update_record', '--phase', 'p'])).status, 0);
});

test('work-record add_doc adds a document to the item you hold; holding several, --item names one', async () => {
  await seedTegami('writer');
  const doc = path.join(dir, 'idea.md');
  writeFileSync(doc, '# idea\n');
  assert.match((await run('work-record', ['add_doc', doc], 'writer')).stderr, /^NO-ITEM: you hold no work item/);
  const first = made(await tool('item', ['create', '--title', 'Idea']));
  await tool('item', ['assign', first, 'writer']);
  await tool('work-record', ['add_doc', doc], 'writer');
  assert.deepEqual((await readItem(first))!.attachments, [doc]);
  const second = made(await tool('item', ['create', '--title', 'Concept']));
  await tool('item', ['assign', second, 'writer']);
  const several = await run('work-record', ['add_doc', doc], 'writer');
  assert.deepEqual([several.status, several.stderr.trim()], [2, `BAD-ARG: you hold ${first} ${second}; name one with --item <id>`]);
  await tool('work-record', ['add_doc', doc, '--item', second], 'writer');
  assert.deepEqual((await readItem(second))!.attachments, [doc]);
});

test('an id no route can hold answers "No work item <id>", and a reply that is not JSON names its HTTP status', async () => {
  for (const args of [['read', 'surface/7'], ['transition', 'surface/7', 'Done']]) {
    const r = await run('item', args);
    assert.equal(r.status, 3, `item ${args.join(' ')}`);
    assert.equal(r.stderr.trim(), 'No work item surface/7.');
  }
  const { createServer } = await import('node:http');
  const html = createServer((_req, res) => { res.writeHead(502, { 'content-type': 'text/html' }); res.end('<html>bad gateway</html>'); });
  await new Promise<void>((resolve) => html.listen(0, '127.0.0.1', resolve));
  try {
    const r = await new Promise<{ status: number; stderr: string }>((resolve) => {
      execFile(path.join(root, 'ronin_bin', 'item'), ['read', 'w1'], {
        encoding: 'utf8', env: { ...env, RONIN_URL: `http://127.0.0.1:${(html.address() as AddressInfo).port}` },
      }, (error, _stdout, stderr) => resolve({ status: error ? Number((error as { code?: number }).code ?? 1) : 0, stderr }));
    });
    assert.equal(r.status, 3);
    assert.equal(r.stderr.trim(), 'HTTP 502: Ronin answered GET /api/work-items/w1 without JSON');
  } finally {
    html.close();
  }
});
