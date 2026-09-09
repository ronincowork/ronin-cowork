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
const summary = await import('../src/provider-summary.js');
const { listProviderCatalog } = await import('../src/model-providers.js');
const roots = await import('../src/project-roots.js');
const arrangements = await import('../src/desks/arrangement.js');
const launchDesks = await import('../src/launch-desks.js');

const available = (installed: string[]) => [
  { id: 'claude', label: 'Claude Code', get: 'install claude', parked: '', cmd: 'claude', installed: installed.includes('claude'), path: installed.includes('claude') ? '/bin/claude' : '' },
  { id: 'codex', label: 'Codex', get: '', parked: 'Install this provider yourself.', cmd: 'codex', installed: installed.includes('codex'), path: installed.includes('codex') ? '/bin/codex' : '' },
];
const catalog = await listProviderCatalog();
const nobody = async () => false;
/** One measured summary from a fixture machine: which CLIs are on PATH and which left a credential file. */
const measured = (section: Record<string, unknown>, installed: string[], signedIn: string[] = []) =>
  summary.measureProviders(section, { availability: available(installed), signedIn: async (id) => signedIn.includes(id), catalog, now: () => '2026-09-08T10:00:00.000Z', version: async (file) => (file === '/bin/codex' ? '0.151.0' : '') });
const answer = async (section: Record<string, unknown>, installed: string[], signedIn: string[] = [], exists: (name: string) => Promise<boolean> = nobody) =>
  runtime.setupRuntimeAnswer(section, await measured(section, installed, signedIn), { exists }, undefined, catalog);
const row = (a: Awaited<ReturnType<typeof answer>>, id: string) => a.providers.find((provider) => provider.id === id)!;

test('provider facts come from the measured summary: absent, installable, installed, login open, activated, and count bands', async () => {
  const none = await answer({}, []);
  assert.deepEqual(none.providers.map((provider) => provider.id), ['claude', 'codex', 'gemini', 'grok', 'hermes'], 'one row per CLI the registry knows, in its order');
  assert.equal(row(none, 'claude').state, 'installable');
  assert.equal(row(none, 'codex').state, 'installable', 'whether a CLI can be installed is the registry\'s fact, not the probe\'s');
  assert.equal(row(none, 'hermes').state, 'absent', 'a CLI with no install line and not on PATH is absent');
  assert.ok(row(none, 'hermes').blocked, 'and it says why Ronin cannot install it');
  assert.equal(none.activated_count, 0);
  assert.equal(none.activated_band, 'zero');
  assert.equal(none.measured_at, '2026-09-08T10:00:00.000Z', 'the answer carries the date it was measured');
  assert.equal(row(none, 'claude').provider, 'anthropic', 'the catalog joins the vendor id to the CLI');
  assert.equal(row(none, 'claude').from, 'Anthropic');
  assert.ok(row(none, 'claude').models > 0);

  const installed = await answer({}, ['claude']);
  assert.equal(row(installed, 'claude').state, 'installed');
  assert.equal(row(installed, 'claude').path, '/bin/claude');

  const login = await answer({}, ['claude'], [], async (name) => name === 'provider_setup_claude');
  assert.equal(row(login, 'claude').state, 'login_open');
  assert.deepEqual(row(login, 'claude').attachment, {
    type: 'session', key: 'provider_setup_claude', team: 'provider_setup', temporary: true,
  });
  assert.equal(row(login, 'codex').attachment, null);
  assert.equal('session' in row(login, 'claude'), false, 'attachment is the sole public setup-session identity');

  const one = await answer({ providers: { claude: { activated_at: '2026-09-05T00:00:00.000Z' } } }, ['claude']);
  assert.equal(row(one, 'claude').state, 'activated');
  assert.equal(one.activated_count, 1);
  assert.equal(one.activated_band, 'one');

  const two = await answer({ providers: { claude: { activated_at: 'a' }, codex: { activated_at: 'b' } } }, ['claude', 'codex']);
  assert.equal(two.activated_count, 2);
  assert.equal(two.activated_band, 'two_plus');

  const signedIn = await answer({}, ['claude', 'codex'], ['claude']);
  assert.equal(row(signedIn, 'claude').signed_in, true);
  assert.equal(row(signedIn, 'claude').state, 'activated', 'a credential file on this machine is a signed-in provider');
  assert.equal(row(signedIn, 'claude').activated_at, null, 'nothing was recorded; the file is the fact');
  assert.equal(row(signedIn, 'codex').signed_in, false);
  assert.equal(row(signedIn, 'codex').state, 'installed');
  assert.equal(signedIn.activated_count, 1);
  const absentButFile = await answer({}, [], ['claude']);
  assert.equal(row(absentButFile, 'claude').signed_in, false, 'a credential file without the CLI is not a usable provider');
  assert.equal(row(absentButFile, 'claude').state, 'installable');
});

