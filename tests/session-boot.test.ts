import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { PACKET_BUDGET, bootFiles, compileBirthReadmeAt, describePacket, isShelfTeaching, packetEndLine, readFirstSentence } from '../src/birth-readme.js';
import { storeDir } from '../src/resources.js';
import { buildBrief, type SpawnForm } from '../src/spawn.js';
import { contributionReading } from '../src/resource-adapters.js';
import type { LaunchProfile } from '../src/launch-profile.js';
import { CAPABILITIES_READING, renderCapabilitiesOverview, resolveCapabilities } from '../src/capabilities.js';
import { resolveConditionalBehaviours, resolveFloorBehaviours } from '../src/behaviours.js';

/** The fullest overview: every stock capability document selected, every listed tool present. */
const fullOverview = async (): Promise<string> => renderCapabilitiesOverview(await resolveCapabilities(
  { arrangement: 'managed', installations: new Set(), behaviours: new Set(), connected: true, campaign: true, team: true, lead: true, everything: true },
  { present: async () => true },
));

test('every assisted session is handed the tool overview built from its selected capability documents', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-session-boot-test-'));
  const oldCache = process.env.RONIN_SESSION_BOOT_CACHE_DIR;
  const oldCatalogs = process.env.RONIN_CATALOGS_DIR;
  process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
  process.env.RONIN_CATALOGS_DIR = path.join(temp, 'catalogs');
  try {
    const overview = await fullOverview();
    const boot = await bootFiles('', false, [], overview);
    const lesson = boot.find((file) => path.basename(file) === CAPABILITIES_READING);
    assert.ok(lesson, `the boot shelf should carry ${CAPABILITIES_READING}`);
    assert.equal(lesson, path.join(temp, 'generated', CAPABILITIES_READING));
    const text = await readFile(lesson, 'utf8');
    assert.equal(text, overview, 'the fragment is the rendered overview, byte for byte');
    // The lesson is derived from the folder: every stock bundle, its priority tools, its help route.
    for (const label of ['Edges', 'Work Record', 'Agent session', 'Managed worktree', 'Machine settings', 'Cowork Team']) {
      assert.match(text, new RegExp(`^### ${label}$`, 'm'));
    }
    assert.match(text, /`work-record project create`/);
    assert.match(text, /`session_check --help`/);
    assert.doesNotMatch(text, /\btejun(?:-[a-z]+|\b(?!_))|\+\w+:|MACROS/, 'no retired vocabulary reaches a newborn');
    // Fork/spawn belongs to the Agent session capability rather than universal boot noise.
    assert.doesNotMatch(text, /spawn an agent/i);

    const profile = {
      label: 'Checker',
      posture: [],
      opening: '{prompt}',
      ack: false,
      agent: true,
    } as LaunchProfile;
    const form: SpawnForm = {
      prompt: 'Review the installer.',
    };

    const brief = buildBrief(profile, undefined, form, undefined, boot);
    assert.match(brief, new RegExp(`Read first: .*${CAPABILITIES_READING}`));
    // No overview, no fragment: a birth that resolved no capabilities hands over none.
    const bare = await bootFiles('', false, []);
    assert.ok(!bare.some((file) => path.basename(file) === CAPABILITIES_READING));
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
    for (const required of ['RONIN_UTILITY.md', 'KOTOBA_GLOSSARY.md']) {
      assert.ok(names.includes(required), `the universal boot shelf should contain ${required}`);
    }
    assert.ok(!names.includes('README.md'), 'the documentation map is not universal birth reading');
    assert.ok(!names.includes('BASE_ABILITIES.md'), 'Cowork working guidance comes from the Behavior floor');
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

test('every selector phrase has an exact meaning in floor or capability teaching', async () => {
  const selector = await readFile(path.resolve('public/js/terminal-controls.js'), 'utf8');
  const style = await readFile(path.resolve('public/style.css'), 'utf8');
  const teaching = (await Promise.all([
    'ronin_catalogs/behaviours/floor/cowork-agent.md',
    'ronin_catalogs/capabilities/agent_session.md',
    'ronin_catalogs/capabilities/edges.md',
    'ronin_catalogs/capabilities/work-record.md',
    'ronin_catalogs/capabilities/cowork_team.md',
    'ronin_catalogs/capabilities/worktree-desk.md',
    'ronin_catalogs/behaviours/conditional/team-lead.md',
  ].map((file) => readFile(path.resolve(file), 'utf8')))).join('\n');
  const block = selector.match(/const vocabulary = section\('Agent vocabulary'[\s\S]*?for \(const \[term, description\] of \[([\s\S]*?)\]\) \{/);
  assert.ok(block, 'the selector should expose one Agent vocabulary list');
  const terms = [...block[1]!.matchAll(/\['([^']+)',\s*'[^']+'\]/g)].map((match) => match[1]!);
  assert.ok(terms.length, 'the selector should expose Agent vocabulary terms');
  assert.ok(terms.includes('Create new session (Agent)'), 'visible Agent creation has one session-shaped phrase');
  assert.equal(terms[0], 'Create new session (Agent)', 'visible session creation stays at the top');
  assert.ok(!terms.includes('Fork it') && !terms.includes('New Agent'), 'ambiguous Agent creation aliases stay out of the selector');
  assert.match(selector, /term === 'Create new session \(Agent\)'[^\n]+classList\.add\('session-create'\)/);
  assert.match(style, /\.terminal-hint-row\.session-create[^}]+var\(--kaki\)/);
  const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const term of terms) assert.match(teaching, new RegExp(`\\*\\*${escaped(term)}\\*\\*`, 'i'), `${term} needs an exact meaning`);
  assert.match(teaching, /AN OWNER ASKING FOR AN AGENT ALWAYS MEANS:[\s\S]*IT NEVER MEANS SPAWN A CLI-INTERNAL SUB-AGENT/);
  assert.match(teaching, /owner's wording does not\s+provoke it/);
  for (const command of ['session_create', 'edges send', 'edges wipeboard', 'work-record document list', 'work-record update_record', 'team roster write', 'worktree-desk hand-in', 'bin/ronin-promote <team>', 'session_end']) {
    assert.match(teaching, new RegExp(escaped(command)), `${command} needs to be named by its owner`);
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
  const oldWays = process.env.RONIN_WAYS_DIR;
  process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
  process.env.RONIN_SESSION_BOOT_DIR = path.join(temp, 'shelf');
  process.env.RONIN_WAYS_DIR = path.join(temp, 'ways');
  try {
    await mkdir(path.join(temp, 'ways', 'floor'), { recursive: true });
    await writeFile(path.join(temp, 'ways', 'floor', 'user-intro.md'), `# User intro\n\n- **scope:** floor\n\n## About the user\n\n${'a'.repeat(180)}\n${'b'.repeat(180)}\n`);
    // The largest stock birth: every Routine on, MCP on, every capability bundle selected
    // with every listed tool present.
    const applied = [
      ...await resolveFloorBehaviours(),
      ...await resolveConditionalBehaviours({ arrangement: 'managed', team: true, lead: true }),
    ].map((row) => row.file);
    const boot = [...applied, ...await bootFiles('', true, [
      'routine/ronin_services/SERVICES_ABILITIES.md',
      'routine/ronin_host/HOST_ABILITIES.md',
    ], await fullOverview(), 'newborn')];
    const target = await compileBirthReadmeAt(path.join(temp, 'session'), boot, 'newborn', isShelfTeaching);
    const text = await readFile(target, 'utf8');
    const bytes = Buffer.byteLength(text, 'utf8');
    const lines = text.split('\n').length;
    assert.ok(bytes <= PACKET_BUDGET.bytes, `the packet is ${bytes} bytes; one read delivers at most ${PACKET_BUDGET.bytes}`);
    assert.ok(lines <= PACKET_BUDGET.lines, `the packet is ${lines} lines; the budget is ${PACKET_BUDGET.lines}`);
    assert.doesNotMatch(text, /^## professional_en/m, 'the UI string table is not in the packet');

    const at = (re: RegExp) => { const i = text.search(re); assert.ok(i >= 0, `${re} is in the packet`); return i; };
    const contracts = at(/^## Cowork Agent/m);
    const map = at(/^## Ronin usage reference/m);
    const glossary = at(/^## KOTOBA_GLOSSARY/m);
    assert.ok(contracts < map, 'the core contract comes before the documentation map');
    assert.ok(glossary > at(/^## YOUR TOOLS/m), 'the glossary is last');
    assert.ok(at(/^## YOUR TOOLS/m) > map, 'the tool overview follows the maps');
    assert.equal(text.lastIndexOf('\n## '), text.lastIndexOf('\n## KOTOBA_GLOSSARY'), 'nothing follows the glossary');
    // The two rules a newborn most often breaks sit inside the first window it opens.
    const firstWindow = text.split('\n').slice(0, 250).join('\n');
    assert.match(firstWindow, /Read the complete Build Brief before acting/);
    assert.match(firstWindow, /do not reproduce its guarded operation/);
    assert.match(firstWindow, /Read the roster and wipeboard before directing work/);
    assert.match(firstWindow, /ronin_catalogs\/behaviours\/conditional\/worktree-root\.md/);
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
    if (oldWays === undefined) delete process.env.RONIN_WAYS_DIR;
    else process.env.RONIN_WAYS_DIR = oldWays;
    await rm(temp, { recursive: true, force: true });
  }
});

test('floor and capability teaching own ordinary work; system reading stays installation-selected', async () => {
  const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
  const [cowork, sessions, edges, services, worktrees, machine] = await Promise.all([
    readFile(path.join(repo, 'ronin_catalogs', 'behaviours', 'floor', 'cowork-agent.md'), 'utf8'),
    readFile(path.join(repo, 'ronin_catalogs', 'capabilities', 'agent_session.md'), 'utf8'),
    readFile(path.join(repo, 'ronin_catalogs', 'capabilities', 'edges.md'), 'utf8'),
    readFile(path.join(repo, 'ronin_session_boot', 'routine', 'ronin_services', 'SERVICES_ABILITIES.md'), 'utf8'),
    readFile(path.join(repo, 'ronin_catalogs/behaviours', 'conditional', 'worktree-root.md'), 'utf8'),
    readFile(path.join(repo, 'ronin_session_boot', 'routine', 'ronin_host', 'HOST_ABILITIES.md'), 'utf8'),
  ]);

  assert.match(cowork, /Keep the Work Record truthful/);
  assert.match(cowork, /do not reproduce its guarded operation/);
  assert.match(sessions, /Fork[\s\S]*fork it[\s\S]*session_create/i);
  assert.match(edges, /edges wipeboard/);
  assert.match(edges, /edges read/);
  assert.match(services, /Readable transcripts are not in this beta/);
  assert.match(services, /`edges read` falls back/);
  assert.match(services, /Koshi\*\* is Ronin's assisted administrative behavior/);
  assert.match(services, /Voice\*\* turns the owner's speech into text/);
  assert.match(services, /Hotwords\*\* are the owner's dictation\s+glossary/);
  assert.match(worktrees, /worktree-desk status --assignment/);
  assert.match(worktrees, /worktree-desk hand-in/);
  assert.match(worktrees, /session_end/);
  assert.match(worktrees, /CERTIFIED CLEAN/);
  assert.doesNotMatch(worktrees, /first full repository BYOIN/i);
  assert.match(machine, /ronin-host inspect/);
  assert.match(machine, /bin\/ronin-store --all/);
});

test('a referenced session is caught up on through the tape, pane peek as fallback', () => {
  const profile = {
    label: 'Checker',
    posture: [],
    opening: '{prompt}',
    ack: false,
    agent: true,
  } as LaunchProfile;
  const form: SpawnForm = {
    prompt: 'Review the login work.',
    reference: 'login_fix',
  };

  const brief = buildBrief(profile, undefined, form, '/home/x/repo', []);
  assert.match(brief, /edges read login_fix/);
  assert.match(brief, /durable record first.*falls back to the live view/);
  assert.match(brief, /edges control login_fix/);
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

test('only enabled installation contributions add startup reading', async () => {
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

test('startup reading is never stripped when instructions are present', () => {
  const profile = { posture: [] } as unknown as LaunchProfile;
  const form: SpawnForm = {
    prompt: '  owner text only  ',
  };

  const brief = buildBrief(profile, undefined, form, undefined, ['/stock/CAPABILITIES.md']);
  assert.match(brief, /Read first: \/stock\/CAPABILITIES\.md\./);
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
  assert.equal(isShelfTeaching(path.join(storeDir('ways'), 'floor', 'owner-floor.md')), true);
  assert.equal(isShelfTeaching(path.join(storeDir('ways'), 'conditional', 'owner-condition.md')), true);
  assert.equal(isShelfTeaching(path.join(storeDir('ways'), 'selected', 'owner-choice.md')), false);
  assert.equal(isShelfTeaching('/somewhere/else/ways/book.md'), false);
});

test('a system installation reads one way or the other', async () => {
  const routines = [
    { enabled: true, reading: ['routine/a/ON.md'], reading_off: ['routine/a/OFF.md'] },
    { enabled: false, reading: ['routine/b/ON.md'], reading_off: ['routine/b/OFF.md'] },
  ];
  assert.deepEqual(contributionReading(routines), ['routine/a/ON.md', 'routine/b/OFF.md']);
  const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
  for (const name of ['ronin_services']) {
    const manifest = await readFile(path.join(repo, 'ronin_catalogs', 'installations', `${name}.md`), 'utf8');
    assert.match(manifest, new RegExp(`\\*\\*reading_off:\\*\\* routine/${name}/OFF\\.md`));
    const off = await readFile(path.join(repo, 'ronin_session_boot', 'routine', name, 'OFF.md'), 'utf8');
    assert.match(off, /working without/);
    assert.match(off, /The switch:/);
  }
  const index = await readFile(path.join(repo, 'docs', 'README.md'), 'utf8');
  assert.match(index, /## Evaluate, install, and use Ronin/);
  assert.match(index, /## Understand how Ronin is constructed/);
  assert.match(index, /## Ideas and work in progress: Ronin Lab/);
  // The newborn's reference routes to the usage authorities, rather than copying UI
  // controls that can drift or making the owner read construction contracts first.
  const utility = await readFile(path.join(repo, 'docs', 'architecture', 'RONIN_UTILITY.md'), 'utf8');
  for (const guide of ['workbench', 'tile', 'terminal-controls', 'archived-sessions']) {
    assert.ok(utility.includes(`../using-ronin/${guide}.md`), `usage route: ${guide}`);
  }
  assert.doesNotMatch(utility, /Control dial|owner only/);
});
