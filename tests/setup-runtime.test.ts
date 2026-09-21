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
  summary.measureProviders(section, { availability: available(installed), signedIn: async (id) => signedIn.includes(id), catalog, now: () => '2026-09-08T10:00:00.000Z', version: async (file) => (file === '/bin/codex' ? '0.151.0' : ''), modelList: async (id) => id === 'codex' ? { fetched_at: '2026-09-09T10:42:03Z', etag: 'e', client_version: '0.151.0', models: [{ slug: 'gpt-5.6-sol', display_name: 'Sol', description: '', visibility: 'list', priority: 1 }] } : null });
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

test('an activated CLI\'s row says its version, what Refresh last learned of the newest, and whether Update means anything; one not activated says Installed and stops', async () => {
  const on = { providers: { codex: { activated_at: '2026-09-05T00:00:00.000Z' }, claude: { activated_at: '2026-09-05T00:00:00.000Z' } } };
  const facts = await measured(on, ['claude', 'codex']);
  const before = await runtime.setupRuntimeAnswer(on, facts, { exists: nobody }, undefined, catalog);
  assert.equal(row(before, 'codex').version, '0.151.0');
  assert.equal(row(before, 'codex').model_list?.client_version, '0.151.0');
  assert.equal(row(before, 'claude').version, null, 'a CLI that would not say is null, not a guess');
  assert.equal(row(before, 'codex').latest, null, 'never asked yet');
  assert.equal(row(before, 'codex').updatable, true, 'activated and the registry has an update line');
  assert.equal(row(before, 'codex').update_available, false, 'no latest, no claim');
  assert.equal(row(before, 'gemini').updatable, false, 'not installed: nothing to update');
  assert.equal(row(before, 'gemini').update, null);
  // Installed but not activated: nothing asked, nothing offered — not a stale version, not "not read".
  const quiet = await measured({}, ['claude', 'codex']);
  assert.deepEqual(quiet.versions, {}, 'no activated provider, no exec at all');
  const idle = await runtime.setupRuntimeAnswer({}, { ...quiet, versions: { codex: '0.151.0' }, latest: { codex: { version: '0.153.4', checked_at: 'c' } } }, { exists: nobody }, undefined, catalog);
  assert.equal(row(idle, 'codex').version, null, 'an earlier measurement is not printed as current');
  assert.equal(row(idle, 'codex').latest, null);
  assert.equal(row(idle, 'codex').updatable, false, 'no control for a provider Ronin is not using');
  const after = await runtime.setupRuntimeAnswer(on, { ...facts, latest: { codex: { version: '0.153.4', checked_at: '2026-09-09T12:00:00.000Z' }, claude: { version: '2.1.265', checked_at: '2026-09-09T12:00:00.000Z' } } }, { exists: nobody }, undefined, catalog);
  assert.equal(row(after, 'codex').latest, '0.153.4');
  assert.equal(row(after, 'codex').latest_checked_at, '2026-09-09T12:00:00.000Z');
  assert.equal(row(after, 'codex').update_available, true);
  assert.equal(row(after, 'claude').update_available, false, 'latest known but the installed version is not: no claim either way');
  assert.equal(row(after, 'codex').askable, true, 'its update line names an npm package');
  assert.equal(row(after, 'gemini').askable, true, 'gemini has an npm package source even though the old argv update did not name it');
});