test('an installed CLI\'s row says its version, what Refresh last learned of the newest, and whether Update means anything', async () => {
  const facts = await measured({}, ['claude', 'codex']);
  const before = await runtime.setupRuntimeAnswer({}, facts, { exists: nobody }, undefined, catalog);
  assert.equal(row(before, 'codex').version, '0.151.0');
  assert.equal(row(before, 'claude').version, null, 'a CLI that would not say is null, not a guess');
  assert.equal(row(before, 'codex').latest, null, 'never asked yet');
  assert.equal(row(before, 'codex').updatable, true, 'installed and the registry has an update line');
  assert.equal(row(before, 'codex').update, 'npm install -g @openai/codex@latest');
  assert.equal(row(before, 'codex').update_available, false, 'no latest, no claim');
  assert.equal(row(before, 'gemini').updatable, false, 'not installed: nothing to update');
  assert.equal(row(before, 'gemini').update, null);
  const after = await runtime.setupRuntimeAnswer({}, { ...facts, latest: { codex: { version: '0.153.4', checked_at: '2026-09-09T12:00:00.000Z' }, claude: { version: '2.1.265', checked_at: '2026-09-09T12:00:00.000Z' } } }, { exists: nobody }, undefined, catalog);
  assert.equal(row(after, 'codex').latest, '0.153.4');
  assert.equal(row(after, 'codex').latest_checked_at, '2026-09-09T12:00:00.000Z');
  assert.equal(row(after, 'codex').update_available, true);
  assert.equal(row(after, 'claude').update_available, false, 'latest known but the installed version is not: no claim either way');
  assert.equal(row(after, 'codex').askable, true, 'its update line names an npm package');
  assert.equal(row(after, 'gemini').askable, false, 'gemini updates by its own subcommand: nothing to ask');
});

test('an update runs in a temporary provider_setup session shown like a sign-in, and the one Close ends whichever is open', async () => {
  const facts = await measured({}, ['claude', 'codex']);
  const opened: string[] = []; const closed: string[] = [];
  const live = new Set<string>();
  const ops = {
    exists: async (name: string) => live.has(name),
    open: async (_provider: string, name: string) => { live.add(name); },
    openUpdate: async (_provider: string, name: string) => { opened.push(name); live.add(name); },
    close: async (name: string) => { closed.push(name); live.delete(name); },
  };
  const first = await runtime.openProviderUpdate('codex', ops, available(['claude', 'codex']));
  assert.deepEqual(first, { session: 'provider_setup_codex_update', opened: true });
  assert.deepEqual(opened, ['provider_setup_codex_update']);
  assert.deepEqual(await runtime.openProviderUpdate('codex', ops, available(['claude', 'codex'])), { session: 'provider_setup_codex_update', opened: false }, 'one at a time');
  const shown = await runtime.setupRuntimeAnswer({}, facts, ops, undefined, catalog);
  assert.equal(row(shown, 'codex').update_open, true);
  assert.deepEqual(row(shown, 'codex').attachment, { type: 'session', key: 'provider_setup_codex_update', team: 'provider_setup', temporary: true }, 'the same attachment shape a sign-in gets');
  assert.equal(row(shown, 'codex').state, 'installed', 'an update is not a sign-in state');
  await assert.rejects(() => runtime.openProviderUpdate('gemini', ops, available(['claude', 'codex'])), /not installed/);
  await assert.rejects(() => runtime.openProviderUpdate('nope', ops, available([])), /Unknown provider/);
  await ops.open('codex', 'provider_setup_codex');
  const both = await runtime.setupRuntimeAnswer({}, facts, ops, undefined, catalog);
  assert.equal(row(both, 'codex').attachment?.key, 'provider_setup_codex', 'an open sign-in owns the attachment');
  assert.deepEqual(await runtime.closeProviderLogin('codex', ops), { session: 'provider_setup_codex', closed: true });
  assert.deepEqual(closed, ['provider_setup_codex', 'provider_setup_codex_update'], 'Close ends both through the one teardown; nothing outlives its window');
  assert.deepEqual(await runtime.closeProviderLogin('codex', ops), { session: 'provider_setup_codex', closed: false });
});

