import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';

const box = await mkdtemp(path.join(os.tmpdir(), 'ronin-team-retire-'));
process.env.TMUX = '';
process.env.TMUX_TMPDIR = path.join(box, 'tmux');
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(box, 'teams');
process.env.RONIN_USER_ROOT = path.join(box, 'user');
await mkdir(process.env.TMUX_TMPDIR, { recursive: true, mode: 0o700 });

const tmux = await import('../src/tmux.js');
const { retireTeam } = await import('../src/team-retire.js');
const { createTeamRoster, readTeamRoster } = await import('../src/team-rosters.js');

test('retiring an orphaned no-roster membership detaches it without an impossible roster preflight', async () => {
  await tmux.createSession('tag_only_member', box, { agent: false, argv: ['/bin/sh', '-c', 'while :; do sleep 60; done'] });
  await tmux.setTags('tag_only_member', ['tag_only', 'other']);
  await tmux.setLeads('tag_only_member', ['tag_only']);

  assert.deepEqual(await retireTeam('tag_only'), { ok: true, retired: 'tag_only' });
  assert.deepEqual(await tmux.getTags('tag_only_member'), ['other']);
  assert.deepEqual(await tmux.getLeads('tag_only_member'), []);
});

test('retiring a normal roster Team removes its record and membership', async () => {
  await createTeamRoster('ordinary', { title: 'Ordinary', objective: 'normal Team' });
  await tmux.createSession('ordinary_member', box, { agent: false, argv: ['/bin/sh', '-c', 'while :; do sleep 60; done'] });
  await tmux.setTags('ordinary_member', ['ordinary']);

  assert.deepEqual(await retireTeam('ordinary'), { ok: true, retired: 'ordinary' });
  assert.equal(await readTeamRoster('ordinary'), null);
  assert.deepEqual(await tmux.getTags('ordinary_member'), []);
});

test.after(async () => {
  await tmux.killSession('tag_only_member').catch(() => {});
  await tmux.killSession('ordinary_member').catch(() => {});
  await rm(box, { recursive: true, force: true });
});
