import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';

const box = await mkdtemp(path.join(os.tmpdir(), 'ronin-setup-runtime-'));
process.env.RONIN_USER_ROOT = path.join(box, 'ronin');
process.env.RONIN_CATALOGS_DIR = path.join(box, 'ronin', 'catalogs');

const runtime = await import('../src/setup-runtime.js');
const roots = await import('../src/project-roots.js');
const arrangements = await import('../src/desks/arrangement.js');
const launchDesks = await import('../src/launch-desks.js');

const available = (installed: string[]) => [
  { id: 'claude', label: 'Claude Code', from: 'Anthropic', get: 'install claude', parked: '', cmd: 'claude', installed: installed.includes('claude'), path: installed.includes('claude') ? '/bin/claude' : '' },
  { id: 'codex', label: 'Codex', from: 'OpenAI', get: '', parked: 'Install this provider yourself.', cmd: 'codex', installed: installed.includes('codex'), path: installed.includes('codex') ? '/bin/codex' : '' },
];

test('provider facts distinguish absent, installable, installed, login open, activated, and count bands', async () => {
  const closed = { exists: async () => false };
  const none = await runtime.setupRuntimeAnswer({}, closed, available([]));
  assert.deepEqual(none.providers.map((provider) => provider.state), ['installable', 'absent']);
  assert.equal(none.activated_count, 0);
  assert.equal(none.activated_band, 'zero');

  const installed = await runtime.setupRuntimeAnswer({}, closed, available(['claude']));
  assert.equal(installed.providers[0]?.state, 'installed');

  const login = await runtime.setupRuntimeAnswer({}, { exists: async (name) => name === 'provider_setup_claude' }, available(['claude']));
  assert.equal(login.providers[0]?.state, 'login_open');
  assert.deepEqual(login.providers[0]?.attachment, {
    type: 'session', key: 'provider_setup_claude', team: 'provider_setup', temporary: true,
  });
  assert.equal(login.providers[1]?.attachment, null);
  assert.equal('session' in login.providers[0]!, false, 'attachment is the sole public setup-session identity');

  const one = await runtime.setupRuntimeAnswer(
    { providers: { claude: { activated_at: '2026-09-05T00:00:00.000Z' } } }, closed, available(['claude']),
  );
  assert.equal(one.providers[0]?.state, 'activated');
  assert.equal(one.activated_count, 1);
  assert.equal(one.activated_band, 'one');

  const two = await runtime.setupRuntimeAnswer(
    { providers: { claude: { activated_at: 'a' }, codex: { activated_at: 'b' } } }, closed, available(['claude', 'codex']),
  );
  assert.equal(two.activated_count, 2);
  assert.equal(two.activated_band, 'two_plus');
});

test('runtime dependency facts distinguish installed from active gbrain and Services', async () => {
  const installed = {
    cowork: { release: null, commit: 'abc', dirty: false, startedAt: 'now' },
    services: {
      parts: ['gbrain', 'koe'], loaded: ['gbrain'], parked: [], installed: true,
      restart_needed: false, activated: true, stage: 'active', switched_on: true,
    },
    routines: [],
  };
  const answer = await runtime.setupRuntimeAnswer({}, { exists: async () => false }, available([]), installed);
  assert.deepEqual(answer.gbrain, { installed: true, active: true });
  assert.deepEqual(answer.services, { installed: true, activated: true, switched_on: true, active: true });
  const parked = await runtime.setupRuntimeAnswer({}, { exists: async () => false }, available([]), {
    ...installed, services: { ...installed.services, loaded: [], switched_on: false },
  });
  assert.deepEqual(parked.gbrain, { installed: true, active: false });
  assert.equal(parked.services.active, false);
});

test('login opens only an installed provider and an open login is not activation', async () => {
  let opened = '';
  const ops: runtime.ProviderSessionOps = {
    exists: async () => false,
    open: async (_provider, session) => { opened = session; },
    close: async () => undefined,
  };
  await assert.rejects(runtime.openProviderLogin('claude', ops, available([])), /not installed/);
  assert.equal(opened, '');
  assert.deepEqual(await runtime.openProviderLogin('claude', ops, available(['claude'])), {
    session: 'provider_setup_claude', opened: true,
  });
  assert.equal(opened, 'provider_setup_claude');

  const failed = { ...ops, open: async () => { throw new Error('native setup failed'); } };
  await assert.rejects(runtime.openProviderLogin('claude', failed, available(['claude'])), /native setup failed/);
});

