import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STOCK_DIR, splitSections, readEntries } from '../src/resources.js';
import {
  findDefinition,
  listAgentTemplates,
  listInstallations,
  listBehaviours,
  listTeamTemplates,
  type DefinitionKind,
  type TemplateBox,
} from '../src/resource-adapters.js';
import { listDeskProfiles } from '../src/desk-profiles.js';
import { listLexicons } from '../src/lexicon-catalog.js';
import { catalogUpdated, parseProviderCatalog, STOCK_CATALOG_MD, TIERS } from '../src/model-providers.js';
import { AGENTS } from '../src/agents.js';
import { readAgentLaunches, renderLaunch } from '../src/agent-launches.js';
import { resolveBehaviourBooks } from '../src/behaviours.js';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
let warns = 0;
const fail = (msg: string) => {
  console.error(`  FAIL  ${msg}`);
  fails++;
};
const warn = (msg: string) => {
  console.warn(`  warn  ${msg}`);
  warns++;
};

const stockNames = async (file: string): Promise<string[]> => {
  const raw = await readFile(path.join(STOCK_DIR, file), 'utf8');
  return splitSections(raw, 'stock')
    .filter((s) => s.head === s.name) // a heading with a space is prose, never an entry
    .map((s) => s.name);
};

async function surfacing(file: string, served: () => Promise<{ name: string }[]>): Promise<void> {
  const want = await stockNames(file);
  const got = new Set((await served()).map((e) => e.name));
  for (const name of want) {
    if (!got.has(name)) {
      fail(
        `${file}: stock entry "${name}" does not surface from its reader — ` +
          `half-written (dropped by a filter), or hidden by a user file on this box`,
      );
    }
  }
}

