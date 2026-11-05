/**
 * PLANS (KAN-256; docs/using-ronin/planning.md): the states and their refusals; the header is the
 * tool's; --workspace and the one-Team rule; the default place (Ronin Lab's <campaign>/<workspace>/
 * plans) and a changed one, with its clash refusal and the Reviewed refusal; one-file commits and the
 * push; `plan:` attachments through the item tool, opened where the plan now is, and gone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';

const root = path.resolve(import.meta.dirname, '..');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-plans-'));
process.env.RONIN_DATA_ROOT = path.join(dir, 'data');
process.env.RONIN_USER_ROOT = path.join(dir, 'user');
delete process.env.RONIN_SOCKET;
delete process.env.TMUX;
process.env.TMUX_TMPDIR = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-plans-tmux-'));
process.env.RONIN_SESSION_DIR = path.join(dir, 'sessions');
process.env.RONIN_WORK_ITEMS_DIR = path.join(dir, 'work-items');
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(dir, 'team_rosters');

// The live sessions, as a stub tmux answers them: lead leads crew (in Workspace shop); solo is on
// no Team; both is on crew and on yard (Workspace depot). A tool call runs as FAKE_SESSION.
const bin = path.join(dir, 'bin');
await fs.mkdir(bin);
const rows = path.join(bin, 'rows');
const row = (name: string, tags: string, leads: string) => [name, '', '1', '0', '1', tags, leads, name, '', 'camp', '', '0', ''].join('\t');
await fs.writeFile(rows, [row('lead', 'crew', 'crew'), row('solo', '', ''), row('both', 'crew,yard', '')].join('\n') + '\n');
await fs.writeFile(path.join(bin, 'tmux'), [
  '#!/bin/sh',
  'S=${FAKE_SESSION:-lead}',
  'case "$*" in',
  '  *display-message*) echo "@1";;',
  "  *list-windows*) printf '%s\\t@1\\n' \"$S\";;",
  `  *list-sessions*) cat '${rows}';;`,
  '  *) exit 1;;',
  'esac',
  '',
].join('\n'), { mode: 0o755 });
process.env.PATH = `${bin}:${process.env.PATH ?? ''}`;

const plans = await import('../src/plans.js');
const { saveWorkspace, readWorkspace } = await import('../src/workspaces.js');
const { createTeamRoster } = await import('../src/team-rosters.js');
const { upsertProjectRoot } = await import('../src/project-roots.js');
const { registerPlans } = await import('../src/routes/plans-api.js');
const { registerWorkspaces } = await import('../src/routes/workspaces-api.js');
const { registerWorkItems } = await import('../src/routes/work-items-api.js');
const { createItem, readItem } = await import('../src/work-items.js');
const { agentReading } = await import('../src/work-items-read.js');
const { seedTegami } = await import('../src/tegami.js');

const git = (at: string, ...args: string[]) => execFileSync('git', ['-C', at, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });

// Ronin Lab, as Setup makes it: a Direct repository with Git, registered as ronin_lab.
const lab = path.join(dir, 'user', 'ronin_lab');
await fs.mkdir(lab, { recursive: true });
git(lab, 'init', '-q', '-b', 'main');
git(lab, 'commit', '-q', '--allow-empty', '-m', 'init');
await upsertProjectRoot('ronin_lab', { dir: lab });

const blank = { title: '', objective: '', instructions: '', repos: [], folders: [], launch_mode: 'configured' as const };
await saveWorkspace({ ...blank, name: 'shop', campaign_id: 'camp' });
await saveWorkspace({ ...blank, name: 'depot', campaign_id: 'camp' });
await createTeamRoster('crew', { objective: 'build', workspace: 'shop' }, 'camp');
await createTeamRoster('yard', { objective: 'store', workspace: 'depot' }, 'camp');
await seedTegami('lead');

const app = express();
app.use(express.json());
registerPlans(app);
registerWorkspaces(app);
registerWorkItems(app);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
test.after(() => server.close());
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const put = async (at: string, body: unknown) => {
  const r = await fetch(`${base}${at}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() as Record<string, unknown> };
};

const run = (name: string, args: string[], as = 'lead', input = '') => new Promise<{ status: number; stdout: string; stderr: string }>((resolve) => {
  const child = execFile(path.join(root, 'ronin_bin', name), args, { encoding: 'utf8', env: { ...process.env, TMUX_PANE: '%1', FAKE_SESSION: as, RONIN_URL: base } }, (error, stdout, stderr) =>
    resolve({ status: error ? Number((error as { code?: number }).code ?? 1) : 0, stdout, stderr }));
  child.stdin?.end(input);
});
const ok = async (name: string, args: string[], as = 'lead', input = '') => {
  const r = await run(name, args, as, input);
  assert.equal(r.status, 0, `${name} ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};

const ORDER = `# Shop fit\n\nStatus: Ordered · 1999-01-01 · someone\n\nAsked by the owner.\n\n## Epics\n\n| Epic | Team | What done looks like |\n|---|---|---|\n| Shelves | crew | the shelves stand |\n\n## Closed\n\n<Filled by plan close: did we do what we said?>\n`;
const shopDir = path.join(lab, 'camp', 'shop', 'plans');

test('the template is the one block in planning.md, read by plan read --template', async () => {
  const out = await ok('plan', ['read', '--template']);
  assert.match(out, /^# <Project name>\n\nAsked by <who>\./);
  assert.match(out, /## Epics/);
  assert.doesNotMatch(out, /```/);
});

test('write is a Draft at the default place, the header the tool\'s, one file committed', async () => {
  // Something else staged in the shared checkout stays staged, uncommitted.
  await fs.writeFile(path.join(lab, 'other.md'), 'not mine\n');
  git(lab, 'add', 'other.md');
  const out = await ok('plan', ['write', 'fit'], 'lead', ORDER);
  assert.match(out, /^Wrote shop\/fit \(Draft\)\.\nStatus: Draft · \d{4}-\d\d-\d\d · lead\nCommitted\.\n$/);
  const text = await fs.readFile(path.join(shopDir, 'fit.md'), 'utf8');
  assert.match(text, /^# Shop fit\n\nStatus: Draft · \S+ · lead\n\nAsked by the owner\./);
  assert.equal(text.match(/^Status:/gm)?.length, 1, 'the writer\'s own Status line is replaced');
  assert.equal(git(lab, 'log', '-1', '--format=%s'), 'plan fit: write\n');
  assert.deepEqual(git(lab, 'show', '--name-only', '--format=', 'HEAD').trim().split('\n'), ['camp/shop/plans/fit.md']);
  assert.match(git(lab, 'status', '--short'), /^A  other\.md/m);
  git(lab, 'reset', '-q', 'other.md');
  await fs.rm(path.join(lab, 'other.md'));
});

test('no guards: write keeps the status, order and close work from any status', async () => {
  // A plan with no Epics rows orders all the same; the docs and briefs steer, the tool doesn't.
  const blankEpics = (await ok('plan', ['read', '--template'])).replace('# <Project name>', '# Empty');
  await ok('plan', ['write', 'empty', '--workspace', 'shop'], 'solo', blankEpics);
  assert.match(await ok('plan', ['order', 'empty']), /^Ordered shop\/empty\..*\nStatus: Ordered · /);

  // Close works on a Draft; a second close replaces the Closed line.
  await ok('plan', ['write', 'rough'], 'lead', '# Rough\n');
  assert.match(await ok('plan', ['close', 'rough', 'Dropped.']), /^Closed shop\/rough\.\nStatus: Closed · /);
  assert.match(await ok('plan', ['close', 'rough', 'Dropped for good.']), /^Closed shop\/rough\./);
  const rough = await fs.readFile(path.join(shopDir, 'rough.md'), 'utf8');
  assert.match(rough, /## Closed\n\nDropped for good\. \(\d{4}-\d\d-\d\d\)\n$/);
  assert.doesNotMatch(rough, /Dropped\. \(/);
  await fs.rm(path.join(shopDir, 'rough.md'));
  git(lab, 'add', '-A', '--', 'camp/shop/plans/rough.md');
  git(lab, 'commit', '-q', '-m', 'test: rough gone', '--', 'camp/shop/plans/rough.md');

  // A write keeps the status the plan has: an Ordered plan rewritten is still Ordered.
  assert.match(await ok('plan', ['order', 'fit']), /^Ordered shop\/fit\. .*\nStatus: Ordered · /);
  assert.match(await ok('plan', ['write', 'fit'], 'lead', ORDER), /^Rewrote shop\/fit \(Ordered\)\.\nStatus: Ordered · /);
  assert.match(await ok('plan', ['order', 'fit']), /^Ordered shop\/fit\./);

  assert.match(await ok('plan', ['close', 'fit', 'Yes: the shelves stand.']), /^Closed shop\/fit\.\nStatus: Closed · /);
  const closed = await fs.readFile(path.join(shopDir, 'fit.md'), 'utf8');
  assert.match(closed, /## Closed\n\nYes: the shelves stand\. \(\d{4}-\d\d-\d\d\)\n$/);
  // The rewrite matched what was there, so it had nothing to commit.
  assert.deepEqual(git(lab, 'log', '-3', '--format=%s').trim().split('\n'), ['plan fit: close', 'plan fit: order', 'test: rough gone']);

  assert.equal(await ok('plan', ['ls', '--status', 'Closed']), `fit\tClosed\t${closed.match(/Closed · (\S+)/)![1]}\tlead\n`);
  assert.match(await ok('plan', ['ls']), /^empty\tOrdered\t.*\nfit\tClosed/);
  assert.equal((await run('plan', ['ls', '--status', 'Done'])).status, 3);
  assert.match((await run('plan', ['write', 'Bad_Name'], 'lead', ORDER)).stderr, /lowercase letters, digits and -/);
});

test('--workspace and the one-Team rule; <workspace>/<name> anywhere in the Campaign', async () => {
  const none = await run('plan', ['ls'], 'solo');
  assert.equal(none.status, 4);
  assert.match(none.stderr, /No Team of yours has a Workspace; name one with --workspace <name>\. Workspaces: depot, shop\./);
  const two = await run('plan', ['ls'], 'both');
  assert.match(two.stderr, /^Your Teams are in depot, shop; name one with --workspace <name>\./);
  assert.match(await ok('plan', ['ls', '--workspace', 'depot'], 'both'), /^No plans in depot\./);
  assert.match(await ok('plan', ['read', 'shop/fit'], 'solo'), /^# Shop fit/);
  assert.match((await run('plan', ['ls', '--workspace', 'nowhere'], 'solo')).stderr, /No Workspace nowhere in camp/);
});

test('plan: attachments go through the item tool, open where the plan is, and say gone', async () => {
  const epic = (await createItem({ title: 'Shelves', kind: 'Epic', campaign_id: 'camp', holder: { kind: 'agent', name: 'lead' } }, 'owner')).item.id;
  await ok('item', ['attach', epic, 'plan:fit']);
  assert.deepEqual((await readItem(epic))!.attachments, ['plan:shop/fit']);
  assert.match((await run('item', ['attach', epic, 'plan:missing'])).stderr, /no plan shop\/missing/);
  assert.deepEqual((await agentReading('lead')).attachments, [path.join(shopDir, 'fit.md')]);
  assert.equal(await plans.resolvePlanRef('camp', 'plan:shop/nothing'), null);
  const r = await fetch(`${base}/api/plans/resolve?ref=shop/fit&campaign_id=camp`);
  assert.equal(((await r.json()) as { path: string }).path, path.join(shopDir, 'fit.md'));
});

test('a changed Plans place: any Location, a clash stops the Save, else the plans move and every plan: still opens', async () => {
  // A folder without Git that already has fit.md: stopped, nothing moved.
  const notes = path.join(dir, 'notes');
  await fs.mkdir(path.join(notes, 'plans'), { recursive: true });
  await fs.writeFile(path.join(notes, 'plans', 'fit.md'), 'theirs\n');
  await upsertProjectRoot('notes', { dir: notes });
  const clash = await put('/api/workspaces/shop', { ...blank, campaign_id: 'camp', plans: { location: 'notes', path: 'plans' } });
  assert.equal(clash.status, 409);
  assert.match(String(clash.body.error), /^Not saved: notes\/plans already has fit\. /);
  assert.equal((await readWorkspace('camp', 'shop'))!.plans, undefined);
  await fs.rm(path.join(notes, 'plans', 'fit.md'));

  // A Reviewed repository is a Location like any other.
  const reviewed = path.join(dir, 'reviewed');
  await fs.mkdir(reviewed);
  git(reviewed, 'init', '-q');
  await fs.writeFile(path.join(reviewed, 'RONIN_REPO'), 'mode=reviewed\ndesks=managed\n');
  await upsertProjectRoot('rev', { dir: reviewed });
  const toRev = await put('/api/workspaces/shop', { ...blank, campaign_id: 'camp', plans: { location: 'rev', path: 'plans' } });
  assert.equal(toRev.status, 200, JSON.stringify(toRev.body));
  assert.deepEqual((toRev.body.moved as string[]).sort(), ['empty', 'fit']);
  assert.deepEqual(await fs.readdir(shopDir), []);
  assert.match(git(lab, 'log', '-1', '--format=%s'), /^plans: moved to rev\/plans/);
  assert.match(git(reviewed, 'log', '-1', '--format=%s'), /^plans: moved from ronin_lab\/camp\/shop\/plans/);

  const moved = await put('/api/workspaces/shop', { ...blank, campaign_id: 'camp', plans: { location: 'notes', path: 'plans' } });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.deepEqual((moved.body.moved as string[]).sort(), ['empty', 'fit']);
  assert.deepEqual((await readWorkspace('camp', 'shop'))!.plans, { location: 'notes', path: 'plans' });
  assert.match(git(reviewed, 'log', '-1', '--format=%s'), /^plans: moved to notes\/plans/);
  assert.equal(await plans.resolvePlanRef('camp', 'plan:shop/fit'), path.join(notes, 'plans', 'fit.md'));

  // A Save that doesn't mention plans keeps the place (the page's other edits never wipe it).
  await put('/api/workspaces/shop', { ...blank, campaign_id: 'camp', objective: 'new words' });
  assert.deepEqual((await readWorkspace('camp', 'shop'))!.plans, { location: 'notes', path: 'plans' });

  // The file gone: the attachment stays as written, and the reading says so.
  await fs.rm(path.join(notes, 'plans', 'fit.md'));
  assert.deepEqual((await agentReading('lead')).attachments, ['plan:shop/fit']);
});

test('a branch with an upstream is pushed once; a failed push is said and the write stands', async () => {
  const remote = path.join(dir, 'remote.git');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  await saveWorkspace({ ...blank, name: 'pushed', campaign_id: 'camp' });
  git(lab, 'remote', 'add', 'origin', remote);
  git(lab, 'push', '-q', '-u', 'origin', 'main');
  const out = await ok('plan', ['write', 'up', '--workspace', 'pushed'], 'solo', '# Up\n');
  assert.match(out, /Committed and pushed to origin\/main\.\n$/);
  assert.equal(execFileSync('git', ['-C', remote, 'log', '-1', '--format=%s', 'main'], { encoding: 'utf8' }), 'plan up: write\n');

  git(lab, 'remote', 'set-url', 'origin', path.join(dir, 'no-such-remote.git'));
  const failed = await ok('plan', ['write', 'up', '--workspace', 'pushed'], 'solo', '# Up again\n');
  assert.match(failed, /^Rewrote pushed\/up \(Draft\)\.\n.*\nCommitted; the push to origin\/main failed: /);
  assert.match(await fs.readFile(path.join(lab, 'camp', 'pushed', 'plans', 'up.md'), 'utf8'), /^# Up again/);
});