test('off is the one switch: it outranks a credential file and Done, spends nothing on the provider, keeps the sign-in, and on clears one field', async () => {
  // Signed in by its own file AND recorded by Done — the two facts operational is derived
  // from, neither of which can be unset. Off must still win.
  const section = { providers: { codex: { activated_at: '2026-09-05T00:00:00.000Z', off_at: '2026-09-09T10:00:00.000Z' } } };
  const facts = await summary.measureProviders(section, { availability: available(['claude', 'codex']), signedIn: async (id) => id === 'codex', catalog, now: () => '2026-09-09T10:01:00.000Z', version: async (file) => { if (file === '/bin/codex') throw new Error('codex was asked its version while off'); return ''; } });
  assert.deepEqual(facts.signed_in, ['codex'], 'the credential file is still the fact — off is not sign-out');
  assert.deepEqual(facts.operational, [], 'and it is not operational');
  assert.deepEqual(facts.versions, {}, 'nothing was spent on it');
  const shown = await runtime.setupRuntimeAnswer(section, facts, { exists: nobody }, undefined, catalog);
  const codex = row(shown, 'codex');
  assert.equal(codex.off, true); assert.equal(codex.off_at, '2026-09-09T10:00:00.000Z');
  assert.equal(codex.state, 'off'); assert.equal(codex.activated, false);
  assert.equal(codex.signed_in, true, 'the row still says signed in — the sign-in is kept');
  assert.equal(codex.activated_at, '2026-09-05T00:00:00.000Z', 'Done is not forgotten either');
  assert.equal(codex.updatable, false); assert.equal(codex.version, null);
  assert.equal(shown.activated_count, 0, 'an off provider is not one Ronin can launch with');
  // The switch itself: one field, Ronin's own, in the setup section — nothing else.
  const state = await import('../src/machine-state.js');
  assert.deepEqual(await runtime.setProviderOff('codex', true, () => '2026-09-09T11:00:00.000Z'), { provider: 'codex', off: true, off_at: '2026-09-09T11:00:00.000Z' });
  let setup = await state.readSetupSection();
  assert.equal((setup.providers as Record<string, { off_at?: string }>).codex.off_at, '2026-09-09T11:00:00.000Z');
  assert.deepEqual(await runtime.setProviderOff('codex', false), { provider: 'codex', off: false, off_at: null });
  setup = await state.readSetupSection();
  assert.equal('off_at' in ((setup.providers as Record<string, object>).codex ?? {}), false, 'on deletes the one field');
  await assert.rejects(() => runtime.setProviderOff('nope', true), /Unknown provider/);
  const back = await summary.measureProviders({ providers: { codex: {} } }, { availability: available(['claude', 'codex']), signedIn: async (id) => id === 'codex', catalog, version: async () => '' });
  assert.deepEqual(back.operational, ['codex'], 'turned back on, the kept sign-in makes it operational at once — no Authenticate');
});

test('an update runs in a temporary provider_setup session, and the one Close ends install, sign-in, and update', async () => {
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
  live.add('install_codex');
  await ops.open('codex', 'provider_setup_codex');
  const both = await runtime.setupRuntimeAnswer({}, facts, ops, undefined, catalog);
  assert.equal(row(both, 'codex').attachment?.key, 'provider_setup_codex', 'an open sign-in owns the attachment');
  assert.deepEqual(await runtime.closeProviderLogin('codex', ops), { session: 'provider_setup_codex', closed: true });
  assert.deepEqual(closed, ['provider_setup_codex', 'provider_setup_codex_update', 'install_codex'], 'Close ends all three through the one teardown; nothing outlives its window');
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
      restart_needed: false, stage: 'active', switched_on: true,
    },
    routines: [],
  };
  const facts = await measured({}, []);
  const answer = await runtime.setupRuntimeAnswer({}, facts, { exists: nobody }, installed, catalog);
  assert.deepEqual(answer.gbrain, { installed: true, active: true });
  // Installed is the gate: a box cannot hold Ronin Services without a registration, so
  // there is no separate activated fact for a surface to ask about.
  assert.deepEqual(answer.services, { installed: true, switched_on: true, active: true });
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
  await assert.rejects(runtime.completeProviderLogin('claude', ops, undefined, async () => undefined), /No open login or install session/);

  live.add('install_codex');
  await runtime.completeProviderLogin('codex', ops, () => '2026-09-05T02:03:04.000Z', async (provider, at) => { recorded.push([provider, at]); });
  assert.deepEqual(recorded.at(-1), ['codex', '2026-09-05T02:03:04.000Z'], 'Done accepts first-run authentication in the install session');
  assert.equal(live.has('install_codex'), false);

  live.add('provider_setup_gemini');
  assert.deepEqual(await runtime.closeProviderLogin('gemini', ops), { session: 'provider_setup_gemini', closed: true });
  assert.equal(recorded.length, 2, 'Close did not record activation');
});

