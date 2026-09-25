/**
 * ONE PROVIDER CATALOG, ONE MEASURED SUMMARY, ONE JOIN — the shape behind every picker,
 * every launch and every provider fact on screen (owner's rulings, 2026-09-08 and 2026-09-25).
 *
 * The catalog joins the vendor id a launch names to the CLI that serves it, in data, and
 * carries descriptive metadata per model id; the owner's copy in the catalogs store wins
 * whole. The summary is what the machine measured, dated, hung on the Campaign record;
 * its model lists come from each CLI's own inventory, read on Refresh all through the
 * reader the registry names, never guessed. The join gives every row two names: the id a
 * launch uses and the CLI's own display name, version included.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const box = await mkdtemp(path.join(os.tmpdir(), 'ronin-model-providers-'));
process.env.RONIN_USER_ROOT = path.join(box, 'ronin');
process.env.RONIN_CATALOGS_DIR = path.join(box, 'ronin', 'catalogs');
process.env.RONIN_CONFIG_DIR = path.join(box, 'ronin', 'config');

const catalog = await import('../src/model-providers.js');
const summary = await import('../src/provider-summary.js');
const { AGENTS } = await import('../src/agents.js');
const campaigns = await import('../src/campaigns.js');
const fixtures = new URL('./fixtures/model-lists/', import.meta.url);
const agent = (id: string) => AGENTS.find((candidate) => candidate.id === id)!;

const listed = (rows: Array<[string, string] | string>) => ({
  read_at: '2026-09-18T00:00:00Z', by: 'test',
  rows: rows.map((row) => (typeof row === 'string' ? { id: row, name: row } : { id: row[0], name: row[1] })),
});
const measured = (over: Partial<import('../src/model-providers.js').ProviderSummary> = {}): import('../src/model-providers.js').ProviderSummary => ({
  measured_at: '2026-09-18T00:00:00Z', refreshed_at: '', installed: [], signed_in: [], operational: [], off: [], activated_count: 0,
  paths: {}, versions: {}, models: {}, latest: {}, ...over,
});

test('the stock catalog names every provider with its CLI and dated, tiered metadata per model id — and nothing that launches', async () => {
  const read = await catalog.readProviderCatalog();
  assert.equal(read.origin, 'stock');
  assert.match(read.updated, /^\d{4}-\d{2}-\d{2}$/, 'the stock catalog says when it was last read from the public record');
  const providers = read.providers;
  const available = providers.filter((entry) => entry.models.length > 0);
  assert.deepEqual(available.map((entry) => entry.cli), ['claude', 'codex', 'gemini', 'grok', 'hermes'], 'one launchable section per CLI the registry knows');
  for (const entry of available) {
    assert.ok(AGENTS.some((agent) => agent.id === entry.cli), `${entry.label}: cli ${entry.cli} is in src/agents.ts`);
    for (const row of entry.models) {
      assert.deepEqual(Object.keys(row).sort(), ['cost', 'good_at', 'model', 'not_good_at', 'tier'], `${row.model}: metadata only — no display id, no default, no command`);
      assert.ok((catalog.TIERS as readonly string[]).includes(row.tier), `${row.model}: tier ${row.tier}`);
      assert.match(row.cost, /\(\d{4}-\d{2}\)/, `${row.model}: the cost reading is dated`);
      assert.ok(row.good_at && row.not_good_at, `${row.model}: good at and not good at`);
    }
  }
  assert.deepEqual(providers.find((entry) => entry.provider === 'openrouter'), {
    provider: 'openrouter', cli: 'openrouter', label: 'OpenRouter', origin: 'stock', shadowed: false,
    maturity: 'comingSoon', models: [],
  }, 'a coming-soon provider is catalog data but has no rows');
  const anthropic = providers.find((entry) => entry.provider === 'anthropic')!;
  assert.equal(anthropic.label, 'Anthropic');
  assert.deepEqual(anthropic.models.map((row) => row.model), ['claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-5', 'claude-haiku-4-5-20251001', 'claude-opus-5']);
  assert.equal(anthropic.models.find((row) => row.model === 'claude-haiku-4-5-20251001')?.tier, 'light');
});

test('the join: Native first, then every model the CLI listed in its order with the CLI\'s own name, catalog metadata where the id matches, launchable providers first', async () => {
  const rows = await catalog.providerRows(measured({
    installed: ['claude', 'codex', 'gemini'], signed_in: ['claude', 'codex'], operational: ['codex', 'claude'], off: ['gemini'], activated_count: 2,
    models: {
      claude: listed([['claude-opus-5-5', 'Opus 5.5'], ['claude-fable-5-1', 'Fable 5.1'], ['claude-opus-4-6', 'Opus 4.6'], ['bad id;rm', 'Nope']]),
      codex: listed([['gpt-5.6-sol', 'GPT-5.6-Sol']]),
    },
  }));
  assert.deepEqual(rows.map((entry) => [entry.provider, entry.operational, entry.off]), [
    ['anthropic', true, false], ['openai', true, false], ['google', false, true], ['xai', false, false], ['nous', false, false], ['openrouter', false, false],
  ], 'launchable providers first, catalog order within');
  const anthropic = rows[0];
  assert.equal(anthropic.cli_label, 'Claude Code');
  assert.deepEqual(anthropic.launch_modes, ['configured', 'live_dangerously']);
  assert.equal(anthropic.native, 'claude');
  assert.equal(anthropic.nativeDangerousCmd, 'claude --dangerously-skip-permissions');
  assert.deepEqual(anthropic.models.map((row) => [row.model, row.name, row.cmd, row.tier, row.default, row.selectable]), [
    ['native', 'Native', 'claude', '', true, true],
    ['claude-opus-5-5', 'Opus 5.5', 'claude --model claude-opus-5-5', 'frontier', false, true],
    ['claude-fable-5-1', 'Fable 5.1', 'claude --model claude-fable-5-1', 'frontier', false, true],
    ['claude-opus-4-6', 'Opus 4.6', 'claude --model claude-opus-4-6', '', false, true],
  ], 'the CLI\'s order and names; the catalog adds a tier where it has the id; an unlisted catalog row never appears; an unsafe id is not made into a command');
  assert.equal(anthropic.models[1].cost, '$4 in · $20 out per M tokens (2026-09)');
  assert.equal(anthropic.models[1].dangerousCmd, 'claude --model claude-opus-5-5 --dangerously-skip-permissions');
  assert.equal(anthropic.models[3].cost, '', 'no catalog row: no cost, no prose, still launchable');
  assert.equal(anthropic.models[0].provider_label, 'Anthropic');
  assert.deepEqual(rows[1].models.map((row) => row.name), ['Native', 'GPT-5.6-Sol']);
  const google = rows[2];
  assert.deepEqual(google.models.map((row) => [row.model, row.operational, row.off, row.selectable]), [['native', false, true, false]], 'turned off: Native only, greyed with that word');
  assert.deepEqual(rows[5].models, [], 'a coming-soon provider has no rows, not even Native');
  const flat = await catalog.listSessionLaunchSpecs(measured({ operational: ['claude'], models: { claude: listed(['claude-sonnet-5']) } }));
  assert.deepEqual(flat.filter((row) => row.provider === 'anthropic').map((row) => row.cmd), ['claude', 'claude --model claude-sonnet-5']);
  assert.equal(catalog.providerDefault(flat, 'anthropic')?.model, 'native', 'a provider with no preference delegates the model to its CLI');
  assert.equal(catalog.providerDefault(flat, 'nobody'), undefined);
  const nothing = await catalog.providerRows(null);
  assert.ok(nothing.every((entry) => !entry.operational && entry.models.length <= 1), 'unmeasured: Native alone, nothing selectable');
  assert.ok(nothing.every((entry) => entry.models.every((row) => !row.selectable)));
});

test('the client answer is the catalog\'s own facts, the record\'s dates, and the joined rows', async () => {
  const answer = await catalog.providerCatalogAnswer(measured({ refreshed_at: '2026-09-25T10:00:00Z', operational: ['claude'], models: { claude: listed([['claude-opus-5-5', 'Opus 5.5']]) } }));
  assert.deepEqual(Object.keys(answer).sort(), ['measured_at', 'origin', 'path', 'providers', 'refreshed_at', 'stock_updated', 'updated', 'withdrawn']);
  assert.equal(answer.refreshed_at, '2026-09-25T10:00:00Z');
  assert.equal(answer.providers[0].models[1].name, 'Opus 5.5');
  const never = await catalog.providerCatalogAnswer(null);
  assert.equal(never.refreshed_at, '');
  assert.equal(never.measured_at, '');
});

test('a provider section parses model facts without owning CLI command syntax or availability', () => {
  const parsed = catalog.parseProviderCatalog([
    '# a catalog', '', '### Example Vendor', '',
    '- **provider:** `example`', '- **cli:** `claude`', '',
    '| model | tier | cost | good at | not good at |', '|---|---|---|---|---|',
    '| `b` | light | $1 (2026-09) | speed | depth |',
    '| `a` | frontier | $9 (2026-09) | depth | speed |', '',
    '### Wide Vendor', '', '- **provider:** `wide`', '- **cli:** `codex`', '',
    '| model | tier | default | display id | cost | good at | not good at | launch |', '|---|---|---|---|---|---|---|---|',
    '| `w` | standard | yes | W | $3 (2026-09) | x | y | `codex --model w` |', '',
    '### No Cli', '', '- **provider:** `orphan`', '',
    '| model | launch |', '|---|---|', '| `z` | `z` |',
  ].join('\n'));
  assert.deepEqual(parsed.map((entry) => entry.provider), ['example', 'wide'], 'a section without a cli is no provider');
  const example = parsed[0]!;
  assert.deepEqual(example.models.map((row) => row.model), ['b', 'a'], 'the table sets model order');
  assert.equal(example.models[0]?.tier, 'light');
  assert.deepEqual(parsed[1]!.models[0], { model: 'w', tier: 'standard', cost: '$3 (2026-09)', good_at: 'x', not_good_at: 'y' }, 'columns of earlier catalogs are ignored, never read');
});

test('the updated day is read from the header only, in YYYY-MM-DD, never from a provider section', () => {
  assert.equal(catalog.catalogUpdated('# c\n\n- **updated:** 2026-09-08\n\n### V\n- **provider:** `v`\n- **cli:** `claude`\n'), '2026-09-08');
  assert.equal(catalog.catalogUpdated('# c\n\n### V\n- **updated:** 2026-09-08\n- **provider:** `v`\n'), '', 'a date inside a section is not the catalog\'s');
  assert.equal(catalog.catalogUpdated('# c\n\n- **updated:** September 2026\n'), '', 'only a full day counts');
  assert.equal(catalog.catalogUpdated(''), '');
});

test("the owner's copy is an overlay: a section of a shipped id replaces it in place, a new id appends, a tombstone withdraws, and every entry says its layer", async () => {
  await mkdir(process.env.RONIN_CATALOGS_DIR!, { recursive: true });
  const mine = path.join(process.env.RONIN_CATALOGS_DIR!, catalog.CATALOG_FILE);
  const table = '| model | tier | cost | good at | not good at |\n|---|---|---|---|---|';
  await writeFile(mine, [
    '# mine', '',
    '### Anthropic (mine)', '', '- **provider:** `anthropic`', '- **cli:** `claude`', '', table,
    '| `claude-fable-5-1` | frontier | $10 (2026-09) | hard | cheap |', '',
    '### xAI', '', '- **provider:** `xai`', '- **hidden:** yes', '',
    '### Google', '', '- **provider:** `google`', '- **cli:** `gemini`', '', table,
    '| `gemini-3.1-pro` | frontier | $2 (2026-09) | x | y |',
    '| `gemini-3.8-flash` | standard | $0.75 (2026-09) | x | y |', '',
    '### Example', '', '- **provider:** `example`', '- **cli:** `codex`', '', table,
    '| `ex-1` | standard | $1 (2026-09) | a | b |',
  ].join('\n'));
  try {
    const read = await catalog.readProviderCatalog();
    assert.equal(read.origin, 'user');
    assert.equal(read.path, mine);
    assert.equal(read.updated, '', 'the copy has no updated line and says so');
    assert.match(read.stock_updated, /^\d{4}-\d{2}-\d{2}$/, 'the shipped date is carried beside it, never borrowed for it');
    assert.deepEqual(read.providers.map((p) => [p.provider, p.origin, p.shadowed]), [
      ['anthropic', 'user', true], ['openai', 'stock', false], ['google', 'user', true], ['nous', 'stock', false], ['openrouter', 'stock', false], ['example', 'user', false],
    ], 'anthropic and google replace in place; xai is hidden; example appends');
    assert.equal(read.providers[0].label, 'Anthropic (mine)', 'the heading is the copy\'s, the key was the id');
    assert.deepEqual(read.providers[0].models.map((m) => m.model), ['claude-fable-5-1'], 'the section replaced whole — the shipped rows do not merge in');
    assert.ok(read.providers[1].models.length >= 3, 'the shipped OpenAI rows are exactly as shipped');
    assert.deepEqual(read.withdrawn, [{ provider: 'xai', label: 'xAI' }], 'the explicit hidden marker withdraws a provider');
    const specs = await catalog.listSessionLaunchSpecs(measured({ operational: ['claude', 'codex', 'grok'], models: {
      claude: listed(['claude-fable-5-1', 'claude-opus-5-5']),
      codex: listed(['gpt-5.6-sol', 'ex-1']),
      grok: listed(['grok-4.6']),
    } }));
    const cmds = specs.map((row) => row.cmd);
    assert.ok(cmds.includes('codex --model gpt-5.6-sol') && cmds.includes('claude --model claude-fable-5-1') && cmds.includes('codex --model ex-1'));
    assert.equal(specs.find((row) => row.model === 'claude-opus-5-5')?.tier, '', 'the copy has no row for it: listed by the CLI, launchable, no metadata');
    assert.ok(!cmds.some((cmd) => cmd.startsWith('grok')), 'withdrawn providers launch nothing, whatever the CLI lists');
  } finally {
    await rm(mine, { force: true });
  }
  const back = await catalog.readProviderCatalog();
  assert.equal(back.origin, 'stock');
  assert.deepEqual(back.withdrawn, []);
  assert.ok(back.providers.every((p) => p.origin === 'stock' && !p.shadowed), 'no copy: exactly the shipped list, every section shipped');
});

test('the summary is what was measured, dated, and survives the record round trip; a record from before 2026-09-25 reads into today\'s shape', async () => {
  const facts = await summary.measureProviders({ providers: { codex: { activated_at: '2026-09-01T00:00:00.000Z' }, gemini: { activated_at: 'x', off_at: '2026-09-02T00:00:00.000Z' } } }, {
    availability: [
      { id: 'claude', label: 'Claude Code', get: 'x', parked: '', cmd: 'claude', installed: true, path: '/bin/claude' },
      { id: 'codex', label: 'Codex', get: 'x', parked: '', cmd: 'codex', installed: true, path: '/bin/codex' },
      { id: 'gemini', label: 'Gemini CLI', get: 'x', parked: '', cmd: 'gemini', installed: true, path: '/bin/gemini' },
    ],
    signedIn: async (id) => id === 'claude' || id === 'grok',
    now: () => '2026-09-08T10:00:00.000Z',
    version: async (file, argv) => { if (file === '/bin/gemini') throw new Error('gemini was asked: a provider not activated gets nothing spent on it'); return (file === '/bin/codex' && argv[0] === '--version' ? 'codex-cli 0.151.0' : file === '/bin/claude' ? '2.1.263 (Claude Code)' : ''); },
    models: async () => { throw new Error('an ordinary measure reads no model list'); },
  });
  assert.deepEqual(facts, {
    measured_at: '2026-09-08T10:00:00.000Z',
    refreshed_at: '',
    installed: ['claude', 'codex', 'gemini'],
    signed_in: ['claude', 'grok'],
    operational: ['claude', 'codex'],
    off: ['gemini'],
    activated_count: 2,
    paths: { claude: '/bin/claude', codex: '/bin/codex', gemini: '/bin/gemini' },
    versions: { claude: '2.1.263', codex: '0.151.0' },
    models: {},
    latest: {},
  }, 'gemini is installed and recorded but turned off; grok has a file but no CLI; a CLI that would not say its version is simply absent');

  assert.equal(await summary.readProviderSummary(), null, 'nothing measured yet, nothing guessed');
  await summary.recordProviderSummary(facts);
  assert.deepEqual(await summary.readProviderSummary(), facts);
  const campaign = await campaigns.initialCampaign();
  assert.deepEqual(campaign?.providers, facts, 'the summary hangs on the Campaign record');
  const renamed = await campaigns.writeCampaign(campaign!.id, { title: 'Renamed' });
  assert.deepEqual(renamed.providers, facts, 'an ordinary Campaign edit leaves the summary alone');

  assert.equal(catalog.parseProviderSummary(null), null);
  assert.equal(catalog.parseProviderSummary({ installed: ['claude'] }), null, 'undated is unmeasured');
  assert.deepEqual(catalog.parseProviderSummary({ measured_at: 't', installed: ['claude', 'claude', 7], operational: ['bad id!'], paths: { claude: '/x', codex: 3 }, versions: { codex: '0.151.0', claude: 9 }, latest: { codex: { version: '0.153.4', checked_at: 'c' }, claude: { version: '' } },
    models: { claude: { read_at: 'r', by: '2.1.281', rows: [{ id: 'claude-opus-5-5', name: 'Opus 5.5' }, { id: 'x' }] }, codex: { read_at: '', rows: [] }, gemini: { read_at: 'r', by: '', rows: [], unavailable: 'why' } } }), {
    measured_at: 't', refreshed_at: '', installed: ['claude'], signed_in: [], operational: [], off: [], activated_count: 0, paths: { claude: '/x' },
    versions: { codex: '0.151.0' }, latest: { codex: { version: '0.153.4', checked_at: 'c' } },
    models: { claude: { read_at: 'r', by: '2.1.281', rows: [{ id: 'claude-opus-5-5', name: 'Opus 5.5' }, { id: 'x', name: 'x' }] }, gemini: { read_at: 'r', by: '', rows: [], unavailable: 'why' } },
  }, 'a summary recorded before some field existed reads back with empty maps, never undefined; an undated list is dropped');
  // The shape recorded until 2026-09-25: the CLI's raw cache under `model_lists`. Read once, never blanked.
  const legacy = catalog.parseProviderSummary({ measured_at: 't', installed: ['claude'], model_lists: { claude: {
    fetched_at: '2026-09-20T06:15:44.600Z', etag: 'e', client_version: 'catalog-2',
    models: [{ slug: 'claude-opus-5', display_name: 'Opus 5', description: '', visibility: 'list', priority: 0 }, { slug: 'hidden', display_name: 'H', description: '', visibility: 'hide', priority: 1 }],
  } } });
  assert.deepEqual(legacy?.models, { claude: { read_at: '2026-09-20T06:15:44.600Z', by: 'catalog-2', rows: [{ id: 'claude-opus-5', name: 'Opus 5' }] } });
});

test('each CLI\'s own list is read the way the registry says — the real cache shapes, a printed list, or an honest none', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ronin-model-lists-'));
  const now = () => '2026-09-25T18:00:00.000Z';
  try {
    assert.deepEqual(AGENTS.map((agent) => [agent.id, agent.operations.models.read]), [['claude', 'claude-cache'], ['codex', 'codex-cache'], ['gemini', 'none'], ['grok', 'command'], ['hermes', 'none']]);
    // Nothing on disk yet: not guessed.
    assert.deepEqual(await summary.readModels(agent('claude'), { home, version: '2.1.282', now }), { read_at: now(), by: '2.1.282', rows: [], unavailable: 'No readable model list from Claude Code.' });
    await mkdir(path.join(home, '.claude', 'cache', 'model-catalog'), { recursive: true });
    await writeFile(path.join(home, '.claude', 'cache', 'model-catalog', 'abc-cc.json'), await readFile(new URL('claude-model-catalog-cc.json', fixtures)));
    await writeFile(path.join(home, '.claude', 'cache', 'model-catalog', 'published-floor.json'), '{"not":"a catalog"}');
    assert.deepEqual(await summary.readModels(agent('claude'), { home, version: '2.1.282', now }), { read_at: now(), by: '2.1.282', rows: [
      { id: 'claude-opus-5-5', name: 'Opus 5.5' }, { id: 'claude-fable-5-1', name: 'Fable 5.1' }, { id: 'claude-sonnet-5', name: 'Sonnet 5' }, { id: 'claude-opus-5', name: 'Opus 5' },
    ] }, 'the CLI\'s order, its full names — the version is in the name; the stamped version is the installed CLI\'s');
    await mkdir(path.join(home, '.codex'), { recursive: true });
    await writeFile(path.join(home, '.codex', 'models_cache.json'), await readFile(new URL('codex-models_cache.json', fixtures)));
    assert.deepEqual((await summary.readModels(agent('codex'), { home, version: '0.157.0', now })).rows, [
      { id: 'gpt-6-astra', name: 'GPT-6-Astra' }, { id: 'gpt-5.6-sol', name: 'GPT-5.6-Sol' }, { id: 'gpt-5.5', name: 'GPT-5.5' },
    ], 'a row the CLI hides is not offered');
    await writeFile(path.join(home, '.codex', 'models_cache.json'), '{bad');
    assert.equal((await summary.readModels(agent('codex'), { home, now })).unavailable, 'No readable model list from Codex.', 'unparseable is not measured');
    assert.deepEqual(summary.commandModels(await readFile(new URL('grok-models.txt', fixtures), 'utf8')), [{ id: 'grok-4.6', name: 'grok-4.6' }, { id: 'grok-4.3', name: 'grok-4.3' }]);
    assert.equal(summary.commandModels('You are not authenticated.'), null);
    assert.deepEqual(await summary.readModels(agent('gemini'), { home, version: '0.61.0', now }), { read_at: now(), by: '0.61.0', rows: [], unavailable: 'Gemini CLI publishes no model list Ronin can read.' });
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('Refresh all reads every activated CLI\'s list again and asks npm; an ordinary measure keeps the recorded lists and reads nothing', async () => {
  const availability = [
    { id: 'claude', label: 'Claude Code', get: 'x', parked: '', cmd: 'claude', installed: true, path: '/bin/claude' },
    { id: 'codex', label: 'Codex', get: 'x', parked: '', cmd: 'codex', installed: true, path: '/bin/codex' },
  ];
  const ops = (now: string, reads: string[]) => ({
    availability, signedIn: async (id: string) => id === 'claude' || id === 'codex', now: () => now,
    version: async (file: string) => (file === '/bin/claude' ? '2.1.282' : '0.157.0'),
    models: async (agent: import('../src/provider-summary.js').Agent, options: import('../src/provider-summary.js').ReadModelsOptions) => {
      reads.push(`${agent.id}@${options.version}`);
      return { read_at: options.now!(), by: options.version ?? '', rows: [{ id: `${agent.id}-new`, name: `${agent.label} New` }] };
    },
  });
  const asked: string[] = [];
  const latest = { npmView: async (pkg: string) => { asked.push(pkg); return '9.9.9'; }, egress: async () => {}, now: () => '2026-09-25T18:00:00.000Z' };
  // The record before the press: the 20 September list, stale.
  await summary.recordProviderSummary(measured({ measured_at: '2026-09-20T06:00:00Z', installed: ['claude', 'codex'], signed_in: ['claude', 'codex'], operational: ['claude', 'codex'], activated_count: 2,
    models: { claude: { read_at: '2026-09-20T06:15:44.600Z', by: '2.1.281', rows: [{ id: 'claude-opus-5', name: 'Opus 5' }] } }, latest: { claude: { version: '2.1.282', checked_at: 'old' } } }));
  const reads: string[] = [];
  const plain = await summary.measureAndRecordProviders({}, ops('2026-09-25T17:02:55.000Z', reads));
  assert.deepEqual(reads, [], 'an ordinary measure reads no list');
  assert.deepEqual(plain.models, { claude: { read_at: '2026-09-20T06:15:44.600Z', by: '2.1.281', rows: [{ id: 'claude-opus-5', name: 'Opus 5' }] } }, 'the recorded list rides along unchanged');
  assert.equal(plain.refreshed_at, '');
  assert.deepEqual(plain.latest, { claude: { version: '2.1.282', checked_at: 'old' } }, 'and so does the last npm answer');
  const pressed = await summary.refreshProviders({}, ops('2026-09-25T18:00:00.000Z', reads), latest);
  assert.deepEqual(reads, ['claude@2.1.282', 'codex@0.157.0'], 'every activated CLI is read, stamped with the version just measured');
  assert.deepEqual(pressed.models, {
    claude: { read_at: '2026-09-25T18:00:00.000Z', by: '2.1.282', rows: [{ id: 'claude-new', name: 'Claude Code New' }] },
    codex: { read_at: '2026-09-25T18:00:00.000Z', by: '0.157.0', rows: [{ id: 'codex-new', name: 'Codex New' }] },
  }, 'the stale list is replaced, not carried');
  assert.equal(pressed.refreshed_at, '2026-09-25T18:00:00.000Z');
  assert.deepEqual(asked, ['@anthropic-ai/claude-code', '@openai/codex']);
  assert.deepEqual(await summary.readProviderSummary(), pressed, 'and the record holds it');
  const again = await summary.measureAndRecordProviders({}, ops('2026-09-25T19:00:00.000Z', reads));
  assert.deepEqual(again.models, pressed.models);
  assert.equal(again.refreshed_at, '2026-09-25T18:00:00.000Z', 'the last Refresh all date survives an ordinary measure');
  const off = await summary.refreshProviders({ providers: { codex: { off_at: '2026-09-25T19:30:00.000Z' } } }, ops('2026-09-25T20:00:00.000Z', reads), latest);
  assert.deepEqual(Object.keys(off.models), ['claude'], 'a provider turned off gets nothing spent on it, and its list goes with it');
  assert.deepEqual(off.off, ['codex']);
});

test('latest is asked only of a CLI whose install line names an npm package, and every ask is an egress line', async () => {
  const asked: string[] = [];
  const egress: Array<Record<string, unknown>> = [];
  const latest = await summary.latestVersions(['claude', 'codex', 'gemini', 'hermes'], {
    npmView: async (pkg) => { asked.push(pkg); if (pkg === '@openai/codex') return '0.153.4'; if (pkg === '@google/gemini-cli') return '0.59.0'; if (pkg === '@anthropic-ai/claude-code') throw new Error('offline'); return ''; },
    egress: async (line) => { egress.push(line as unknown as Record<string, unknown>); },
    now: () => '2026-09-09T12:00:00.000Z',
  });
  assert.deepEqual(asked, ['@anthropic-ai/claude-code', '@openai/codex', '@google/gemini-cli'], 'every npm-installed CLI is asked from its install source; hermes has no npm source');
  assert.deepEqual(latest, { codex: { version: '0.153.4', checked_at: '2026-09-09T12:00:00.000Z' }, gemini: { version: '0.59.0', checked_at: '2026-09-09T12:00:00.000Z' } }, 'an ask that failed leaves no answer — unknown, never guessed');
  assert.deepEqual(egress.map((line) => [line.host, line.path, line.outcome, line.status]), [
    ['registry.npmjs.org', '/@anthropic-ai/claude-code', 'unreachable', 0],
    ['registry.npmjs.org', '/@openai/codex', 'ok', 200],
    ['registry.npmjs.org', '/@google/gemini-cli', 'ok', 200],
  ], 'answered or not, each ask is on the egress record');
  assert.equal(summary.npmPackageOf('npm install -g @openai/codex@latest'), '@openai/codex');
  assert.equal(summary.npmPackageOf('npm install -g @google/gemini-cli'), '@google/gemini-cli');
  assert.equal(summary.npmPackageOf(''), '');
  assert.equal(catalog.newerVersion('0.151.0', '0.153.4'), true);
  assert.equal(catalog.newerVersion('2.1.265', '2.1.265'), false);
  assert.equal(catalog.newerVersion('2.1.265', '2.1.9'), false);
  assert.equal(catalog.newerVersion('', '1.0.0'), false, 'unreadable on either side is never "newer"');
});

test('the start-up measure follows the Campaign record and its migration, never beside them, and reads no list', async () => {
  // Both the summary write and the scope migration read-modify-write the campaigns section
  // of machine settings; run concurrently on a fresh install, one write is lost. The chain
  // in src/index.ts is the seam, so it is pinned here.
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(source, /ensureInitialCampaign\(\)\s*\.then\(\(\) => migrateCampaignScope\(\)\)\s*\.then\(\(\) => \(isEntryPoint \? measureAndRecordProviders\(\) : undefined\)\)/);
  assert.equal(source.match(/measureAndRecordProviders\(\)/g)?.length, 1, 'measured at start in one place only');
  assert.doesNotMatch(source, /refreshProviders/, 'Refresh all is the owner\'s press, never start-up');
  const progress = await readFile(new URL('../src/setup-progress.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(progress, /refreshProviders|Inventory/, 'the Setup scan measures; it reads no list');
});

test.after(async () => { await rm(box, { recursive: true, force: true }); });
