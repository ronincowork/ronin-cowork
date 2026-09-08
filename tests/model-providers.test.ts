/**
 * ONE PROVIDER CATALOG, ONE MEASURED SUMMARY — the shape behind every picker and every
 * provider fact on screen (owner's rulings, 2026-09-08).
 *
 * The catalog joins the vendor id a launch names to the CLI that serves it, in data; the
 * owner's copy in the catalogs store wins whole; a provider's default row is marked, not
 * implied. The summary is what the machine measured, dated, hung on the Campaign record,
 * and a provider counts as activated only when the catalog gives it a cell to launch.
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

test('the stock catalog names every provider with its CLI, its tiers and a marked default', async () => {
  const read = await catalog.readProviderCatalog();
  assert.equal(read.origin, 'stock');
  const providers = read.providers;
  assert.deepEqual(providers.map((entry) => entry.cli), ['claude', 'codex', 'gemini', 'grok', 'hermes'], 'one section per CLI the registry knows');
  for (const entry of providers) {
    assert.ok(AGENTS.some((agent) => agent.id === entry.cli), `${entry.label}: cli ${entry.cli} is in src/agents.ts`);
    assert.ok(entry.models.length > 0, `${entry.label} offers a model`);
    assert.ok(entry.models.filter((row) => row.default).length <= 1, `${entry.label} marks at most one default`);
    for (const row of entry.models) {
      assert.ok((catalog.TIERS as readonly string[]).includes(row.tier), `${row.model}: tier ${row.tier}`);
      assert.match(row.cost, /\(\d{4}-\d{2}\)/, `${row.model}: the cost reading is dated`);
      assert.ok(row.good_at && row.not_good_at, `${row.model}: good at and not good at`);
      assert.ok(row.cmd.includes(row.model), `${row.model}: the launch cell names the model`);
      assert.equal(row.provider, entry.provider);
      assert.equal(row.cli, entry.cli);
    }
  }
  const anthropic = providers.find((entry) => entry.provider === 'anthropic')!;
  assert.equal(anthropic.label, 'Anthropic');
  assert.equal(anthropic.gbrainDisconnected, '--strict-mcp-config');
  assert.equal(anthropic.liveDangerously, '--dangerously-skip-permissions');
  assert.deepEqual(anthropic.models.map((row) => row.model), ['opus', 'fable', 'sonnet', 'haiku'], 'row order is picker order');
  assert.equal(catalog.providerDefault(anthropic.models, 'anthropic')?.model, 'opus');
  assert.equal(anthropic.models.find((row) => row.model === 'haiku')?.tier, 'light');
  const openai = providers.find((entry) => entry.provider === 'openai')!;
  assert.equal(catalog.providerDefault(openai.models, 'openai')?.model, 'gpt-5.6-sol');
  const flat = await catalog.listSessionLaunchSpecs();
  assert.deepEqual(flat.slice(0, 4).map((row) => row.cmd), ['claude --model opus', 'claude --model fable', 'claude --model sonnet', 'claude --model haiku']);
  assert.equal(flat.find((row) => row.cmd === 'claude --model opus')?.liveDangerously, '--dangerously-skip-permissions', 'the launch flags ride every cell');
});

test('a section may split facts and launch cells over tables, joined by model id; a row without a launch cell is a name, not a spec', () => {
  const parsed = catalog.parseProviderCatalog([
    '# a catalog', '', '### Example Vendor', '',
    '- **provider:** `example`', '- **cli:** `claude`', '- **live_dangerously:** `--go`', '',
    '| model | tier | default | cost | good at | not good at |', '|---|---|---|---|---|---|',
    '| `b` | light | | $1 (2026-09) | speed | depth |',
    '| `a` | frontier | yes | $9 (2026-09) | depth | speed |',
    '| `named-only` | standard | | $2 (2026-09) | little | much |', '',
    '| model | launch |', '|---|---|',
    '| `a` | `claude --model a` |', '| `b` | `claude --model b` |', '',
    '### Wide Vendor', '', '- **provider:** `wide`', '- **cli:** `codex`', '',
    '| model | tier | default | cost | good at | not good at | launch |', '|---|---|---|---|---|---|---|',
    '| `w` | standard | yes | $3 (2026-09) | x | y | `codex --model w` |', '',
    '### No Cli', '', '- **provider:** `orphan`', '',
    '| model | launch |', '|---|---|', '| `z` | `z` |',
  ].join('\n'));
  assert.deepEqual(parsed.map((entry) => entry.provider), ['example', 'wide'], 'a section without a cli is no provider');
  const example = parsed[0]!;
  assert.deepEqual(example.models.map((row) => row.model), ['b', 'a'], 'the facts table sets the order; named-only has no launch cell');
  assert.equal(example.models[1]?.default, true);
  assert.equal(example.models[0]?.tier, 'light');
  assert.equal(example.models[0]?.liveDangerously, '--go');
  assert.equal(catalog.providerDefault(example.models, 'example')?.model, 'a', 'the marked default beats the first row');
  assert.equal(catalog.providerDefault(parsed[1]!.models, 'wide')?.model, 'w');
  assert.equal(catalog.providerDefault(example.models, 'nobody'), undefined);
});

test("the owner's copy in the catalogs store shadows the stock catalog whole", async () => {
  await mkdir(process.env.RONIN_CATALOGS_DIR!, { recursive: true });
  const mine = path.join(process.env.RONIN_CATALOGS_DIR!, catalog.CATALOG_FILE);
  await writeFile(mine, [
    '# mine', '', '### Anthropic', '', '- **provider:** `anthropic`', '- **cli:** `claude`', '',
    '| model | tier | default | cost | good at | not good at | launch |', '|---|---|---|---|---|---|---|',
    '| `fable` | frontier | yes | $10 (2026-09) | hard | cheap | `claude --model fable` |',
  ].join('\n'));
  try {
    const read = await catalog.readProviderCatalog();
    assert.equal(read.origin, 'user');
    assert.equal(read.path, mine);
    assert.deepEqual((await catalog.listSessionLaunchSpecs()).map((row) => row.cmd), ['claude --model fable'], 'the store copy is the whole catalog');
  } finally {
    await rm(mine, { force: true });
  }
  assert.equal((await catalog.readProviderCatalog()).origin, 'stock');
});

test('the summary is what was measured, dated, and survives the record round trip', async () => {
  const measured = await summary.measureProviders({ providers: { codex: { activated_at: '2026-09-01T00:00:00.000Z' } } }, {
    availability: [
      { id: 'claude', label: 'Claude Code', get: 'x', parked: '', cmd: 'claude', installed: true, path: '/bin/claude' },
      { id: 'codex', label: 'Codex', get: 'x', parked: '', cmd: 'codex', installed: true, path: '/bin/codex' },
      { id: 'gemini', label: 'Gemini CLI', get: 'x', parked: '', cmd: 'gemini', installed: true, path: '/bin/gemini' },
    ],
    signedIn: async (id) => id === 'claude' || id === 'grok',
    now: () => '2026-09-08T10:00:00.000Z',
  });
  assert.deepEqual(measured, {
    measured_at: '2026-09-08T10:00:00.000Z',
    installed: ['claude', 'codex', 'gemini'],
    signed_in: ['claude', 'grok'],
    operational: ['claude', 'codex'],
    activated_count: 2,
    paths: { claude: '/bin/claude', codex: '/bin/codex', gemini: '/bin/gemini' },
  }, 'gemini is installed but neither signed in nor recorded; grok has a file but no CLI');

  assert.equal(await summary.readProviderSummary(), null, 'nothing measured yet, nothing guessed');
  await summary.recordProviderSummary(measured);
  assert.deepEqual(await summary.readProviderSummary(), measured);
  const campaign = await campaigns.initialCampaign();
  assert.deepEqual(campaign?.providers, measured, 'the summary hangs on the Campaign record');
  const renamed = await campaigns.writeCampaign(campaign!.id, { title: 'Renamed' });
  assert.deepEqual(renamed.providers, measured, 'an ordinary Campaign edit leaves the summary alone');

  assert.equal(catalog.parseProviderSummary(null), null);
  assert.equal(catalog.parseProviderSummary({ installed: ['claude'] }), null, 'undated is unmeasured');
  assert.deepEqual(catalog.parseProviderSummary({ measured_at: 't', installed: ['claude', 'claude', 7], operational: ['bad id!'], paths: { claude: '/x', codex: 3 } }), {
    measured_at: 't', installed: ['claude'], signed_in: [], operational: [], activated_count: 0, paths: { claude: '/x' },
  });
});

test('the start-up measure follows the Campaign record and its migration, never beside them', async () => {
  // Both the summary write and the scope migration read-modify-write the campaigns section
  // of machine settings; run concurrently on a fresh install, one write is lost. The chain
  // in src/index.ts is the seam, so it is pinned here.
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(source, /ensureInitialCampaign\(\)\s*\.then\(\(\) => migrateCampaignScope\(\)\)\s*\.then\(\(\) => \(isEntryPoint \? measureAndRecordProviders\(\) : undefined\)\)/);
  assert.equal(source.match(/measureAndRecordProviders\(\)/g)?.length, 1, 'measured at start in one place only');
});

test.after(async () => { await rm(box, { recursive: true, force: true }); });