test('GitHub auth status uses only structured, mechanically verified state', () => {
  const status = (github: unknown) => JSON.stringify({ hosts: { 'github.com': github } });
  assert.deepEqual(runtime.githubAuthFromStatus(status([
    { active: true, host: 'github.com', login: 'octo-cat', state: 'success' },
  ])), { state: 'authenticated', account: 'octo-cat', problem: '' });
  assert.deepEqual(runtime.githubAuthFromStatus(JSON.stringify({ hosts: {} })), {
    state: 'needs_authentication', account: '', problem: '',
  });
  assert.equal(runtime.githubAuthFromStatus(status([
    { active: true, host: 'github.com', login: 'octo-cat', state: 'failure' },
  ])).state, 'unreadable', 'a saved credential that could not be verified is not called signed out');
  assert.equal(runtime.githubAuthFromStatus('not json').state, 'unreadable');
  assert.equal(runtime.githubAuthFromStatus(JSON.stringify({ hosts: [] })).state, 'unreadable');
});

test('GitHub login session is born through the provider setup identity contract', async () => {
  const calls: unknown[] = [];
  await runtime.createGithubSetupSession({
    create: async (...args) => { calls.push(['create', ...args]); },
    tag: async (...args) => { calls.push(['tag', ...args]); },
    identify: async (...args) => { calls.push(['identify', ...args]); },
  }, async (...args) => { calls.push(['command', ...args]); }, async () => '/owner/bin/gh');
  assert.deepEqual(calls, [
    ['create', 'setup_github', os.homedir(), {
      agent: false,
      argv: [],
    }],
    ['tag', 'setup_github', ['provider_setup']],
    ['identify', 'setup_github', {
      sessionType: 'provider_setup', cli: 'gh', provider: 'github', model: '',
    }],
    ['command', 'setup_github', "'/owner/bin/gh' auth login --hostname github.com --git-protocol https"],
  ]);
});

test('GitHub setup publishes one provider-style attachment and opens and closes idempotently', async () => {
  let live = false;
  let opens = 0;
  let closes = 0;
  let installLive = false;
  let status = JSON.stringify({ hosts: {} });
  const ops: runtime.GithubSetupOps = {
    installed: async () => true,
    authStatus: async () => status,
    exists: async () => live,
    installExists: async () => installLive,
    open: async () => { opens += 1; live = true; },
    openInstall: async () => { installLive = true; },
    close: async () => { closes += 1; live = false; },
    closeInstall: async () => { installLive = false; },
    logout: async () => { status = JSON.stringify({ hosts: {} }); },
  };

  assert.deepEqual(await runtime.githubSetupAnswer(ops), {
    installed: true, authenticated: false, account: '', state: 'needs_authentication', problem: '', installing: false, attachment: null,
  });
  assert.deepEqual(await runtime.openGithubLogin(ops), {
    installed: true,
    authenticated: false,
    account: '',
    state: 'needs_authentication',
    problem: '',
    installing: false,
    attachment: { type: 'session', key: 'setup_github', team: 'provider_setup', temporary: true },
  });
  await runtime.openGithubLogin(ops);
  assert.equal(opens, 1, 'a second Connect reuses the visible setup session');

  status = JSON.stringify({ hosts: { 'github.com': [{ active: true, host: 'github.com', login: 'octo-cat', state: 'success' }] } });
  const authenticated = await runtime.githubSetupAnswer(ops);
  assert.deepEqual({ state: authenticated.state, authenticated: authenticated.authenticated, account: authenticated.account }, {
    state: 'authenticated', authenticated: true, account: 'octo-cat',
  });

  assert.deepEqual(await runtime.closeGithubLogin(ops), {
    installed: true, authenticated: true, account: 'octo-cat', state: 'authenticated', problem: '', installing: false, attachment: null,
  });
  await runtime.closeGithubLogin(ops);
  assert.equal(closes, 1, 'Close is harmless once the setup session is gone');

  const unreadable = { ...ops, authStatus: async () => { throw new Error('credential helper failed'); } };
  assert.deepEqual(await runtime.githubSetupAnswer(unreadable), {
    installed: true, authenticated: false, account: '', state: 'unreadable',
    problem: 'Ronin could not ask GitHub CLI to verify authentication.', installing: false, attachment: null,
  });
});

