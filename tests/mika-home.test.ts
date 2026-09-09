import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, lstat, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureMikaHome, mikaStartHerePath } from '../src/mika-runtime.js';
import { ensureRoninHelpersTeam, RONIN_HELPER_LOADER, RONIN_HELPERS_TEAM } from '../src/ronin-helper.js';
import { mikaReadinessFromPane } from '../src/routes/launch.js';
import { projectRoutineTools } from '../src/routine-tools.js';

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
  assert.match(starter, /one-time Setup task, not a change to your general Ronin-helper role/);
  for (const id of ['bare_metal', 'ronin_team', 'staff_my_codebase', 'develop_new_project', 'personal_assistant', 'health_and_fitness', 'morning_brief', 'agent_editable_doc']) assert.match(starter, new RegExp(`\\b${id}\\b`));
  delete process.env.RONIN_MIKA_HOME_DIR;
});

test('a corrupt starter fails honestly and is never replaced by route copy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-mika-starter-'));
  process.env.RONIN_MIKA_HOME_DIR = path.join(root, 'mika');
  await ensureMikaHome();
  await chmod(mikaStartHerePath(), 0o600);
  await writeFile(mikaStartHerePath(), 'stale inline fallback\n');
  await assert.rejects(ensureMikaHome(), /starter is corrupt/);
  assert.equal(await readFile(mikaStartHerePath(), 'utf8'), 'stale inline fallback\n');
  delete process.env.RONIN_MIKA_HOME_DIR;
});

test('a cold Mika birth compiles one published knowledge index into its reading', async () => {
  const source = await readFile(new URL('../src/routes/launch.ts', import.meta.url), 'utf8');
  assert.match(source, /const knowledge = await compileMikaKnowledgeAt\(mikaHome\)/);
  assert.match(source, /sources\.unshift\(mikaKnowledgeIndex\)/);
  assert.match(source, /file === mikaKnowledgeIndex \|\| isShelfTeaching\(file\)/);
  assert.match(source, /const sources = houseSeat === 'mika' \? \[\] : resolvedSources/);
  assert.ok(source.indexOf('const knowledge = await compileMikaKnowledgeAt(mikaHome)') < source.indexOf('const readme = await compileBirthReadmeAt('));
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
  assert.match(source, /readMikaStartHere\(\)/);
});

test('ronin_helper ensures the generic reserved Team idempotently', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-helper-team-'));
  process.env.RONIN_TEAM_ROSTERS_DIR = path.join(root, 'teams');
  process.env.RONIN_SESSION_BOOT_DIR = path.join(root, 'session-boot');
  const [first, second] = await Promise.all([ensureRoninHelpersTeam(), ensureRoninHelpersTeam()]);
  assert.equal(RONIN_HELPER_LOADER, 'ronin_helper');
  assert.equal(first.name, RONIN_HELPERS_TEAM);
  assert.equal(second.name, RONIN_HELPERS_TEAM);
  assert.equal((await lstat(path.join(root, 'teams', `${RONIN_HELPERS_TEAM}.md`))).isFile(), true);
  delete process.env.RONIN_TEAM_ROSTERS_DIR;
  delete process.env.RONIN_SESSION_BOOT_DIR;
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

test('Mika birth stays visible through the ordinary session Docs record', async () => {
  const launch = await readFile(new URL('../src/routes/launch.ts', import.meta.url), 'utf8');
  const tegami = await readFile(new URL('../src/tegami-read.ts', import.meta.url), 'utf8');
  assert.match(launch, /rememberSessionKey\(resolved\.name, birthKey\)/);
  assert.match(launch, /resolved\.birth_reading = \[readme\]/);
  assert.match(tegami, /path\.join\(sessionDir\(key\), 'README\.md'\)/);
});

test('fresh Mika projection exposes exactly lookup, wheres_waldo, and show', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-mika-tools-'));
  process.env.RONIN_SESSION_COMMANDS_DIR = path.join(root, 'commands');
  const projected = await projectRoutineTools('mika', [], '', {
    includeTmux: false,
    extraTools: ['lookup', 'wheres_waldo', 'show'],
  });
  assert.deepEqual((await readdir(projected.dir)).sort(), ['lookup', 'show', 'wheres_waldo']);
  assert.deepEqual(projected.delivered.sort(), ['lookup', 'show', 'wheres_waldo']);
  assert.deepEqual(projected.missing, []);
  assert.equal(projected.path, projected.dir, 'no parent shell/code/write PATH is exposed');
  delete process.env.RONIN_SESSION_COMMANDS_DIR;
});

test('the cold launch selects only the Mika allowlist and an exact PATH', async () => {
  const launch = await readFile(new URL('../src/routes/launch.ts', import.meta.url), 'utf8');
  assert.match(launch, /includeTmux: false, extraTools: \['lookup', 'wheres_waldo', 'show'\]/);
  assert.match(launch, /houseSeat === 'mika'\),/);
});
