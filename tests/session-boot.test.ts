import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { bootFiles } from '../src/session-boot.js';
import { buildBrief, type SpawnForm } from '../src/spawn.js';
import type { LaunchProfile } from '../src/launch-profile.js';
import { listMacros } from '../src/macros.js';

test('every assisted session is handed the session macro routing guide', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-session-boot-test-'));
  const oldCache = process.env.RONIN_SESSION_BOOT_CACHE_DIR;
  const oldCatalogs = process.env.RONIN_CATALOGS_DIR;
  process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
  process.env.RONIN_CATALOGS_DIR = path.join(temp, 'catalogs');
  try {
    const boot = await bootFiles('', '', '', false);
    const macroGuide = boot.find((file) => path.basename(file) === 'SESSION_MACROS.md');
    assert.ok(macroGuide, 'the universal boot shelf should contain SESSION_MACROS.md');
    assert.equal(macroGuide, path.join(temp, 'generated', 'SESSION_MACROS.md'));
    const guide = await readFile(macroGuide, 'utf8');
    assert.match(guide, /fork it[\s\S]*new session[\s\S]*visible tmux session/i);
    assert.match(guide, /spawn it[\s\S]*spawn an agent[\s\S]*native[\s\S]*sub-agent/i);
    assert.match(guide, /neither vocabulary[\s\S]*without asking the owner/i);
    const active = (await listMacros()).filter((macro) => macro.preview);
    assert.ok(active.length, 'the stock catalog should preview at least one session macro');
    for (const macro of active) assert.match(guide, new RegExp(`\\+${macro.name}:`));

    const profile = {
      session_role: 'CheckWork',
      label: 'Checker',
      posture: [],
      opening: '{prompt}',
      ack: false,
      agent: true,
    } as LaunchProfile;
    const form: SpawnForm = {
      session_role: profile.session_role,
      prompt: 'Review the installer.',
    };

    const brief = buildBrief(profile, undefined, form, undefined, boot);
    assert.match(brief, /Read first: .*SESSION_MACROS\.md/);
  } finally {
    if (oldCache === undefined) delete process.env.RONIN_SESSION_BOOT_CACHE_DIR;
    else process.env.RONIN_SESSION_BOOT_CACHE_DIR = oldCache;
    if (oldCatalogs === undefined) delete process.env.RONIN_CATALOGS_DIR;
    else process.env.RONIN_CATALOGS_DIR = oldCatalogs;
    await rm(temp, { recursive: true, force: true });
  }
});

test('every assisted session is handed the required abilities', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-session-boot-test-'));
  const oldCache = process.env.RONIN_SESSION_BOOT_CACHE_DIR;
  process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
  try {
    // No root, no role, no task, MCP off — the barest assisted launch still reads the
    // universal set. A blank axis omits only its own level.
    const boot = await bootFiles('', '', '', false);
    const names = boot.map((file) => path.basename(file));
    for (const required of ['SHELVES.md', 'KOTOBA_GLOSSARY.md', 'REQUIRED_ABILITIES.md']) {
      assert.ok(names.includes(required), `the universal boot shelf should contain ${required}`);
    }

    const card = boot.find((file) => path.basename(file) === 'REQUIRED_ABILITIES.md')!;
    const text = await readFile(card, 'utf8');
    // The card must name the guarded routes — these are the words a session cannot search for.
    assert.match(text, /tejun-rireki/);
    assert.match(text, /tejun-send/);
    assert.match(text, /\+forkit/);
    assert.match(text, /fork it[\s\S]*new session[\s\S]*visible Ronin tmux session/i);
    assert.match(text, /spawn it[\s\S]*spawn an agent[\s\S]*internal sub-agent/i);
    assert.match(text, /neither vocabulary[\s\S]*no extra owner confirmation/i);
    assert.match(text, /@ronin-control/);
    // And rule the fallback the right way round: peek is the fallback, never the normal route.
    assert.match(text, /tejun-peek/);
  } finally {
    if (oldCache === undefined) delete process.env.RONIN_SESSION_BOOT_CACHE_DIR;
    else process.env.RONIN_SESSION_BOOT_CACHE_DIR = oldCache;
    await rm(temp, { recursive: true, force: true });
  }
});