test('Done records completion and closes; Close before completion only closes', async () => {
  const live = new Set(['provider_setup_claude']);
  const closed: string[] = [];
  const recorded: Array<[string, string]> = [];
  const ops: runtime.ProviderSessionOps = {
    exists: async (name) => live.has(name),
    open: async () => undefined,
    close: async (name) => { live.delete(name); closed.push(name); },
  };
  await runtime.completeProviderLogin('claude', ops, () => '2026-09-05T01:02:03.000Z', async (provider, at) => { recorded.push([provider, at]); });
  assert.deepEqual(recorded, [['claude', '2026-09-05T01:02:03.000Z']]);
  assert.deepEqual(closed, ['provider_setup_claude']);
  await assert.rejects(runtime.completeProviderLogin('claude', ops, undefined, async () => undefined), /No open login session/);

  live.add('provider_setup_codex');
  assert.deepEqual(await runtime.closeProviderLogin('codex', ops), { session: 'provider_setup_codex', closed: true });
  assert.equal(recorded.length, 1, 'Close did not record activation');
});

test('installed roots are distinct registered repositories with READMEs and first commits', async () => {
  const made = await runtime.ensureInstalledRoots();
  assert.deepEqual(made.map((root) => root.dir), [
    path.join(process.env.RONIN_USER_ROOT!, 'Ronin Lab'),
    path.join(process.env.RONIN_USER_ROOT!, 'Ronin Project 1'),
  ]);
  for (const root of made) {
    await access(path.join(root.dir, 'README.md'));
    assert.match(await readFile(path.join(root.dir, 'README.md'), 'utf8'), new RegExp(`# ${root.label}`));
    assert.equal(execFileSync('git', ['-C', root.dir, 'rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim(), '1');
  }
  const registered = await roots.listProjectRoots();
  assert.deepEqual(registered.map((root) => root.name), ['ronin_lab', 'ronin_project_1']);
  const project = made.find((root) => root.name === 'ronin_project_1')!;
  assert.match(await readFile(path.join(project.dir, 'RONIN_REPO'), 'utf8'), /mode=reviewed[\s\S]*working=dev[\s\S]*stable=main[\s\S]*desks=managed/);
  assert.doesNotThrow(() => execFileSync('git', ['-C', project.dir, 'show-ref', '--verify', '--quiet', 'refs/heads/dev']));

  const arrangement = await arrangements.arrangementOf('ronin_project_1');
  assert.deepEqual(
    { mode: arrangement.mode, working: arrangement.working, stable: arrangement.stable, desks: arrangement.desks },
    { mode: 'reviewed', working: 'dev', stable: 'main', desks: 'managed' },
  );
  const launch = await launchDesks.resolveLaunchDesks({
    session: 'develop_project_proof', team: 'develop_project', project_root: 'ronin_project_1', agent: true, control: true,
  });
  assert.equal(launch.assignment?.project_root, 'ronin_project_1');
  assert.equal(launch.assignment?.primary, 'ronin_project_1');
  assert.equal(launch.assignment?.desks[0]?.line, 'team/develop_project/dev');
  assert.equal(launch.repositories[0]?.repo, 'ronin_project_1');
  assert.equal(launch.repositories[0]?.mode, 'managed');
  assert.equal(launch.repositories[0]?.managed?.worktree, launch.assignment?.desks[0]?.worktree);
});

test('Morning Brief scheduling creates real JIKAN state and normalizes lead/paused controls', async () => {
  const active = await runtime.createMorningBriefSchedule({
    team: 'morning_brief', request: 'Prepare the morning brief.', when: 'daily 08:00', to: 'team lead', active: true,
  });
  assert.equal(active.team, 'morning_brief');
  assert.equal(active.job.to, 'lead');
  assert.equal(active.job.state, 'active');
  assert.ok(active.job.due);

  const paused = await runtime.createMorningBriefSchedule({
    team: 'morning_brief', request: 'Prepare a second brief.', when: 'daily 09:00', to: 'lead', active: false,
  });
  assert.equal(paused.job.state, 'paused');
  assert.equal(paused.job.due, '');
  const read = await runtime.morningBriefSchedules('morning_brief');
  assert.deepEqual(read.schedules.map((job) => job.id), [active.job.id, paused.job.id]);
});

test.after(async () => { await rm(box, { recursive: true, force: true }); });
