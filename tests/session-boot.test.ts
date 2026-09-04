import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { PACKET_BUDGET, bootFiles, compileBirthReadmeAt, describePacket, isShelfTeaching, packetEndLine, readFirstSentence } from '../src/birth-readme.js';
import { storeDir } from '../src/resources.js';
import { buildBrief, type SpawnForm } from '../src/spawn.js';
import { routineReading } from '../src/resource-adapters.js';
import type { LaunchProfile } from '../src/launch-profile.js';
import { listMacros } from '../src/macros.js';

test('every assisted session is handed the session macro routing guide', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-session-boot-test-'));
  const oldCache = process.env.RONIN_SESSION_BOOT_CACHE_DIR;
  const oldCatalogs = process.env.RONIN_CATALOGS_DIR;
  process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
  process.env.RONIN_CATALOGS_DIR = path.join(temp, 'catalogs');
  try {
    const boot = await bootFiles('', false);
    const macroGuide = boot.find((file) => path.basename(file) === 'SESSION_MACROS.md');
    assert.ok(macroGuide, 'the universal boot shelf should contain SESSION_MACROS.md');
    assert.equal(macroGuide, path.join(temp, 'generated', 'SESSION_MACROS.md'));
    const guide = await readFile(macroGuide, 'utf8');
    // The guide teaches compile-first and carries the live roster; the fork/spawn routing
    // rule is Ronin Base's teaching, asserted on BASE_ABILITIES below, and is not repeated here.
    assert.match(guide, /compile it first — `tejun <name>`/);
    assert.doesNotMatch(guide, /spawn an agent/i);
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

test('the universal shelf carries vocabulary and navigation, not optional abilities or developer test policy', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-session-boot-test-'));
  const oldCache = process.env.RONIN_SESSION_BOOT_CACHE_DIR;
  process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
  try {
    // No root, no role, no task, MCP off — the barest assisted launch still reads the
    // universal set. A blank axis omits only its own level.
    const boot = await bootFiles('', false);
    const names = boot.map((file) => path.basename(file));
    for (const required of ['README.md', 'RONIN_UTILITY.md', 'KOTOBA_GLOSSARY.md']) {
      assert.ok(names.includes(required), `the universal boot shelf should contain ${required}`);
    }
    // The UI string table is not vocabulary: 105 KB of `key: string` inlined here is what
    // pushed every contract past the line a newborn's CLI stops reading at (2026-09-03).
    assert.ok(!names.includes('professional_en.md'), 'the lexicon is not birth reading');
    assert.ok(!names.includes('REQUIRED_ABILITIES.md'));
    assert.ok(!names.some((name) => name.includes('TEST_PROTOCOLS')));
  } finally {
    if (oldCache === undefined) delete process.env.RONIN_SESSION_BOOT_CACHE_DIR;
    else process.env.RONIN_SESSION_BOOT_CACHE_DIR = oldCache;
    await rm(temp, { recursive: true, force: true });
  }
});

test('the real stock shelf compiles to one read: contracts first, glossary last, under the one-read budget', async () => {
  // Every CLI a newborn may be caps a single read (Codex ~10k tokens of shell output;
  // Claude Code 30,000 chars per Bash call, 25,000 tokens per Read) and both models open a
  // file in a window of ~250 lines. The compiled packet is the whole of what a newborn is
  // told to read, so it has to fit — with the rules in the first window and the reference
  // last. This runs on the STOCK shelf as shipped, not a fixture: the fixture test below
  // passed the whole time a 121 KB packet was being born.
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-session-boot-test-'));
  const oldCache = process.env.RONIN_SESSION_BOOT_CACHE_DIR;
  const oldShelf = process.env.RONIN_SESSION_BOOT_DIR;
  process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
  process.env.RONIN_SESSION_BOOT_DIR = path.join(temp, 'shelf');
  try {
    // The largest stock birth: every Routine on, MCP on.
    const boot = await bootFiles('', true, [
      'routine/ronin_base/BASE_ABILITIES.md',
      'routine/ronin_worktrees/WORKTREES.md',
      'routine/ronin_services/SERVICES_ABILITIES.md',
      'routine/ronin_host/HOST_ABILITIES.md',
    ], undefined, 'newborn');
    const target = await compileBirthReadmeAt(path.join(temp, 'session'), boot, 'newborn', isShelfTeaching);
    const text = await readFile(target, 'utf8');
    const bytes = Buffer.byteLength(text, 'utf8');
    const lines = text.split('\n').length;
    assert.ok(bytes <= PACKET_BUDGET.bytes, `the packet is ${bytes} bytes; one read delivers at most ${PACKET_BUDGET.bytes}`);
    assert.ok(lines <= PACKET_BUDGET.lines, `the packet is ${lines} lines; the budget is ${PACKET_BUDGET.lines}`);
    assert.doesNotMatch(text, /^## professional_en/m, 'the UI string table is not in the packet');

    const at = (re: RegExp) => { const i = text.search(re); assert.ok(i >= 0, `${re} is in the packet`); return i; };
    const contracts = at(/^## BASE ABILITIES/m);
    const desk = at(/^## RONIN WORKTREES/m);
    const map = at(/^## Ronin documentation/m);
    const glossary = at(/^## KOTOBA_GLOSSARY/m);
    assert.ok(contracts < map && desk < map, 'the Routine contracts come before the documentation map');
    assert.ok(glossary > at(/^## SESSION_MACROS/m), 'the glossary is last');
    assert.equal(text.lastIndexOf('\n## '), text.lastIndexOf('\n## KOTOBA_GLOSSARY'), 'nothing follows the glossary');
    // The two rules a newborn most often breaks sit inside the first window it opens.
    const firstWindow = text.split('\n').slice(0, 250).join('\n');
    assert.match(firstWindow, /Fork versus spawn/);
    assert.match(firstWindow, /Never `git push`/);
    // The glossary arrived rendered: markers gone, header rewritten.
    assert.doesNotMatch(text, /<!--g:/);
    assert.match(text, /Rendered for/);
    // The packet ends by naming itself, and the brief's sentence says so, with the size.
    assert.equal(text.trimEnd().split('\n').pop(), packetEndLine('newborn'));
    const packet = await describePacket(target, 'newborn');
    assert.equal(packet.bytes, bytes);
    assert.equal(packet.lines, lines);
    assert.equal(packet.over_budget, false);
    assert.ok(packet.sections >= 7, `${packet.sections} sections`);
    const sentence = readFirstSentence(packet);
    assert.match(sentence, new RegExp(`^Read first: ${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} — ${lines} lines, \\d+ KB, one read; it ends with the line "${packetEndLine('newborn')}"\\. Do not act before you have seen that line\\.$`));
  } finally {
    if (oldCache === undefined) delete process.env.RONIN_SESSION_BOOT_CACHE_DIR;
    else process.env.RONIN_SESSION_BOOT_CACHE_DIR = oldCache;
    if (oldShelf === undefined) delete process.env.RONIN_SESSION_BOOT_DIR;
    else process.env.RONIN_SESSION_BOOT_DIR = oldShelf;
    await rm(temp, { recursive: true, force: true });
  }
});

test('Routine reading teaches only the selected capability; test policy stays with repository contributors', async () => {
  const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
  const [base, services, worktrees, machine] = await Promise.all([
    readFile(path.join(repo, 'ronin_session_boot', 'routine', 'ronin_base', 'BASE_ABILITIES.md'), 'utf8'),
    readFile(path.join(repo, 'ronin_session_boot', 'routine', 'ronin_services', 'SERVICES_ABILITIES.md'), 'utf8'),
    readFile(path.join(repo, 'ronin_session_boot', 'routine', 'ronin_worktrees', 'WORKTREES.md'), 'utf8'),
    readFile(path.join(repo, 'ronin_session_boot', 'routine', 'ronin_host', 'HOST_ABILITIES.md'), 'utf8'),
  ]);

  assert.match(base, /tejun forkit/);
  assert.match(base, /fork it[\s\S]*new session[\s\S]*visible-session/i);
  assert.match(base, /spawn it[\s\S]*spawn an agent[\s\S]*internal sub-agent/i);
  assert.match(base, /neither vocabulary/i);
  assert.match(base, /read_tegami/);
  assert.match(base, /tejun-wipeboard/);
  assert.doesNotMatch(base, /tejun-rireki/);
  assert.match(services, /Readable transcripts are not in this beta/);
  assert.match(services, /there is no durable tape and no `tejun-rireki`/);
  assert.match(services, /Read another live session with\s+`tejun-peek`/);
  assert.match(services, /Koshi\*\* is Ronin's assisted administrative behavior/);
  assert.match(services, /Voice\*\* turns the owner's speech into text/);
  assert.match(services, /Hotwords\*\* are the owner's dictation\s+glossary/);
  assert.match(worktrees, /tejun-desk status --assignment/);
  assert.match(worktrees, /tejun-desk hand-in/);
  assert.doesNotMatch(worktrees, /first full repository BYOIN/i);
  assert.match(machine, /tejun-survey/);
  assert.match(machine, /bin\/ronin-store --all/);
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

    const connected = (await bootFiles('', true, ['gbrain_connected/'])).map((f) => path.basename(f));
    assert.ok(connected.includes('GBRAIN_TOOLS.md'), 'MCP on should read the service-signed level');
    assert.ok(!connected.includes('LOOSE.md'), 'a directory that is not a level is not read');

    const disconnected = (await bootFiles('', false, ['gbrain_connected/'])).map((f) => path.basename(f));
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
    await mkdir(path.join(temp, 'shelf', 'routine', 'gbrain'), { recursive: true });
    await writeFile(path.join(temp, 'shelf', 'routine', 'gbrain', 'GBRAIN.md'), '# gbrain');

    const base = (await bootFiles('', false, ['routine/ronin_base/BASE.md'])).map((f) => path.basename(f));
    assert.ok(base.includes('BASE.md'));
    assert.ok(!base.includes('GBRAIN.md'), 'an unselected Routine contributes no reading');

    const none = (await bootFiles('', false, [])).map((f) => path.basename(f));
    assert.ok(!none.includes('BASE.md') && !none.includes('GBRAIN.md'));
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
    const boot = await bootFiles('', false, [], new Set(['forkit']));
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

test('resolved sources compile into one session README: teaching inlined once, reference listed by title and path', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-birth-readme-test-'));
  try {
    const one = path.join(temp, 'ONE.md');
    const two = path.join(temp, 'TWO.md');
    const catalog = path.join(temp, 'CATALOG.md');
    await writeFile(one, '# First guide\n\nalpha\n');
    await writeFile(two, '# Second guide\n\nbeta\n');
    await writeFile(catalog, '# Every noun in the house\n\n<!-- a comment -->\n> a quote first\n\nThe definition of every house noun, one row each. More words follow.\n\n' + 'a row\n'.repeat(1000));
    const target = await compileBirthReadmeAt(path.join(temp, 'session-key'), [one, one, two, catalog], 'new-agent', (file) => file !== catalog);
    assert.equal(path.basename(target), 'README.md');
    const text = await readFile(target, 'utf8');
    assert.match(text, /^# Read first — new-agent/m);
    assert.match(text, /compiled this one document for \*\*new-agent\*\*/);
    // The page opens with its own table of contents, then the reference shelf.
    assert.match(text, /## In this packet\n\n1\. First guide\n2\. Second guide\n/);
    // The card says what the document holds: its first sentence of prose, not its quote or comment.
    assert.match(text, new RegExp(`\\| Every noun in the house \\| The definition of every house noun, one row each\\. \\| \`${catalog.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\` \\|`));
    // A duplicate source is delivered once; a listed reference is never pasted in.
    assert.equal(text.match(/## First guide/g)?.length, 1);
    assert.equal(text.match(/## Second guide/g)?.length, 1);
    assert.doesNotMatch(text, /a row\n/);
    assert.ok(text.split('\n').length < 40, 'a compiled packet of short guides stays a page');
    assert.equal(text.trimEnd().split('\n').pop(), packetEndLine('new-agent'), 'the packet ends by naming itself');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('an over-budget packet is described as such, and the brief asks for it in parts', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-birth-readme-test-'));
  try {
    const big = path.join(temp, 'BIG.md');
    await writeFile(big, '# A shelf file nobody curated\n\n' + 'a line of teaching that goes on and on and on\n'.repeat(1200));
    const target = await compileBirthReadmeAt(path.join(temp, 'session-key'), [big], 'heavy');
    const packet = await describePacket(target, 'heavy');
    assert.ok(packet.bytes > PACKET_BUDGET.bytes && packet.over_budget, `${packet.bytes} bytes is over budget`);
    const sentence = readFirstSentence(packet);
    assert.match(sentence, /over the one-read budget: read it in parts, in order, until you reach the line/);
    assert.match(sentence, /Do not act before you have seen that line\.$/);
    assert.equal((await readFile(target, 'utf8')).trimEnd().split('\n').pop(), packetEndLine('heavy'));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('the stock shelf, the owner shelf and generated fragments are teaching; the owner root shelf is reference', () => {
  const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
  assert.equal(isShelfTeaching(path.join(repo, 'ronin_session_boot', 'all', 'SHELVES.md')), true);
  assert.equal(isShelfTeaching(path.join(storeDir('session_boot'), 'routine', 'ronin_base', 'OWN.md')), true);
  assert.equal(isShelfTeaching(path.join(storeDir('session_boot'), 'root', 'proj', 'KOTOBA.md')), false);
  assert.equal(isShelfTeaching('/somewhere/else/ways/book.md'), false);
});

test('a Routine reads one way or the other: on delivers its page, off delivers the page that names the switch', async () => {
  const routines = [
    { enabled: true, reading: ['routine/a/ON.md'], reading_off: ['routine/a/OFF.md'] },
    { enabled: false, reading: ['routine/b/ON.md'], reading_off: ['routine/b/OFF.md'] },
  ];
  assert.deepEqual(routineReading(routines), ['routine/a/ON.md', 'routine/b/OFF.md']);
  const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
  for (const name of ['ronin_base', 'ronin_host', 'ronin_services', 'ronin_worktrees']) {
    const manifest = await readFile(path.join(repo, 'ronin_catalogs', 'routines', `${name}.md`), 'utf8');
    assert.match(manifest, new RegExp(`\\*\\*reading_off:\\*\\* routine/${name}/OFF\\.md`));
    const off = await readFile(path.join(repo, 'ronin_session_boot', 'routine', name, 'OFF.md'), 'utf8');
    assert.match(off, /working without/);
    assert.match(off, /The switch:/);
  }
  const index = await readFile(path.join(repo, 'docs', 'README.md'), 'utf8');
  assert.match(index, /## Shelves/);
  assert.match(index, /## Coworkspace/);
  // The coworkspace page a newborn is handed: the surfaces, the head, copy and the lock.
  const utility = await readFile(path.join(repo, 'docs', 'RONIN_UTILITY.md'), 'utf8');
  assert.match(utility, /hold \*\*Shift\*\* while dragging \(\*\*Option\*\* on a Mac\)/);
  assert.match(utility, /Campaign discovery workbench[\s\S]*Cowork workbench[\s\S]*Team workbench/);
  assert.match(utility, /🔒 Locked\*\* is the attached live terminal/);
  assert.match(utility, /\*\*メ\*\* \| the drop/);
});