test('accepted Routine reading drafts keep universal compatibility teaching', async () => {
  const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
  const [required, protocols, base, services, control, machine, machineProtocols] = await Promise.all([
    readFile(path.join(repo, 'ronin_session_boot', 'all', 'REQUIRED_ABILITIES.md'), 'utf8'),
    readFile(path.join(repo, 'ronin_session_boot', 'all', 'TEST_PROTOCOLS.md'), 'utf8'),
    readFile(path.join(repo, 'ronin_session_boot', 'routine', 'ronin_base', 'BASE_ABILITIES.md'), 'utf8'),
    readFile(path.join(repo, 'ronin_session_boot', 'routine', 'ronin_services', 'SERVICES_ABILITIES.md'), 'utf8'),
    readFile(path.join(repo, 'ronin_session_boot', 'routine', 'ronin_control', 'CONTROL_TEST_PROTOCOLS.md'), 'utf8'),
    readFile(path.join(repo, 'ronin_session_boot', 'routine', 'machine', 'MACHINE_ABILITIES.md'), 'utf8'),
    readFile(path.join(repo, 'ronin_session_boot', 'routine', 'machine', 'MACHINE_TEST_PROTOCOLS.md'), 'utf8'),
  ]);

  assert.match(base, /tejun forkit/);
  assert.match(base, /read_tegami/);
  assert.match(base, /tejun-wipeboard/);
  assert.doesNotMatch(base, /tejun-rireki/);
  assert.match(services, /Ronin Services is one additional Routine/);
  assert.match(services, /tejun-rireki <session> since/);
  assert.match(services, /Koshi is Ronin's assisted administrative behavior/);
  assert.match(services, /Voice turns the owner's speech into text/);
  assert.match(services, /Hotwords are the owner's dictation glossary/);
  assert.match(services, /Selection is not installation/);
  assert.match(services, /none is a separate Routine or switch/i);
  assert.match(control, /team promotion/i);
  assert.match(control, /one full repository BYOIN/i);
  assert.match(machine, /tejun-survey/);
  assert.match(machine, /bin\/ronin-store --all/);
  assert.match(machineProtocols, /installed third-party-box maintenance/);

  // Compatibility stays universal until effective-Routine startup reading is delivered.
  assert.match(required, /tejun forkit/);
  assert.match(required, /tejun-wipeboard/);
  assert.match(required, /tejun-survey/);
  assert.match(protocols, /team promotion/i);
  assert.match(protocols, /one full[\s\S]*repository BYOIN/i);
  assert.match(protocols, /Installed-box maintenance/);
  assert.match(protocols, /user-store customization/);
});

test('a referenced session is caught up on through the tape, pane peek as fallback', () => {
  const profile = {
    session_role: 'CheckWork',
    label: 'Checker',
    posture: [],
    opening: '{prompt}',
    ack: false,
    agent: true,
  } as LaunchProfile;
  const form: SpawnForm = {
    session_role: profile.session_role,
    prompt: 'Review the login work.',
    reference: 'login_fix',
  };

  const brief = buildBrief(profile, undefined, form, '/home/x/repo', []);
  assert.match(brief, /tejun-rireki login_fix since/);
  assert.match(brief, /tejun-peek login_fix.*if it has no tape/);
  assert.match(brief, /control-check before touching it/);
  // The tape comes first: the fallback is parenthetical, never the lead.
  assert.ok(brief.indexOf('tejun-rireki') < brief.indexOf('tejun-peek'));
});

test('a service-signed *_connected level rides the MCP toggle', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-session-boot-test-'));
  const oldShelf = process.env.RONIN_SESSION_BOOT_DIR;
  const oldCache = process.env.RONIN_SESSION_BOOT_CACHE_DIR;
  process.env.RONIN_SESSION_BOOT_DIR = path.join(temp, 'shelf');
  process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
  try {
    // A service made and seeded its own signed level; only *_connected names are levels.
    await mkdir(path.join(temp, 'shelf', 'gbrain_connected'), { recursive: true });
    await writeFile(path.join(temp, 'shelf', 'gbrain_connected', 'GBRAIN_TOOLS.md'), '# tools');
    await mkdir(path.join(temp, 'shelf', 'notes'), { recursive: true });
    await writeFile(path.join(temp, 'shelf', 'notes', 'LOOSE.md'), '# not a level');

    const connected = (await bootFiles('', '', '', true)).map((f) => path.basename(f));
    assert.ok(connected.includes('GBRAIN_TOOLS.md'), 'MCP on should read the service-signed level');
    assert.ok(!connected.includes('LOOSE.md'), 'a directory that is not a level is not read');

    const disconnected = (await bootFiles('', '', '', false)).map((f) => path.basename(f));
    assert.ok(
      !disconnected.includes('GBRAIN_TOOLS.md'),
      'MCP off must read no connected level — tools and know-how ride the one choice',
    );
  } finally {
    if (oldShelf === undefined) delete process.env.RONIN_SESSION_BOOT_DIR;
    else process.env.RONIN_SESSION_BOOT_DIR = oldShelf;
    if (oldCache === undefined) delete process.env.RONIN_SESSION_BOOT_CACHE_DIR;
    else process.env.RONIN_SESSION_BOOT_CACHE_DIR = oldCache;
    await rm(temp, { recursive: true, force: true });
  }
});

test('only enabled Routine levels contribute startup reading', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-session-boot-test-'));
  const oldShelf = process.env.RONIN_SESSION_BOOT_DIR;
  const oldCache = process.env.RONIN_SESSION_BOOT_CACHE_DIR;
  process.env.RONIN_SESSION_BOOT_DIR = path.join(temp, 'shelf');
  process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
  try {
    await mkdir(path.join(temp, 'shelf', 'routine', 'ronin_base'), { recursive: true });
    await writeFile(path.join(temp, 'shelf', 'routine', 'ronin_base', 'BASE.md'), '# base');
    await mkdir(path.join(temp, 'shelf', 'routine', 'machine'), { recursive: true });
    await writeFile(path.join(temp, 'shelf', 'routine', 'machine', 'MACHINE.md'), '# machine');

    const base = (await bootFiles('', '', '', false, false, ['ronin_base'])).map((f) => path.basename(f));
    assert.ok(base.includes('BASE.md'));
    assert.ok(!base.includes('MACHINE.md'), 'an unselected Routine contributes no reading');

    const none = (await bootFiles('', '', '', false, false, [])).map((f) => path.basename(f));
    assert.ok(!none.includes('BASE.md') && !none.includes('MACHINE.md'));
  } finally {
    if (oldShelf === undefined) delete process.env.RONIN_SESSION_BOOT_DIR;
    else process.env.RONIN_SESSION_BOOT_DIR = oldShelf;
    if (oldCache === undefined) delete process.env.RONIN_SESSION_BOOT_CACHE_DIR;
    else process.env.RONIN_SESSION_BOOT_CACHE_DIR = oldCache;
    await rm(temp, { recursive: true, force: true });
  }
});

test('generated macro reading contains only the effective Routine macros', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-session-boot-test-'));
  const oldCache = process.env.RONIN_SESSION_BOOT_CACHE_DIR;
  process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
  try {
    const boot = await bootFiles('', '', '', false, false, [], new Set(['forkit']));
    const guide = await readFile(boot.find((file) => path.basename(file) === 'SESSION_MACROS.md')!, 'utf8');
    assert.match(guide, /\+forkit:/);
    assert.doesNotMatch(guide, /\+cutcode:/, 'a Control macro is not taught by Base alone');
  } finally {
    if (oldCache === undefined) delete process.env.RONIN_SESSION_BOOT_CACHE_DIR;
    else process.env.RONIN_SESSION_BOOT_CACHE_DIR = oldCache;
    await rm(temp, { recursive: true, force: true });
  }
});

