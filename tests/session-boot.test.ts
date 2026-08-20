import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { bootFiles } from '../src/session-boot.js';
import { buildBrief, type SpawnForm } from '../src/spawn.js';
import type { SessionJobInfo } from '../src/catalog.js';
import { listMacros } from '../src/macros.js';

test('every assisted session is handed the session macro routing guide', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-session-boot-test-'));
  const oldCache = process.env.RONIN_SESSION_BOOT_CACHE_DIR;
  const oldCatalogs = process.env.RONIN_CATALOGS_DIR;
  process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
  process.env.RONIN_CATALOGS_DIR = path.join(temp, 'catalogs');
  try {
    const boot = await bootFiles('', '', false);
    const macroGuide = boot.find((file) => path.basename(file) === 'SESSION_MACROS.md');
    assert.ok(macroGuide, 'the universal boot shelf should contain SESSION_MACROS.md');
    assert.equal(macroGuide, path.join(temp, 'generated', 'SESSION_MACROS.md'));
    const guide = await readFile(macroGuide, 'utf8');
    const active = (await listMacros()).filter((macro) => macro.preview);
    assert.ok(active.length, 'the stock catalog should preview at least one session macro');
    for (const macro of active) assert.match(guide, new RegExp(`\\+${macro.name}:`));

    const kind = {
      name: 'CheckWork',
      label: 'Checker',
      posture: '',
      opening: '{prompt}',
      ack: false,
    } as SessionJobInfo;
    const form: SpawnForm = {
      session_job: kind.name,
      prompt: 'Review the installer.',
      mode: 'assisted',
    };

    const brief = buildBrief(kind, undefined, form, undefined, boot);
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
    // No root, no job, MCP off — the barest assisted launch still reads the universal set.
    const boot = await bootFiles('', '', false);
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
    assert.match(text, /@ronin-control/);
    // And rule the fallback the right way round: peek is the fallback, never the normal route.
    assert.match(text, /tejun-peek/);
  } finally {
    if (oldCache === undefined) delete process.env.RONIN_SESSION_BOOT_CACHE_DIR;
    else process.env.RONIN_SESSION_BOOT_CACHE_DIR = oldCache;
    await rm(temp, { recursive: true, force: true });
  }
});

test('a referenced session is caught up on through the tape, pane peek as fallback', () => {
  const kind = {
    name: 'CheckWork',
    label: 'Checker',
    posture: '',
    opening: '{prompt}',
    ack: false,
  } as SessionJobInfo;
  const form: SpawnForm = {
    session_job: kind.name,
    prompt: 'Review the login work.',
    mode: 'assisted',
    reference: 'login_fix',
  };

  const brief = buildBrief(kind, undefined, form, '/home/x/repo', []);
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

    const connected = (await bootFiles('', '', true)).map((f) => path.basename(f));
    assert.ok(connected.includes('GBRAIN_TOOLS.md'), 'MCP on should read the service-signed level');
    assert.ok(!connected.includes('LOOSE.md'), 'a directory that is not a level is not read');

    const disconnected = (await bootFiles('', '', false)).map((f) => path.basename(f));
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

test('manual sessions remain exactly manual', () => {
  const kind = { name: 'OpenShell' } as SessionJobInfo;
  const form: SpawnForm = {
    session_job: kind.name,
    prompt: '  owner text only  ',
    mode: 'manual',
  };

  assert.equal(buildBrief(kind, undefined, form, undefined, ['/stock/SESSION_MACROS.md']), 'owner text only');
});