test('a provider counts as activated only when the catalog gives it something to launch', async () => {
  const section = { providers: { codex: { activated_at: '2026-09-05T00:00:00.000Z' } } };
  const withCells = await summary.measureProviders(section, { availability: available(['claude', 'codex']), signedIn: async (id) => id === 'claude', catalog });
  assert.deepEqual(withCells.installed, ['claude', 'codex']);
  assert.deepEqual(withCells.signed_in, ['claude']);
  assert.deepEqual(withCells.operational, ['claude', 'codex']);
  assert.equal(withCells.activated_count, 2);
  assert.deepEqual(withCells.paths, { claude: '/bin/claude', codex: '/bin/codex' });
  // The same machine against a catalog with no OpenAI section: Codex is installed and
  // recorded, and still not activated — nothing it could launch.
  const noCodex = catalog.filter((entry) => entry.cli !== 'codex');
  const without = await summary.measureProviders(section, { availability: available(['claude', 'codex']), signedIn: async (id) => id === 'claude', catalog: noCodex });
  assert.deepEqual(without.operational, ['claude']);
  assert.equal(without.activated_count, 1);
  const shown = await runtime.setupRuntimeAnswer(section, without, { exists: nobody }, undefined, noCodex);
  assert.equal(row(shown, 'codex').models, 0);
  assert.equal(row(shown, 'codex').activated, false);
  assert.equal(row(shown, 'codex').provider, '', 'no catalog section, no vendor id');
  assert.equal(shown.activated_count, 1);
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
  const facts = await measured({}, []);
  const answer = await runtime.setupRuntimeAnswer({}, facts, { exists: nobody }, installed, catalog);
  assert.deepEqual(answer.gbrain, { installed: true, active: true });
  assert.deepEqual(answer.services, { installed: true, activated: true, switched_on: true, active: true });
  const parked = await runtime.setupRuntimeAnswer({}, facts, { exists: nobody }, {
    ...installed, services: { ...installed.services, loaded: [], switched_on: false },
  }, catalog);
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

test('concurrent runtime reads do not collide on the roots catalog', async () => {
  const before = await readFile(path.join(process.env.RONIN_CATALOGS_DIR!, 'PROJECT_ROOTS.md'), 'utf8');
  const rounds = await Promise.all([1, 2, 3, 4].map(() => runtime.ensureInstalledRoots()));
  for (const made of rounds) assert.deepEqual(made.map((root) => root.name), ['ronin_lab', 'ronin_project_1']);
  assert.equal(await readFile(path.join(process.env.RONIN_CATALOGS_DIR!, 'PROJECT_ROOTS.md'), 'utf8'), before, 'an unchanged catalog is not rewritten');
});

test('Morning Brief scheduling creates active lead jobs for each preset cadence', async () => {
  const schedules = [];
  for (const when of ['daily 07:00', 'daily 08:00', 'weekdays 08:00']) {
    schedules.push(await runtime.createMorningBriefSchedule({
      team: 'morning_brief',
      request: 'Produce the brief using the configured research roles.',
      when,
    }));
  }
  assert.ok(schedules.every((schedule) => schedule.team === 'morning_brief'));
  assert.ok(schedules.every((schedule) => schedule.job.to === 'lead'));
  assert.ok(schedules.every((schedule) => schedule.job.state === 'active'));
  assert.ok(schedules.every((schedule) => schedule.job.due));
  const read = await runtime.morningBriefSchedules('morning_brief');
  assert.deepEqual(read.schedules.map((job) => job.when), ['daily 07:00', 'daily 08:00', 'weekdays 08:00']);
});

test('Setup kinds are canonical runtime facts and persist without replacing setup state', async () => {
  const state = await import('../src/machine-state.js');
  await state.updateSection<Record<string, unknown>>('setup', () => ({
    completed_at: '2026-09-06T00:00:00.000Z',
    providers: { codex: { activated_at: '2026-09-06T01:00:00.000Z' } },
  }));
  assert.deepEqual(await runtime.writeSetupPreferences(['research', 'build', 'research']), {
    kinds: ['build', 'research'], providers: [],
  });
  const section = await state.readSetupSection();
  assert.equal(section.completed_at, '2026-09-06T00:00:00.000Z');
  assert.deepEqual(section.providers, { codex: { activated_at: '2026-09-06T01:00:00.000Z' } });
  assert.deepEqual(section.preferences, { kinds: ['build', 'research'], providers: [] });
  const answer = await runtime.setupRuntimeAnswer(section, await measured(section, []), { exists: nobody }, undefined, catalog);
  assert.deepEqual(answer.preferences, { kinds: ['build', 'research'], providers: [] });
  assert.deepEqual(await runtime.writeSetupPreferences({ providers: ['hermes', 'openai', 'hermes'] }), {
    kinds: ['build', 'research'], providers: ['hermes', 'openai'],
  });
  assert.deepEqual((await state.readSetupSection()).preferences, {
    kinds: ['build', 'research'], providers: ['hermes', 'openai'],
  });
  assert.deepEqual(await runtime.writeSetupPreferences({ kinds: ['life'] }), {
    kinds: ['life'], providers: ['hermes', 'openai'],
  }, 'purpose writes preserve provider opt-ins');
  await assert.rejects(runtime.writeSetupPreferences('build'), /Send Setup preferences/);
  await assert.rejects(runtime.writeSetupPreferences(['build', 'unknown']), /Kinds are build, life, and research/);
  assert.deepEqual(await runtime.writeSetupPreferences([]), { kinds: [], providers: ['hermes', 'openai'] });
  await assert.rejects(runtime.writeSetupPreferences({ providers: ['bad provider'] }), /provider IDs/);
});

test.after(async () => { await rm(box, { recursive: true, force: true }); });