test('startup reading is never stripped when instructions are present', () => {
  const profile = { session_role: 'OpenShell', posture: [] } as unknown as LaunchProfile;
  const form: SpawnForm = {
    session_role: profile.session_role,
    prompt: '  owner text only  ',
  };

  const brief = buildBrief(profile, undefined, form, undefined, ['/stock/SESSION_MACROS.md']);
  assert.match(brief, /Read first: \/stock\/SESSION_MACROS\.md\./);
});

test('a blank axis omits only its own level, and role reading comes before team_role reading', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-session-boot-test-'));
  const oldShelf = process.env.RONIN_SESSION_BOOT_DIR;
  const oldCache = process.env.RONIN_SESSION_BOOT_CACHE_DIR;
  process.env.RONIN_SESSION_BOOT_DIR = path.join(temp, 'shelf');
  process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
  try {
    await mkdir(path.join(temp, 'shelf', 'role', 'CutCode'), { recursive: true });
    await writeFile(path.join(temp, 'shelf', 'role', 'CutCode', 'ROLE_BOOK.md'), '# what');
    await mkdir(path.join(temp, 'shelf', 'team_role', 'development'), { recursive: true });
    await writeFile(path.join(temp, 'shelf', 'team_role', 'development', 'TEAM_BOOK.md'), '# whose team');

    const both = (await bootFiles('', 'CutCode', 'development', false)).map((f) => path.basename(f));
    assert.ok(both.includes('ROLE_BOOK.md'), 'a named session_role reads its own level');
    assert.ok(both.includes('TEAM_BOOK.md'), 'a team_role launch reads the team_role level');
    // WHAT before WHOSE TEAM — the brief states the work, then the team context.
    assert.ok(both.indexOf('ROLE_BOOK.md') < both.indexOf('TEAM_BOOK.md'));

    const roleOnly = (await bootFiles('', 'CutCode', '', false)).map((f) => path.basename(f));
    assert.ok(roleOnly.includes('ROLE_BOOK.md'));
    assert.ok(!roleOnly.includes('TEAM_BOOK.md'), 'a ronin launch reads no team_role level');

    const teamOnly = (await bootFiles('', '', 'development', false)).map((f) => path.basename(f));
    assert.ok(teamOnly.includes('TEAM_BOOK.md'));
    assert.ok(!teamOnly.includes('ROLE_BOOK.md'), 'a blank session_role reads no role level');

    const neither = (await bootFiles('', '', '', false)).map((f) => path.basename(f));
    assert.ok(!neither.includes('ROLE_BOOK.md') && !neither.includes('TEAM_BOOK.md'));
    // The universal level is untouched by either axis being blank.
    assert.ok(neither.includes('SESSION_MACROS.md'));
  } finally {
    if (oldShelf === undefined) delete process.env.RONIN_SESSION_BOOT_DIR;
    else process.env.RONIN_SESSION_BOOT_DIR = oldShelf;
    if (oldCache === undefined) delete process.env.RONIN_SESSION_BOOT_CACHE_DIR;
    else process.env.RONIN_SESSION_BOOT_CACHE_DIR = oldCache;
    await rm(temp, { recursive: true, force: true });
  }
});
