/**
 * A TEAM'S FOUR LAYERS (KAN-331; src/team-layers.ts): Workspace, Plans, Canvases and Epics read
 * live for every member of the Team; the lead alone is told when its own layers move, once per
 * quiet spell; and `work-record read` prints them one line each with the command that reads more.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-layers-'));
process.env.RONIN_DATA_ROOT = path.join(dir, 'data');
process.env.RONIN_USER_ROOT = path.join(dir, 'user');
delete process.env.RONIN_SOCKET;
delete process.env.TMUX;
process.env.TMUX_TMPDIR = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-layers-tmux-'));
process.env.RONIN_SESSION_DIR = path.join(dir, 'sessions');
process.env.RONIN_WORK_ITEMS_DIR = path.join(dir, 'work-items');
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(dir, 'team_rosters');

// The live sessions, as a stub tmux answers them: cap leads crew, mem is on crew, other leads yard.
const bin = path.join(dir, 'bin');
await fs.mkdir(bin);
const rows = path.join(bin, 'rows');
const row = (name: string, tags: string, leads: string) => [name, '', '1', '0', '1', tags, leads, name, '', 'camp', '', '0', ''].join('\t');
await fs.writeFile(rows, [row('cap', 'crew', 'crew'), row('mem', 'crew', ''), row('other', 'yard', 'yard')].join('\n') + '\n');
await fs.writeFile(path.join(bin, 'tmux'), ['#!/bin/sh', 'case "$*" in', `  *list-sessions*) cat '${rows}';;`, '  *) exit 1;;', 'esac', ''].join('\n'), { mode: 0o755 });
process.env.PATH = `${bin}:${process.env.PATH ?? ''}`;

const { saveWorkspace, normalizeWorkspace } = await import('../src/workspaces.js');
const { createTeamRoster } = await import('../src/team-rosters.js');
const { upsertProjectRoot } = await import('../src/project-roots.js');
const { createItem, editItem } = await import('../src/work-items.js');
const { seedTegami } = await import('../src/tegami.js');
const { withHeader } = await import('../src/plans.js');
const { agentReading } = await import('../src/work-items-read.js');
const layers = await import('../src/team-layers.js');
const { listSessions } = await import('../src/tmux.js');

const repo = path.join(dir, 'shop-repo');
await fs.mkdir(repo, { recursive: true });
await upsertProjectRoot('shop_repo', { dir: repo });
await saveWorkspace(normalizeWorkspace('camp', 'shop', { title: 'Shop', objective: 'Sell things', repos: [{ name: 'shop_repo', note: '' }], folders: [] }));
await createTeamRoster('crew', { objective: 'run the shop', workspace: 'shop' }, 'camp');
await createTeamRoster('yard', { objective: 'elsewhere' }, 'camp');
for (const name of ['cap', 'mem', 'other']) await seedTegami(name, { repo: '', branch: '' }, []);

// The Workspace's plans, where plans.ts keeps them by default: Ronin Lab's camp/shop/plans.
const plansAt = path.join(dir, 'user', 'ronin_lab', 'camp', 'shop', 'plans');
await fs.mkdir(plansAt, { recursive: true });
const plan = (name: string, status: 'Draft' | 'Ordered') => fs.writeFile(path.join(plansAt, `${name}.md`), withHeader(`# ${name}\n\nbody text never shown`, { status, date: '2026-11-09', by: 'cap' }, name));
await plan('launch', 'Draft');

const epic = (await createItem({ title: 'Open the shop', kind: 'Epic', holder: { kind: 'team', name: 'crew' } }, 'cap')).item;
const elsewhere = (await createItem({ title: 'Not crew\'s', kind: 'Epic', holder: { kind: 'team', name: 'yard' } }, 'other')).item;
const sessions = async () => (await listSessions()) as never;

test('teamLayers reads the four layers live: Workspace with dirs, plans by name and status, no canvases yet, the Team\'s epics only', async () => {
  const l = await layers.teamLayers('crew');
  assert.deepEqual(l.workspace, { name: 'shop', title: 'Shop', objective: 'Sell things', repos: ['shop_repo'], folders: [], dirs: { shop_repo: repo } });
  assert.deepEqual(l.plans, [{ name: 'launch', status: 'Draft' }], 'name and status, never the text');
  assert.deepEqual(l.canvases, [], 'nothing until canvas ls lands (KAN-329)');
  assert.deepEqual(l.epics.map((e) => [e.id, e.holder, e.status]), [[epic.id, 'team:crew', epic.status]]);
  assert.ok(!l.epics.some((e) => e.id === elsewhere.id), 'another Team\'s epic is not on crew\'s line');
});

test('an epic under one of the Workspace\'s plans is on the line though the Team holds nothing of it', async () => {
  const { attachDoc } = await import('../src/work-items.js');
  const planned = (await createItem({ title: 'Planned epic', kind: 'Epic' }, 'cap')).item;
  await attachDoc(planned.id, 'plan:shop/launch', 'cap');
  assert.ok((await layers.teamLayers('crew')).epics.some((e) => e.id === planned.id));
});

test('every member reads the same four lines; an Agent reads only the Teams it is on', async () => {
  const lead = await agentReading('cap');
  const member = await agentReading('mem');
  assert.deepEqual(member.layers, lead.layers, 'one rule for lead and members (owner, 2026-11-09)');
  assert.deepEqual(lead.layers.map((l) => l.team), ['crew']);
  assert.deepEqual((await agentReading('other')).layers.map((l) => l.team), ['yard']);
});

test('the notice: only the lead whose layers moved is told, once for a burst; the first read only remembers', async () => {
  layers.resetTeamLayers();
  const told: string[] = [];
  const notify = async (lead: string) => { told.push(lead); };
  assert.deepEqual(await layers.settleLayers(notify, sessions), [], 'first read after a start');
  assert.deepEqual(await layers.settleLayers(notify, sessions), [], 'nothing moved, nobody told');
  // A burst: a plan ordered, a new plan, an epic made, all before the next read.
  await plan('launch', 'Ordered');
  await plan('second', 'Draft');
  await createItem({ title: 'Second epic', kind: 'Epic', holder: { kind: 'team', name: 'crew' } }, 'cap');
  assert.deepEqual(await layers.settleLayers(notify, sessions), ['cap'], 'one notice to the lead; mem is a member, other leads a Team that did not move');
  await editItem(elsewhere.id, { status: 'Done' }, 'other');
  assert.deepEqual(await layers.settleLayers(notify, sessions), ['other'], 'yard\'s epic closing tells yard\'s lead only');
  await saveWorkspace(normalizeWorkspace('camp', 'shop', { title: 'Shop', objective: 'Sell more things', repos: [{ name: 'shop_repo', note: '' }], folders: [] }));
  assert.deepEqual(await layers.settleLayers(notify, sessions), ['cap'], 'the Workspace changed');
  assert.deepEqual(told, ['cap', 'other', 'cap']);
});

test('work-record read prints the Team, one line per layer with its command; the Workspace list puts the Team\'s Workspace first', async () => {
  const read = await fs.readFile(path.resolve(import.meta.dirname, '../libexec/work-record-read'), 'utf8');
  for (const pointer of ['(work-record workspace list)', '(plan read <name>)', '(canvas read <name>)', '(item read <id>)']) assert.ok(read.includes(pointer), pointer);
  assert.match(read, /print\("\\n## Team %s" % l\["team"\]\)/);
  const tool = await fs.readFile(path.resolve(import.meta.dirname, '../ronin_bin/work-record'), 'utf8');
  assert.match(tool, /The Team's Workspace first \(KAN-331\), then this Agent's own entries\./);
});
