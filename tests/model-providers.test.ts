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
  assert.match(read.updated, /^\d{4}-\d{2}-\d{2}$/, 'the stock catalog says when it was last read from the public record');
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

test('the updated day is read from the header only, in YYYY-MM-DD, never from a provider section', () => {
  assert.equal(catalog.catalogUpdated('# c\n\n- **updated:** 2026-09-08\n\n### V\n- **provider:** `v`\n- **cli:** `claude`\n'), '2026-09-08');
  assert.equal(catalog.catalogUpdated('# c\n\n### V\n- **updated:** 2026-09-08\n- **provider:** `v`\n'), '', 'a date inside a section is not the catalog\'s');
  assert.equal(catalog.catalogUpdated('# c\n\n- **updated:** September 2026\n'), '', 'only a full day counts');
  assert.equal(catalog.catalogUpdated(''), '');
});

test("the owner's copy is an overlay: a section of a shipped id replaces it in place, a new id appends, a tombstone withdraws, and every entry says its layer", async () => {
  await mkdir(process.env.RONIN_CATALOGS_DIR!, { recursive: true });
  const mine = path.join(process.env.RONIN_CATALOGS_DIR!, catalog.CATALOG_FILE);
  const table = '| model | tier | default | cost | good at | not good at | launch |\n|---|---|---|---|---|---|---|';
  await writeFile(mine, [
    '# mine', '',
    '### Anthropic (mine)', '', '- **provider:** `anthropic`', '- **cli:** `claude`', '', table,
    '| `fable` | frontier | yes | $10 (2026-09) | hard | cheap | `claude --model fable` |', '',
    '### xAI', '', '- **provider:** `xai`', '- **hidden:** yes', '',
    '### Google', '', '- **provider:** `google`', '- **cli:** `gemini`', '', table,
    '| `gemini-3.1-pro` | frontier | | $2 (2026-09) | x | y | — |',
    '| `gemini-3.8-flash` | standard | yes | $0.75 (2026-09) | x | y | — |', '',
    '### Example', '', '- **provider:** `example`', '- **cli:** `codex`', '', table,
    '| `ex-1` | standard | yes | $1 (2026-09) | a | b | `codex --profile example --model ex-1` |',
  ].join('\n'));
  try {
    const read = await catalog.readProviderCatalog();
    assert.equal(read.origin, 'user');
    assert.equal(read.path, mine);
    assert.equal(read.updated, '', 'the copy has no updated line and says so');
    assert.match(read.stock_updated, /^\d{4}-\d{2}-\d{2}$/, 'the shipped date is carried beside it, never borrowed for it');
    assert.deepEqual(read.providers.map((p) => [p.provider, p.origin, p.shadowed]), [
      ['anthropic', 'user', true], ['openai', 'stock', false], ['nous', 'stock', false], ['example', 'user', false],
    ], 'anthropic replaced in place; openai and nous untouched; xai hidden and google tombstoned are gone; example appended');
    assert.equal(read.providers[0].label, 'Anthropic (mine)', 'the heading is the copy\'s, the key was the id');
    assert.deepEqual(read.providers[0].models.map((m) => m.cmd), ['claude --model fable'], 'the section replaced whole — the shipped rows do not merge in');
    assert.ok(read.providers[1].models.length >= 3, 'the shipped OpenAI rows are exactly as shipped');
    assert.deepEqual(read.withdrawn, [{ provider: 'google', label: 'Google' }, { provider: 'xai', label: 'xAI' }], 'both tombstone forms withdraw, in shipped order, and the withdrawn are named');
    const cmds = (await catalog.listSessionLaunchSpecs()).map((row) => row.cmd);
    assert.ok(cmds.includes('codex --model gpt-5.6-sol') && cmds.includes('claude --model fable') && cmds.includes('codex --profile example --model ex-1'));
    assert.ok(!cmds.some((cmd) => cmd.startsWith('gemini') || cmd.startsWith('grok')), 'withdrawn providers launch nothing');
  } finally {
    await rm(mine, { force: true });
  }
  const back = await catalog.readProviderCatalog();
  assert.equal(back.origin, 'stock');
  assert.deepEqual(back.withdrawn, []);
  assert.ok(back.providers.every((p) => p.origin === 'stock' && !p.shadowed), 'no copy: exactly the shipped list, every section shipped');
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
    version: async (file, argv) => { if (file === '/bin/gemini') throw new Error('gemini was asked: a provider not activated gets nothing spent on it'); return (file === '/bin/codex' && argv[0] === '--version' ? 'codex-cli 0.151.0' : file === '/bin/claude' ? '2.1.263 (Claude Code)' : ''); },
  });
  assert.deepEqual(measured, {
    measured_at: '2026-09-08T10:00:00.000Z',
    installed: ['claude', 'codex', 'gemini'],
    signed_in: ['claude', 'grok'],
    operational: ['claude', 'codex'],
    activated_count: 2,
    paths: { claude: '/bin/claude', codex: '/bin/codex', gemini: '/bin/gemini' },
    versions: { claude: '2.1.263', codex: '0.151.0' },
    latest: {},
  }, 'gemini is installed but neither signed in nor recorded; grok has a file but no CLI; a CLI that would not say its version is simply absent');

  assert.equal(await summary.readProviderSummary(), null, 'nothing measured yet, nothing guessed');
  await summary.recordProviderSummary(measured);
  assert.deepEqual(await summary.readProviderSummary(), measured);
  const campaign = await campaigns.initialCampaign();
  assert.deepEqual(campaign?.providers, measured, 'the summary hangs on the Campaign record');
  const renamed = await campaigns.writeCampaign(campaign!.id, { title: 'Renamed' });
  assert.deepEqual(renamed.providers, measured, 'an ordinary Campaign edit leaves the summary alone');

  assert.equal(catalog.parseProviderSummary(null), null);
  assert.equal(catalog.parseProviderSummary({ installed: ['claude'] }), null, 'undated is unmeasured');
  assert.deepEqual(catalog.parseProviderSummary({ measured_at: 't', installed: ['claude', 'claude', 7], operational: ['bad id!'], paths: { claude: '/x', codex: 3 }, versions: { codex: '0.151.0', claude: 9 }, latest: { codex: { version: '0.153.4', checked_at: 'c' }, claude: { version: '' } } }), {
    measured_at: 't', installed: ['claude'], signed_in: [], operational: [], activated_count: 0, paths: { claude: '/x' },
    versions: { codex: '0.151.0' }, latest: { codex: { version: '0.153.4', checked_at: 'c' } },
  }, 'a summary recorded before versions existed reads back with empty maps, never undefined');
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

test('the start-up measure follows the Campaign record and its migration, never beside them', async () => {
  // Both the summary write and the scope migration read-modify-write the campaigns section
  // of machine settings; run concurrently on a fresh install, one write is lost. The chain
  // in src/index.ts is the seam, so it is pinned here.
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(source, /ensureInitialCampaign\(\)\s*\.then\(\(\) => migrateCampaignScope\(\)\)\s*\.then\(\(\) => \(isEntryPoint \? measureAndRecordProviders\(\) : undefined\)\)/);
  assert.equal(source.match(/measureAndRecordProviders\(\)/g)?.length, 1, 'measured at start in one place only');
});

test.after(async () => { await rm(box, { recursive: true, force: true }); });