test('GitHub setup does not probe auth when gh is absent and refuses to open', async () => {
  let statusCalls = 0;
  const ops: runtime.GithubSetupOps = {
    installed: async () => false,
    authStatus: async () => { statusCalls += 1; return 'unexpected'; },
    exists: async () => false,
    installExists: async () => false,
    open: async () => undefined,
    openInstall: async () => undefined,
    close: async () => undefined,
    closeInstall: async () => undefined,
    logout: async () => undefined,
  };
  assert.deepEqual(await runtime.githubSetupAnswer(ops), {
    installed: false, authenticated: false, account: '', state: 'missing', problem: '', installing: false, attachment: null,
  });
  assert.equal(statusCalls, 0);
  await assert.rejects(runtime.openGithubLogin(ops), /GitHub CLI is not installed/);
});

test('GitHub install opens one visible provider-style session before authentication', async () => {
  let installLive = false;
  let opens = 0;
  const ops: runtime.GithubSetupOps = {
    installed: async () => false,
    authStatus: async () => '',
    exists: async () => false,
    installExists: async () => installLive,
    open: async () => undefined,
    openInstall: async () => { opens += 1; installLive = true; },
    close: async () => undefined,
    closeInstall: async () => { installLive = false; },
    logout: async () => undefined,
  };
  assert.deepEqual(await runtime.openGithubInstall(ops), {
    installed: false, authenticated: false, account: '', state: 'missing', problem: '', installing: true,
    attachment: { type: 'session', key: 'install_github', team: 'provider_setup', temporary: true },
  });
  await runtime.openGithubInstall(ops);
  assert.equal(opens, 1);
  assert.match(runtime.githubInstallCommand('darwin'), /brew install gh/);
  assert.match(runtime.githubInstallCommand('linux'), /apt-get[\s\S]*dnf[\s\S]*pacman/);
});

test('GitHub logout removes only the detected active account and closes its temporary session', async () => {
  let live = true;
  let status = JSON.stringify({ hosts: { 'github.com': [{ active: true, host: 'github.com', login: 'octo-cat', state: 'success' }] } });
  const loggedOut: string[] = [];
  const ops: runtime.GithubSetupOps = {
    installed: async () => true,
    authStatus: async () => status,
    exists: async () => live,
    installExists: async () => false,
    open: async () => { live = true; },
    openInstall: async () => undefined,
    close: async () => { live = false; },
    closeInstall: async () => undefined,
    logout: async (account) => { loggedOut.push(account); status = JSON.stringify({ hosts: {} }); },
  };
  assert.deepEqual(await runtime.removeGithubAuthentication(ops), {
    installed: true, authenticated: false, account: '', state: 'needs_authentication', problem: '', installing: false, attachment: null,
  });
  assert.deepEqual(loggedOut, ['octo-cat']);
  await assert.rejects(runtime.removeGithubAuthentication(ops), /not authenticated/);
});

