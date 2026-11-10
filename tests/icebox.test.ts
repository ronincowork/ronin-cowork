/**
 * THE ICEBOX (KAN-352; docs/using-ronin/planning.md, Park it): plan park writes the Draft plan and
 * its Icebox item in one act, both held by the Workspace; on no record, not unheld; taken up by an
 * epic attaching the plan; every Workspace given its one Icebox.
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
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-icebox-'));
process.env.RONIN_DATA_ROOT = path.join(dir, 'data');
process.env.RONIN_USER_ROOT = path.join(dir, 'user');
delete process.env.RONIN_SOCKET;
delete process.env.TMUX;
process.env.TMUX_TMPDIR = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-plans-tmux-'));
process.env.RONIN_SESSION_DIR = path.join(dir, 'sessions');
process.env.RONIN_WORK_ITEMS_DIR = path.join(dir, 'work-items');
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(dir, 'team_rosters');

// The live sessions, as a stub tmux answers them: lead leads crew (in Workspace shop); solo is on
// no Team; both is on crew and on yard (Workspace depot); pair is on crew and dock, both in shop.
// A tool call runs as FAKE_SESSION.
const bin = path.join(dir, 'bin');
await fs.mkdir(bin);
const rows = path.join(bin, 'rows');
const row = (name: string, tags: string, leads: string) => [name, '', '1', '0', '1', tags, leads, name, '', 'camp', '', '0', ''].join('\t');
await fs.writeFile(rows, [row('lead', 'crew', 'crew'), row('solo', '', ''), row('both', 'crew,yard', ''), row('pair', 'crew,dock', '')].join('\n') + '\n');
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

const { saveWorkspace } = await import('../src/workspaces.js');
const { createTeamRoster } = await import('../src/team-rosters.js');
const { upsertProjectRoot } = await import('../src/project-roots.js');
const { registerPlans } = await import('../src/routes/plans-api.js');
const { registerWorkItems } = await import('../src/routes/work-items-api.js');
const { createItem, readItem, holdersOf, ensureEveryIcebox, listItems } = await import('../src/work-items.js');
const { agentReading, teamReading } = await import('../src/work-items-read.js');
const { seedTegami } = await import('../src/tegami.js');

const git = (at: string, ...args: string[]) => execFileSync('git', ['-C', at, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
const lab = path.join(dir, 'user', 'ronin_lab');
await fs.mkdir(lab, { recursive: true });
git(lab, 'init', '-q', '-b', 'main');
git(lab, 'commit', '-q', '--allow-empty', '-m', 'init');
await upsertProjectRoot('ronin_lab', { dir: lab });

const blank = { title: '', objective: '', instructions: '', repos: [], folders: [], launch_mode: 'configured' as const, integrations: [] };
await saveWorkspace({ ...blank, name: 'shop', campaign_id: 'camp' });
await saveWorkspace({ ...blank, name: 'depot', campaign_id: 'camp' });
await createTeamRoster('crew', { objective: 'build', workspace: 'shop' }, 'camp');
await createTeamRoster('yard', { objective: 'store', workspace: 'depot' }, 'camp');
await createTeamRoster('dock', { objective: 'ship', workspace: 'shop' }, 'camp');
await seedTegami('lead');
await seedTegami('solo');

const app = express();
app.use(express.json());
registerPlans(app);
registerWorkItems(app);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
test.after(() => server.close());
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

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
const search = async (q: string) => (await (await fetch(`${base}/api/work-items?${q}`)).json() as { items: Array<{ id: string }> }).items.map((item) => item.id);

let icebox = '';
let parked = '';

test('park it: one act writes the Draft plan and its Icebox item, both held by the Workspace', async () => {
  const out = await ok('plan', ['park', 'sauna', '--idea', 'a sauna'], 'lead', '# Sauna\n\nAsked by the owner.\n');
  assert.match(out, /^Wrote shop\/sauna \(Draft\)\./);
  assert.match(out, /Parked: (\S+) 'Draft the plan for a sauna' in the Icebox (\S+), held by Workspace shop, sauna attached\./);
  [, parked, icebox] = /Parked: (\S+) .* in the Icebox (\S+),/.exec(out)!;
  const epic = (await readItem(icebox))!;
  assert.equal(epic.title, 'Icebox: shop');
  assert.equal(epic.level, 1);
  assert.equal(epic.created.by, 'ronin');
  const item = (await readItem(parked))!;
  assert.equal(item.parent, icebox);
  assert.deepEqual(item.attachments, ['plan:shop/sauna']);
  for (const id of [icebox, parked]) assert.deepEqual(await holdersOf(id), [{ kind: 'workspace', name: 'shop', campaign: 'camp' }]);
  // The idea defaults to the plan's title; the same Icebox takes it.
  const second = await ok('plan', ['park', 'pond', '--workspace', 'shop'], 'solo', '# A pond\n\nAsked by the owner.\n');
  assert.match(second, new RegExp(`'Draft the plan for A pond' in the Icebox ${icebox},`));
});

test('the Icebox is on no Team\'s or Agent\'s record and never reads as work to give out', async () => {
  const lead = await agentReading('lead');
  const onRecord = [...lead.items, ...lead.teams.flatMap((team) => team.items), ...lead.layers.flatMap((layer) => layer.epics)].map((item) => item.id);
  assert.ok(!onRecord.includes(icebox) && !onRecord.includes(parked));
  assert.ok(!(await agentReading('solo')).items.some((item) => item.id === parked), 'the parker does not hold it');
  for (const team of ['crew', 'yard', 'dock']) assert.ok(!(await teamReading(team)).boards.some((item) => item.id === icebox || item.id === parked), team);
  const unheld = await search('holder=none');
  assert.ok(!unheld.includes(icebox) && !unheld.includes(parked), 'not in the put-back list');
  assert.ok((await search('holder=workspace:shop')).includes(parked));
});

test('taken up: an epic attaching the plan moves its Icebox item to Done; the Icebox stays', async () => {
  const epic = (await createItem({ title: 'Sauna', kind: 'Epic', campaign_id: 'camp' }, 'lead')).item;
  await ok('item', ['attach', epic.id, 'plan:sauna']);
  const item = (await readItem(parked))!;
  assert.equal(item.status, 'Done');
  assert.match(item.trail.at(-1)!.note ?? '', new RegExp(`taken up: ${epic.id} carries plan:shop/sauna`));
  assert.notEqual((await readItem(icebox))!.status, 'Done');
});

test('every Workspace gets its one Icebox; a second sweep makes none', async () => {
  const made = await ensureEveryIcebox();
  assert.equal(made.length, 1, 'depot has none yet; shop has its own');
  assert.deepEqual(await holdersOf(made[0]!), [{ kind: 'workspace', name: 'depot', campaign: 'camp' }]);
  assert.deepEqual(await ensureEveryIcebox(), []);
  assert.equal((await listItems()).filter((item) => item.title.startsWith('Icebox: ')).length, 2);
});
