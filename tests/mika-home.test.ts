import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, lstat, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureMikaHome, mikaStartHerePath, mikaTipsSource } from '../src/mika-runtime.js';
import { mkdir } from 'node:fs/promises';
import { ensureSteercoTeam, RONIN_HELPER_LOADER, STEERCO_TEAM } from '../src/ronin-helper.js';
import { mikaReadinessFromPane } from '../src/routes/launch.js';

test('Mika home is a private stable store outside project-root selection', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-mika-home-'));
  const dir = path.join(root, 'private-mika');
  process.env.RONIN_MIKA_HOME_DIR = dir;
  assert.equal(await ensureMikaHome(), dir);
  assert.equal((await lstat(dir)).isSymbolicLink(), false);
  assert.equal((await stat(dir)).mode & 0o777, 0o700);
  assert.equal((await stat(mikaStartHerePath())).mode & 0o777, 0o444);
  const starter = await readFile(mikaStartHerePath(), 'utf8');
  assert.match(starter, /What do you want to do with Ronin—build software, get assistance, do research, coordinate a team, or something else\?/);
  assert.match(starter, /one-time Setup task/);
  for (const id of ['bare_metal', 'ronin_team', 'staff_my_codebase', 'develop_new_project', 'personal_assistant', 'health_and_fitness', 'morning_brief', 'agent_editable_doc']) assert.match(starter, new RegExp(`\\b${id}\\b`));
  delete process.env.RONIN_MIKA_HOME_DIR;
});

test('a stale starter from an earlier release is refreshed from the shipped one, never fatal', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-mika-starter-'));
  process.env.RONIN_MIKA_HOME_DIR = path.join(root, 'mika');
  await ensureMikaHome();
  await chmod(mikaStartHerePath(), 0o600);
  await writeFile(mikaStartHerePath(), 'the walkthrough an earlier release shipped\n');
  await ensureMikaHome();
  assert.match(await readFile(mikaStartHerePath(), 'utf8'), /Welcome to Ronin/);
  assert.equal((await stat(mikaStartHerePath())).mode & 0o777, 0o444);
  delete process.env.RONIN_MIKA_HOME_DIR;
});

test('a cold Mika birth compiles one published knowledge index into its reading', async () => {
  const source = await readFile(new URL('../src/routes/launch.ts', import.meta.url), 'utf8');
  assert.match(source, /const knowledge = await compileMikaKnowledgeAt\(mikaHome\)/);
  assert.match(source, /sources\.push\(mikaRulesSource\(\), mikaTips, mikaStartHereSource\(\), mikaKnowledgeIndex\)/);
  assert.match(source, /file === mikaKnowledgeIndex \|\| isShelfTeaching\(file\)/);
  assert.match(source, /const sources = houseSeat === 'mika' \? \[\] : resolvedSources/);
  assert.ok(source.indexOf('const knowledge = await compileMikaKnowledgeAt(mikaHome)') < source.indexOf('const brief = await compileBirthBriefAt('));
});

test('selector readiness awaits the singleton and hides transport failures', async () => {
  const source = await readFile(new URL('../src/routes/launch.ts', import.meta.url), 'utf8');
  assert.match(source, /post\('\/api\/mika\/ready'/);
  assert.match(source, /if \(mikaStarting\) return mikaStarting/);
  assert.match(source, /state: 'ready'/);
  assert.match(source, /state: 'refused'/);
  assert.match(source, /state: 'action_required', action: 'pending_user', code: 'provider_confirmation_required'/);
  assert.match(source, /mikaReadinessFromPane\(await capturePane\(MIKA_SESSION, 0\)\)/);
  assert.doesNotMatch(source, /send-keys|pressEnter|deliverForce/);
  assert.doesNotMatch(source, /No such session: mika/);
  assert.match(source, /RONIN_HELPER_LOADER/);
  assert.match(source, /intent === 'setup_provider_ready'/);
  assert.match(source, /MIKA_PROMPTS\.setup_provider_ready : MIKA_PROMPTS\.help/);
});

test('a ronin_helper start creates its ordinary Team idempotently', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-steerco-team-'));
  process.env.RONIN_TEAM_ROSTERS_DIR = path.join(root, 'teams');
  process.env.RONIN_SESSION_BOOT_DIR = path.join(root, 'session-boot');
  const [first, second] = await Promise.all([ensureSteercoTeam(), ensureSteercoTeam()]);
  assert.equal(RONIN_HELPER_LOADER, 'ronin_helper');
  assert.equal(first.name, STEERCO_TEAM);
  assert.equal(second.name, STEERCO_TEAM);
  assert.equal((await lstat(path.join(root, 'teams', `${STEERCO_TEAM}.md`))).isFile(), true);
  delete process.env.RONIN_TEAM_ROSTERS_DIR;
  delete process.env.RONIN_SESSION_BOOT_DIR;
});

test('Mika joins her team without the wipeboard join notice', async () => {
  const launch = await readFile(new URL('../src/routes/launch.ts', import.meta.url), 'utf8');
  assert.match(launch, /resolved\.session_type === 'cowork_agent' && houseSeat !== 'mika'/);
  assert.match(launch, /await announceTeamChanges\(resolved\.name, \[\], resolved\.tags, \{ notifyAgent: false \}\)/);
});

test('a fresh helper launch creates its full Team roster before the tagged session birth', async () => {
  const launch = await readFile(new URL('../src/routes/launch.ts', import.meta.url), 'utf8');
  const ensure = launch.indexOf('await ensureSteercoTeam()');
  const birth = launch.indexOf('await createSession(resolved.name');
  assert.ok(ensure >= 0 && birth > ensure);
});

test('ended Mika is not auto-resumed and the next readiness request uses a fresh launch', async () => {
  const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  const launch = await readFile(new URL('../src/routes/launch.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(index, /launchControl\.ensureMika\(\)/);
  assert.match(launch, /if \(await sessionExists\(MIKA_SESSION\)\)/);
  assert.match(launch, /post\('\/api\/mika\/ready'/);
});

test('a live trust-pending Mika is observed, never relaunched', async () => {
  const launch = await readFile(new URL('../src/routes/launch.ts', import.meta.url), 'utf8');
  const liveCheck = launch.indexOf("if (await sessionExists(MIKA_SESSION)) return observeLive(true)");
  const launchCall = launch.indexOf("await launch({ body: { prompt } }");
  assert.ok(liveCheck >= 0 && launchCall > liveCheck);
  assert.match(launch, /ready\.state === 'starting' \? 202 : 409/);
});

test('native provider confirmation advances on the same pane from action required to ready', () => {
  assert.equal(mikaReadinessFromPane('Do you trust the contents of this directory?\n› 1. Yes, continue\n  2. No'), 'action_required');
  assert.equal(mikaReadinessFromPane('Welcome\n› Use /skills'), 'ready');
});

test("the owner's tips come from their session-boot shadow when one exists, else the shipped file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-mika-tips-'));
  process.env.RONIN_SESSION_BOOT_DIR = path.join(root, 'shelf');
  assert.match(await mikaTipsSource(), /ronin_session_boot\/house\/mika\/MIKA_TIPS\.md$/);
  await mkdir(path.join(root, 'shelf', 'house', 'mika'), { recursive: true });
  await writeFile(path.join(root, 'shelf', 'house', 'mika', 'MIKA_TIPS.md'), '# tips\n- owner note\n');
  assert.equal(await mikaTipsSource(), path.join(root, 'shelf', 'house', 'mika', 'MIKA_TIPS.md'));
  delete process.env.RONIN_SESSION_BOOT_DIR;
});