test('installed roots are distinct registered repositories with READMEs and first commits', async () => {
  const answer = await runtime.setupRuntimeAnswer({}, await measured({}, []), { exists: async () => false }, undefined, catalog);
  assert.deepEqual(answer.roots.map((root) => root.dir), [
    path.join(process.env.RONIN_USER_ROOT!, 'ronin_lab'),
    path.join(process.env.RONIN_USER_ROOT!, 'project_one'),
  ]);
  const made = await runtime.ensureInstalledRoots();
  assert.deepEqual(made.map((root) => root.dir), [
    path.join(process.env.RONIN_USER_ROOT!, 'ronin_lab'),
    path.join(process.env.RONIN_USER_ROOT!, 'project_one'),
  ]);
  for (const root of made) {
    await access(path.join(root.dir, 'README.md'));
    assert.match(await readFile(path.join(root.dir, 'README.md'), 'utf8'), new RegExp(`# ${root.label}`));
    assert.equal(execFileSync('git', ['-C', root.dir, 'rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim(), '1');
  }
  const registered = await roots.listProjectRoots();
  assert.deepEqual(registered.map((root) => root.name), ['ronin_lab', 'project_one']);
  assert.deepEqual(registered.map((root) => root.title), ['Ronin Lab', 'Project One']);
  const project = made.find((root) => root.name === 'project_one')!;
  assert.match(await readFile(path.join(project.dir, 'RONIN_REPO'), 'utf8'), /mode=reviewed[\s\S]*working=dev[\s\S]*stable=main[\s\S]*desks=managed/);
  assert.doesNotThrow(() => execFileSync('git', ['-C', project.dir, 'show-ref', '--verify', '--quiet', 'refs/heads/dev']));

  const arrangement = await arrangements.arrangementOf('project_one');
  assert.deepEqual(
    { mode: arrangement.mode, working: arrangement.working, stable: arrangement.stable, desks: arrangement.desks },
    { mode: 'reviewed', working: 'dev', stable: 'main', desks: 'managed' },
  );
  const launch = await launchDesks.resolveLaunchDesks({
    session: 'develop_project_proof', team: 'develop_project', project_root: 'project_one', agent: true, control: true,
  });
  assert.equal(launch.assignment?.project_root, 'project_one');
  assert.equal(launch.assignment?.primary, 'project_one');
  assert.equal(launch.assignment?.desks[0]?.line, 'team/develop_project/dev');
  assert.equal(launch.repositories[0]?.repo, 'project_one');
  assert.equal(launch.repositories[0]?.mode, 'managed');
  assert.equal(launch.repositories[0]?.managed?.worktree, launch.assignment?.desks[0]?.worktree);
});

test('concurrent runtime reads do not collide on the roots catalog', async () => {
  const before = await readFile(path.join(process.env.RONIN_CATALOGS_DIR!, 'PROJECT_ROOTS.md'), 'utf8');
  const rounds = await Promise.all([1, 2, 3, 4].map(() => runtime.ensureInstalledRoots()));
  for (const made of rounds) assert.deepEqual(made.map((root) => root.name), ['ronin_lab', 'project_one']);
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
    kinds: ['build', 'research'], providers: [], path_note: '', identity_choice: '', bounty_opt_in: false,
  });
  const section = await state.readSetupSection();
  assert.equal(section.completed_at, '2026-09-06T00:00:00.000Z');
  assert.deepEqual(section.providers, { codex: { activated_at: '2026-09-06T01:00:00.000Z' } });
  assert.deepEqual(section.preferences, { kinds: ['build', 'research'], providers: [], path_note: '', identity_choice: '', bounty_opt_in: false });
  const answer = await runtime.setupRuntimeAnswer(section, await measured(section, []), { exists: nobody }, undefined, catalog);
  assert.deepEqual(answer.preferences, { kinds: ['build', 'research'], providers: [], path_note: '', identity_choice: '', bounty_opt_in: false });
  assert.deepEqual(await runtime.writeSetupPreferences({ providers: ['hermes', 'openai', 'hermes'] }), {
    kinds: ['build', 'research'], providers: ['hermes', 'openai'], path_note: '', identity_choice: '', bounty_opt_in: false,
  });
  assert.deepEqual((await state.readSetupSection()).preferences, {
    kinds: ['build', 'research'], providers: ['hermes', 'openai'], path_note: '', identity_choice: '', bounty_opt_in: false,
  });
  assert.deepEqual(await runtime.writeSetupPreferences({ kinds: ['life'] }), {
    kinds: ['life'], providers: ['hermes', 'openai'], path_note: '', identity_choice: '', bounty_opt_in: false,
  }, 'purpose writes preserve provider opt-ins');
  await assert.rejects(runtime.writeSetupPreferences('build'), /Send Setup preferences/);
  await assert.rejects(runtime.writeSetupPreferences(['build', 'unknown']), /Kinds are build, life, research, and other/);
  assert.deepEqual(await runtime.writeSetupPreferences({ kinds: ['other'], path_note: 'Something new' }), { kinds: ['other'], providers: ['hermes', 'openai'], path_note: 'Something new', identity_choice: '', bounty_opt_in: false });
  assert.deepEqual(await runtime.writeSetupPreferences([]), { kinds: [], providers: ['hermes', 'openai'], path_note: 'Something new', identity_choice: '', bounty_opt_in: false });
  await assert.rejects(runtime.writeSetupPreferences({ providers: ['bad provider'] }), /provider IDs/);
});

test.after(async () => { await rm(box, { recursive: true, force: true }); });

test('provider installation publishes the same resumable attachment before and after the CLI appears', async () => {
  const exists = async (name: string) => name === 'install_codex';
  for (const installed of [[], ['codex']]) {
    const provider = row(await answer({}, installed, [], exists), 'codex');
    assert.equal(provider.install_open, true);
    assert.deepEqual(provider.attachment, { type: 'session', key: 'install_codex', team: 'provider_setup', temporary: true });
  }
});


test('first-run sign-in during installation becomes Ready on measurement without a second login', async () => {
  const signed = row(await answer({}, ['codex'], ['codex']), 'codex');
  assert.equal(signed.activated, true);
  assert.equal(signed.login_open, false);
  assert.equal(signed.attachment, null);
  const unsigned = row(await answer({}, ['codex']), 'codex');
  assert.equal(unsigned.activated, false);
  assert.equal(unsigned.state, 'installed');
});


test('owner sign-in descriptions persist independently of authentication and preserve other provider settings', async () => {
  const { readSetupSection, updateSection } = await import('../src/machine-state.js');
  await updateSection<Record<string, any>>('setup', (setup) => ({ ...setup, providers: { ...setup.providers, codex: { activated_at: 'earlier', off_at: 'off' } } }));
  const saved = await runtime.saveProviderSignIn('codex', { method: 'third_party', label: 'Work OpenRouter' });
  let section = await readSetupSection() as any;
  assert.deepEqual(section.providers.codex.sign_in, saved);
  assert.equal(section.providers.codex.activated_at, 'earlier');
  assert.equal(section.providers.codex.off_at, 'off');
  await runtime.completeProviderLogin('codex', { exists: async () => true, open: async () => {}, close: async () => {} });
  section = await readSetupSection() as any;
  assert.deepEqual(section.providers.codex.sign_in, saved, 'Done preserves the descriptive record');
  assert.deepEqual(row(await answer(section, ['codex']), 'codex').sign_in, saved);
  await assert.rejects(runtime.saveProviderSignIn('codex', { method: 'api_key', label: '' }), /label/);
  await assert.rejects(runtime.saveProviderSignIn('codex', { method: 'guess', label: 'Work' }), /Choose/);
  await runtime.saveProviderSignIn('codex', null);
  section = await readSetupSection() as any;
  assert.equal(section.providers.codex.sign_in, undefined);
  assert.ok(section.providers.codex.activated_at);
  const fresh = await runtime.saveProviderSignIn('claude', { method: 'subscription', label: 'Personal Claude' });
  section = await readSetupSection() as any;
  assert.equal(section.providers.claude.activated_at, undefined, 'a descriptive note never authenticates a provider');
  assert.deepEqual(row(await answer(section, []), 'claude').sign_in, fresh);
});