async function deadLinks(file: string): Promise<void> {
  const raw = await readFile(path.join(STOCK_DIR, file), 'utf8');
  const re = /(?:^|[\s(`])((?:docs|reading-list|co-working|ronin_catalogs|ronin_library|hostside|scripts|bin)\/[A-Za-z0-9_./-]*[A-Za-z0-9_-])/gm;
  const seen = new Set<string>();
  for (const m of raw.matchAll(re)) {
    const p = m[1];
    if (seen.has(p)) continue;
    seen.add(p);
    try {
      await stat(path.join(REPO, p));
    } catch {
      warn(`${file}: names ${p} — not in this install`);
    }
  }
}

async function surfacingDefinitions(
  kind: DefinitionKind,
  served: () => Promise<{ name: string }[]>,
): Promise<void> {
  let files: string[] = [];
  try {
    files = await readdir(path.join(STOCK_DIR, kind));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const want = files
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => f.replace(/\.md$/, ''));
  const got = new Set((await served()).map((e) => e.name));
  for (const name of want) {
    if (!got.has(name)) {
      fail(
        `${kind}/${name}.md: does not surface from its reader — ` +
          `malformed (no \`- **key:** value\` lines), or hidden by a user file on this box`,
      );
    }
  }
}

async function templateBoxResolves(
  at: string,
  box: TemplateBox,
): Promise<void> {
  if (!box.blurb.trim()) fail(`${at}: missing blurb`);
  if (!box.art.trim()) fail(`${at}: missing art`);
  if (!box.kinds.length) fail(`${at}: names no valid kinds — nothing brings it forward`);
  for (const book of box.behaviours) {
    const resolved = await resolveBehaviourBooks([book]);
    if (!resolved.delivered.length) fail(`${at}: behaviour does not resolve "${book}"`);
  }
}

async function templatesResolve(): Promise<void> {
  const DEAD = ['lead_brief', 'lead_mandate'];
  for (const template of (await listAgentTemplates()).filter((x) => x.origin === 'stock')) {
    const at = `templates/agents/${template.name}.md`;
    await templateBoxResolves(at, template);
    const def = await findDefinition('templates/agents', template.name);
    if (def?.has('mandate') && !template.mandate) fail(`${at}: mandate is not \`reach · recruit · output\` in ruled values`);
    if (!template.brief.trim()) fail(`${at}: an agent template seeds a brief`);
    for (const key of ['objective', ...DEAD]) {
      if (def?.has(key)) fail(`${at}: \`${key}:\` is a team answer — it does not belong on the agent shelf`);
    }
  }
  for (const template of (await listTeamTemplates()).filter((x) => x.origin === 'stock')) {
    const at = `templates/teams/${template.name}.md`;
    await templateBoxResolves(at, template);
    const def = await findDefinition('templates/teams', template.name);
    if (!template.objective.trim()) fail(`${at}: a team template states its objective`);
    for (const key of ['brief', 'team_mode', ...DEAD]) {
      if (def?.has(key)) fail(`${at}: \`${key}:\` does not belong on the team shelf`);
    }
    if (template.agents.length < 2) fail(`${at}: a cast is several agents — ${template.agents.length} row(s) found`);
    if (template.agents.filter((row) => row.team_lead).length !== 1) {
      fail(`${at}: exactly one cast row is marked \`team_lead: yes\``);
    }
    const seen = new Set<string>();
    for (const row of template.agents) {
      if (seen.has(row.name)) fail(`${at}: two cast rows are both called "${row.name}"`);
      seen.add(row.name);
      if (!row.instructions.trim()) fail(`${at}: cast row "${row.name}" has no instructions`);
    }
  }
}

const FILES = ['TOOLS.md', 'PROJECT_ROOTS.md', 'MODEL_PROVIDERS.md'];

await surfacingDefinitions('desk_profiles', listDeskProfiles);
await surfacingDefinitions('lexicons', listLexicons);
await surfacingDefinitions('installations', listInstallations);
await surfacingDefinitions('behaviours', listBehaviours);
await surfacingDefinitions('templates/agents', listAgentTemplates);
await surfacingDefinitions('templates/teams', listTeamTemplates);
await templatesResolve();
await surfacing('TOOLS.md', () => readEntries('TOOLS.md'));

// The SHIPPED file, explicitly: `readProviderCatalog()` lays the owner's copy over it, and a
// verify that judged the owner's rows would guard the wrong file on a box with a copy.
const stockCatalogRaw = await readFile(STOCK_CATALOG_MD, 'utf8');
const catalog = parseProviderCatalog(stockCatalogRaw);
const updated = catalogUpdated(stockCatalogRaw);
if (catalog.length === 0) fail('MODEL_PROVIDERS.md: the provider catalog yields no providers');
if (!/^\d{4}-\d{2}-\d{2}$/.test(updated)) fail('MODEL_PROVIDERS.md: the header carries no `- **updated:** YYYY-MM-DD` line');
{
  const providers = new Set<string>();
  const clis = new Set<string>();
  for (const entry of catalog) {
    const at = `MODEL_PROVIDERS.md: ${entry.label}`;
    if (providers.has(entry.provider)) fail(`${at}: provider id "${entry.provider}" is used by two sections`);
    providers.add(entry.provider);
    // A coming-soon section is display inventory, not a launch promise.
    if (entry.maturity === 'comingSoon' && entry.models.length === 0) continue;
    if (clis.has(entry.cli)) fail(`${at}: cli "${entry.cli}" is served by two sections`);
    clis.add(entry.cli);
    const agent = AGENTS.find((row) => row.id === entry.cli);
    if (!agent) { fail(`${at}: cli "${entry.cli}" is not in src/agents.ts`); continue; }
    if (!entry.models.length) fail(`${at}: offers no model rows`);
    let launches;
    try { launches = await readAgentLaunches(entry.cli); }
    catch (error) { fail(`${at}: ${(error as Error).message}`); continue; }
    if (launches.native[0] !== agent.cmd) fail(`${at}: Native does not start with the registered CLI "${agent.cmd}"`);
    if (entry.models.filter((row) => row.default).length > 1) fail(`${at}: more than one row says default`);
    for (const row of entry.models) {
      const here = `${at} · ${row.model}`;
      if (row.model === 'default') fail(`${here}: a model id "default" hides the model being launched`);
      if (!(TIERS as readonly string[]).includes(row.tier)) fail(`${here}: tier must be one of ${TIERS.join(', ')}`);
      if (!row.cost.trim()) fail(`${here}: no cost reading`);
      if (!row.good_at.trim()) fail(`${here}: no "good at"`);
      if (!row.not_good_at.trim()) fail(`${here}: no "not good at"`);
      if (!/\(\d{4}-\d{2}\)/.test(row.cost)) fail(`${here}: the cost reading carries no (YYYY-MM) date`);
      const argv = renderLaunch(launches.model, { provider: entry.provider, model: row.model });
      if (argv[0] !== agent.cmd) fail(`${here}: Model launch does not start with the ${entry.cli} CLI "${agent.cmd}"`);
      if (!argv.includes(row.model)) fail(`${here}: Model launch does not name the model it is listed under`);
    }
  }
  const openai = catalog.find((entry) => entry.provider === 'openai');
  if (!openai || openai.models.length < 2) fail('MODEL_PROVIDERS.md: OpenAI must offer more than one real model choice');
}

for (const f of FILES) await deadLinks(f);

if (fails) {
  console.error(`check-catalogs: ${fails} failure(s), ${warns} dead link(s)`);
  process.exit(1);
}
console.log(`check-catalogs: ok — every stock entry surfaces${warns ? `; ${warns} dead link(s) awaiting ronin_library material` : ''}`);
