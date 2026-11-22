import { readHermesSettings } from './hermes-setups.js';
/**
 * THE PROVIDER CATALOG AND THE ONE JOIN — every model row a picker offers or a launch runs.
 *
 * Two records, one join, two names per model (owner's ruling, 2026-09-25):
 *
 * - THE CATALOG (`ronin_stock/MODEL_PROVIDERS.md`, stock; the owner's copy in
 *   ~/ronin/custom/ is an OVERLAY on it, merged per `### <Vendor>` section and keyed by
 *   the section's `provider` id — `docs/architecture/shadowing.md`). It joins the vendor
 *   id a launch names to the CLI that serves it (`src/agents.ts`) and the family words that
 *   give a model its tier. It never says what is available and carries no model facts.
 * - THE CAMPAIGN'S PROVIDER SUMMARY: what this machine measured, dated, hung on the
 *   Campaign record. Its `models` are each activated CLI's own list, read on every refresh
 *   and never guessed. The CLI is the one source of truth for what can be launched
 *   (owner, 18 Nov 2026: the models.dev pull is gone, KAN-653).
 *
 * `providerRows` is the one join: Native first, then one model per tier from the CLI's list
 * (`oneModelPerTier`), each with its `model` (the id every launch uses) and `name` (the CLI's
 * own display name, which carries the version — "Opus 5.5"). Launches, Mika, machine
 * settings and every picker read these rows; no client joins anything.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { mergeSections, readUserCatalog, STOCK_DIR, storeDir, type CatalogSection, type Origin } from './resources.js';
import { commandText, readAgentLaunches, renderLaunch, type AgentLaunches } from './agent-launches.js';
import { AGENTS } from './agents.js';
import { partProviderRows } from './provider-parts.js';

export const CATALOG_FILE = 'MODEL_PROVIDERS.md';
export const TIERS = ['light', 'standard', 'frontier'] as const;
export type Tier = typeof TIERS[number];
export const NATIVE_MODEL = 'native';

export interface ProviderCatalogEntry {
  provider: string;
  cli: string;
  /** The vendor's name as the section heading gives it: Anthropic, OpenAI, … */
  label: string;
  /** Which layer this section came from: the shipped catalog, or the owner's copy. */
  origin: Origin;
  /** A user section that replaced a shipped section of the same provider id, whole. */
  shadowed: boolean;
  /** Optional display status for a provider that is beta or not offered yet. */
  maturity?: string;
  /** False for a `comingSoon` section: shown, never launched. */
  launchable: boolean;
  /** Expand this harness into its explicitly configured inference connections. */
  connections?: boolean;
  inference_provider?: string;
  connection_rows?: ModelRow[];
  /**
   * The vendor's durable family words and their tiers (`sonnet=standard`): a listed id's
   * tier, so a new generation keeps its band the day its CLI lists it.
   */
  families?: Array<{ family: string; tier: Tier }>;
}

export interface ProviderCatalog {
  /** 'user' when the owner's copy exists and takes part; the per-entry `origin` says which sections are theirs. */
  origin: Origin;
  /** The owner's copy when there is one, else the stock file. */
  path: string;
  providers: ProviderCatalogEntry[];
  /** Shipped providers the owner's copy withdrew with `- **hidden:** yes`. */
  withdrawn: Array<{ provider: string; label: string }>;
  /** Each tier's strengths, from the `## Tiers` table: the owner's copy's when it has one. */
  strengths: Partial<Record<Tier, string>>;
}

/** ONE JOINED ROW: what a launch runs and what a picker shows. */
export interface SessionLaunchSpec {
  /** The vendor id a launch names: `anthropic`, `openai`, … */
  provider: string;
  /** The id of the CLI that serves it in `src/agents.ts`: `claude`, `codex`, … */
  cli: string;
  /** The model id passed to the CLI, unchanged; `native` delegates the choice to the CLI. */
  model: string;
  /** The CLI's own display name for the id, version included ("Opus 5.5"); the id when it gives none. */
  name: string;
  /** The complete interactive command for this model. */
  cmd: string;
  dangerousCmd?: string;
  /** The tier of its family word; '' when the provider declares none that fits. */
  tier: Tier | '';
  /** The tier's strengths in a few plain words, from the catalog; '' or absent for Native and untiered rows. */
  strengths?: string;
  /** Native: the row a launch naming this provider and no model gets when no preference is set. */
  default: boolean;
}

/** A joined row as the client paints it: the launch spec plus what this machine can do with it. */
export interface ProviderRow extends SessionLaunchSpec {
  unavailable_reason?: string;
  provider_label: string;
  cli_label: string;
  /** Installed, signed in or recorded, and not turned off: this machine can launch it. */
  operational: boolean;
  /** Turned off by the owner; the sign-in is kept. */
  off: boolean;
  selectable: boolean;
  origin: Origin;
  shadowed: boolean;
}

export interface ProviderRows extends ProviderCatalogEntry {
  cli_label: string;
  operational: boolean;
  off: boolean;
  /** Complete ordinary CLI launch with model choice delegated to the CLI; absent when no Agent page serves this CLI. */
  native?: string;
  nativeDangerousCmd?: string;
  launch_modes?: Array<'configured' | 'live_dangerously'>;
  /** The Services part that serves this provider (src/provider-parts.ts); absent for a CLI's own. */
  part?: string;
  /** A part's one line for its provider page, in the part's words. */
  note?: string;
  models: ProviderRow[];
}

/** What `GET /api/provider-catalog` answers: the catalog's own facts, and the joined rows. */
export interface ProviderCatalogAnswer extends Omit<ProviderCatalog, 'providers'> {
  measured_at: string;
  /** When Refresh all last read every activated CLI's list; '' when never. */
  refreshed_at: string;
  providers: ProviderRows[];
}

const field = (section: string, key: string): string | undefined =>
  new RegExp(`^-\\s*\\*\\*${key}:\\*\\*\\s*\`(.+)\`\\s*$`, 'm').exec(section)?.[1]?.trim();
const isTier = (value: string): value is Tier => (TIERS as readonly string[]).includes(value);

/** `haiku=light sonnet=standard …` as pairs; a word with no known tier is dropped. */
function parseFamilies(value: string | undefined): Array<{ family: string; tier: Tier }> {
  return (value ?? '').split(/\s+/).flatMap((pair) => {
    const [family = '', tier = ''] = pair.toLowerCase().split('=');
    return family && isTier(tier) ? [{ family, tier }] : [];
  });
}

/** The longest family word that stands whole in the id (`flash-lite` before `flash`); undefined when none. */
function familyOf(id: string, families: ProviderCatalogEntry['families'] = []): { family: string; tier: Tier } | undefined {
  const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...families]
    .sort((a, b) => b.family.length - a.family.length)
    .find(({ family }) => new RegExp(`(^|[-._/])${escape(family)}($|[-._/])`, 'i').test(id));
}

/** The tier of the id's family word; '' when none. */
export function familyTier(id: string, families: ProviderCatalogEntry['families'] = []): Tier | '' {
  return familyOf(id, families)?.tier ?? '';
}

/** The numbers in an id, in order (`gpt-6.2-sol` → 6,2; `claude-opus-5-5` → 5,5): its version. */
const versionOf = (id: string): number[] => (id.match(/\d+/g) ?? []).map(Number);
const newer = (a: number[], b: number[]): boolean => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
};

/**
 * THE ONE TIER RULE (owner, 19 Nov 2026, KAN-726): at most one model per tier per provider.
 * A tier's model is the newest id of the first family the catalog names for that tier that
 * the CLI lists; a tie goes to the CLI's order. Older versions, other families of the same
 * tier and ids no family word fits drop out. Frontier first, then Standard, then Light.
 * A provider whose catalog names no families keeps the CLI's list as it is.
 */
export function oneModelPerTier<T extends ModelRow>(rows: readonly T[], families: ProviderCatalogEntry['families'] = []): T[] {
  if (!families.length) return [...rows];
  return [...TIERS].reverse().flatMap((tier) => {
    const order = families.filter((f) => f.tier === tier).map((f) => f.family);
    let best: { row: T; rank: number; version: number[] } | undefined;
    for (const row of rows) {
      const hit = familyOf(row.id, families);
      if (hit?.tier !== tier) continue;
      const rank = order.indexOf(hit.family);
      const version = versionOf(row.id);
      if (!best || rank < best.rank || (rank === best.rank && newer(version, best.version))) best = { row, rank, version };
    }
    return best ? [best.row] : [];
  });
}

/** `## Tiers` table: each tier's strengths in a few plain words, for every provider. */
function parseTierStrengths(raw: string): Partial<Record<Tier, string>> {
  const section = /^## Tiers\s*$([\s\S]*?)(?=^## |^### |(?![\s\S]))/m.exec(raw)?.[1] ?? '';
  const out: Partial<Record<Tier, string>> = {};
  for (const line of section.split('\n')) {
    const [, tier = '', strengths = ''] = /^\|\s*\**([a-z]+)\**\s*\|\s*([^|]+?)\s*\|/i.exec(line.trim()) ?? [];
    if (isTier(tier.toLowerCase()) && strengths) out[tier.toLowerCase() as Tier] = strengths;
  }
  return out;
}

/**
 * The file's `### <Vendor>` sections as catalog sections, keyed by the `provider` id the
 * section declares (the identity a launch names; a label like "Nous Research" is prose).
 * A section that declares no id keeps its heading as its key, so it still merges by name.
 */
export function providerSections(raw: string, origin: Origin): CatalogSection[] {
  const out: CatalogSection[] = [];
  for (const chunk of raw.split(/^### /m).slice(1)) {
    const lines = chunk.split('\n');
    const head = (lines[0] ?? '').trim();
    if (!head) continue;
    out.push({ name: field(chunk, 'provider') ?? head, head, lines: lines.slice(1), origin, shadowed: false });
  }
  return out;
}

/** One section's entry, or null when it names no provider or CLI. */
function parseProviderSection(section: CatalogSection): ProviderCatalogEntry | null {
  const body = section.lines.join('\n');
  const label = section.head;
  const provider = field(body, 'provider');
  const cli = field(body, 'cli');
  if (!label || !provider || !cli) return null;
  const entry = parseProviderCatalog(`### ${label}\n${body}`)[0];
  return entry ? { ...entry, origin: section.origin, shadowed: section.shadowed } : null;
}

/** A user section withdraws the shipped provider of its id with the house's hidden marker. */
function isWithdrawal(section: CatalogSection): boolean {
  if (section.origin !== 'user') return false;
  return section.lines.some((l) => /^-\s*\*\*hidden:\*\*\s*yes\b/i.test(l.trim()));
}

/**
 * One `### <Vendor>` section per provider with provider/model facts. Agent documents own
 * executable launch grammar; this parser deliberately creates no commands.
 * This reads ONE file; `readProviderCatalog` layers the owner's copy on stock.
 */
export function parseProviderCatalog(raw: string, origin: Origin = 'stock'): ProviderCatalogEntry[] {
  const out: ProviderCatalogEntry[] = [];
  for (const section of raw.split(/^### /m).slice(1)) {
    const label = (section.split('\n')[0] ?? '').trim();
    const provider = field(section, 'provider');
    const cli = field(section, 'cli');
    if (!label || !provider || !cli) continue;
    const maturity = field(section, 'maturity');
    const families = parseFamilies(field(section, 'families'));
    out.push({
      provider, cli, label, origin, shadowed: false, launchable: maturity !== 'comingSoon',
      ...(maturity ? { maturity } : {}),
      ...(field(section, 'connections') === 'configured' ? { connections: true } : {}),
      ...(families.length ? { families } : {}),
    });
  }
  return out;
}

export const STOCK_CATALOG_MD = path.join(STOCK_DIR, CATALOG_FILE);
export const userCatalogMd = (): string => path.join(storeDir('custom'), CATALOG_FILE);

async function exists(file: string): Promise<boolean> {
  try { await stat(file); return true; } catch { return false; }
}

/**
 * The catalog as this machine resolves it: stock, with the owner's copy laid over it per
 * provider section. A missing or empty owner's copy is the ordinary path and yields exactly
 * the shipped list. The merge is the house's (`mergeSections`): a user section of a stock id
 * replaces it in place, a new id appends, and `- **hidden:** yes` withdraws it.
 */
export async function readProviderCatalog(): Promise<ProviderCatalog> {
  const user = userCatalogMd();
  const hasUser = await exists(user);
  const [stockRaw, userRaw] = await Promise.all([readFile(STOCK_CATALOG_MD, 'utf8'), hasUser ? readUserCatalog(CATALOG_FILE) : Promise.resolve('')]);
  const stock = providerSections(stockRaw, 'stock');
  const mine = providerSections(userRaw, 'user');
  const withdrawing = new Set(mine.filter(isWithdrawal).map((s) => s.name));
  const merged = mergeSections(stock, mine.filter((s) => !withdrawing.has(s.name)));
  const providers: ProviderCatalogEntry[] = [];
  const withdrawn: ProviderCatalog['withdrawn'] = [];
  for (const section of merged) {
    if (withdrawing.has(section.name)) {
      if (section.origin === 'stock') withdrawn.push({ provider: section.name, label: section.head });
      continue;
    }
    const entry = parseProviderSection(section);
    if (entry) providers.push(entry);
  }
  const own = parseTierStrengths(userRaw);
  return {
    origin: hasUser ? 'user' : 'stock',
    path: hasUser ? user : STOCK_CATALOG_MD,
    providers,
    withdrawn,
    strengths: Object.keys(own).length ? own : parseTierStrengths(stockRaw),
  };
}

export async function listProviderCatalog(): Promise<ProviderCatalogEntry[]> {
  return (await readProviderCatalog()).providers;
}

/* ---------------------------------------------------------------------------------- */
/* THE CAMPAIGN'S PROVIDER SUMMARY — what this machine measured, dated.                */
/* ---------------------------------------------------------------------------------- */

/** One model as its CLI lists it: the id a launch uses, and the CLI's own name for it. */
export interface ModelRow {
  id: string;
  name: string;
}

export interface ModelConnection {
  provider: string;
  label: string;
  rows: ModelRow[];
}

/** A CLI's own model list as Ronin last read it. Rows are in the CLI's order. */
export interface ModelList {
  connections?: ModelConnection[];
  /** When Ronin read it. */
  read_at: string;
  /** The CLI version installed at that read; '' when it would not say. */
  by: string;
  rows: ModelRow[];
  /** Why there are no rows: the CLI publishes no readable list, or none was found. */
  unavailable?: string;
}

/**
 * Written at Ronin start and after a sign-in closes (machine facts, the recorded lists
 * carried forward), and by Refresh all (machine facts, every activated CLI's list read
 * again, npm asked for the newest release). Read by everything else. A stale summary
 * shows its dates. It is never guessed.
 */
export interface ProviderSummary {
  measured_at: string;
  /** When Refresh all last ran: every activated CLI's list read, npm asked; '' when never. */
  refreshed_at: string;
  /** CLI ids found on this machine's login-shell PATH. */
  installed: string[];
  /** CLI ids whose own credential file is on this machine. Presence only; never read. */
  signed_in: string[];
  /** CLI ids that can launch: installed, signed in or recorded, not off, and holding a catalog cell. */
  operational: string[];
  /** Installed CLI ids the owner turned off; the sign-in is kept. */
  off: string[];
  activated_count: number;
  /** Where each installed CLI was found. */
  paths: Record<string, string>;
  /** Each installed CLI's own version, as its `--version` printed it; absent when it would not say. */
  versions: Record<string, string>;
  /** Each activated CLI's own model list as last read; absent until Refresh all has read it. */
  models: Record<string, ModelList>;
  /**
   * The newest version its package source offers, asked only on Refresh all — never on an
   * ordinary measure, since each ask is an outbound request with an egress line. Kept
   * from the last Refresh until the next; absent for a CLI with no source Ronin can ask.
   */
  latest: Record<string, { version: string; checked_at: string }>;
}

const idList = (v: unknown): string[] => Array.isArray(v)
  ? [...new Set(v.filter((x): x is string => typeof x === 'string' && /^[a-z0-9_-]+$/.test(x)))]
  : [];
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

/** One recorded list, or null when malformed. */
function parseModelList(value: unknown): ModelList | null {
  const item = record(value);
  if (typeof item.read_at !== 'string' || !item.read_at || !Array.isArray(item.rows)) return null;
  const rows: ModelRow[] = [];
  for (const row of item.rows) {
    const r = record(row);
    if (typeof r.id !== 'string' || !r.id) return null;
    rows.push({ id: r.id, name: typeof r.name === 'string' && r.name ? r.name : r.id });
  }
  return {
    read_at: item.read_at,
    by: typeof item.by === 'string' ? item.by : '',
    rows,
    ...(Array.isArray(item.connections) ? { connections: item.connections.flatMap(value => {
      const connection = record(value);
      if (typeof connection.provider !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/.test(connection.provider)) return [];
      const list = parseModelList({ read_at: item.read_at, rows: connection.rows });
      return list ? [{ provider: connection.provider, label: typeof connection.label === 'string' ? connection.label : connection.provider, rows: list.rows }] : [];
    }) } : {}),
    ...(typeof item.unavailable === 'string' && item.unavailable ? { unavailable: item.unavailable } : {}),
  };
}

/**
 * A list recorded before 2026-09-25 under `model_lists` (the CLI's raw cache shape, with
 * `fetched_at`, `client_version` and `models[{slug, display_name, visibility}]`), read
 * once into today's shape so a store move never blanks the install.
 */
function parseLegacyModelList(value: unknown): ModelList | null {
  const item = record(value);
  if (typeof item.fetched_at !== 'string' || !item.fetched_at || !Array.isArray(item.models)) return null;
  const rows: ModelRow[] = [];
  for (const model of item.models) {
    const m = record(model);
    if (typeof m.slug !== 'string' || !m.slug || m.visibility !== 'list') continue;
    rows.push({ id: m.slug, name: typeof m.display_name === 'string' && m.display_name ? m.display_name : m.slug });
  }
  return { read_at: item.fetched_at, by: typeof item.client_version === 'string' ? item.client_version : '', rows };
}

/** The summary as a record holds it, or null when the record carries none or a malformed one. */
export function parseProviderSummary(value: unknown): ProviderSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.measured_at !== 'string' || !v.measured_at.trim()) return null;
  const operational = idList(v.operational);
  const paths: Record<string, string> = {};
  for (const [id, where] of Object.entries(record(v.paths))) if (typeof where === 'string' && where) paths[id] = where;
  const versions: Record<string, string> = {};
  for (const [id, version] of Object.entries(record(v.versions))) if (typeof version === 'string' && version) versions[id] = version;
  const latest: ProviderSummary['latest'] = {};
  for (const [id, row] of Object.entries(record(v.latest))) {
    const { version, checked_at } = record(row);
    if (typeof version === 'string' && version && typeof checked_at === 'string' && checked_at) latest[id] = { version, checked_at };
  }
  const models: Record<string, ModelList> = {};
  const source = v.models !== undefined ? record(v.models) : record(v.model_lists);
  const parse = v.models !== undefined ? parseModelList : parseLegacyModelList;
  for (const [id, row] of Object.entries(source)) {
    const list = parse(row);
    if (list) models[id] = list;
  }
  return {
    measured_at: v.measured_at,
    refreshed_at: typeof v.refreshed_at === 'string' ? v.refreshed_at : '',
    installed: idList(v.installed),
    signed_in: idList(v.signed_in),
    operational,
    off: idList(v.off),
    activated_count: operational.length,
    paths,
    versions,
    models,
    latest,
  };
}

/** True when `candidate` is a newer release than `installed`, comparing dotted numbers; false when either is unreadable. */
export function newerVersion(installed: string, candidate: string): boolean {
  const nums = (s: string) => /\d+(?:\.\d+)*/.exec(s)?.[0].split('.').map(Number);
  const a = nums(installed); const b = nums(candidate);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0; const y = b[i] ?? 0;
    if (x !== y) return y > x;
  }
  return false;
}

/* ---------------------------------------------------------------------------------- */
/* THE ONE JOIN                                                                        */
/* ---------------------------------------------------------------------------------- */

const NATIVE_NAME = 'Native';
/** A model id goes into a command line: only the characters CLIs actually use in one. */
const SAFE_MODEL_ID = /^[A-Za-z0-9._:/-]+$/;

/** The Agent page's launch grammar for a CLI, or null when no page serves it. */
async function grammarOf(cli: string): Promise<AgentLaunches | null> {
  try { return await readAgentLaunches(cli); } catch { return null; }
}

/**
 * Every provider with its joined rows: Native first, then one model per tier
 * (`oneModelPerTier`), Frontier to Light, each with its tier's strengths. Providers this
 * machine can launch come first; catalog order holds within each group. A provider whose
 * CLI has no Agent page has no rows at all.
 */
export async function providerRows(summary: ProviderSummary | null, catalog?: ProviderCatalog): Promise<ProviderRows[]> {
  const resolved = catalog ?? await readProviderCatalog();
  const roots = resolved.providers;
  const strengthsOf = (tier: Tier | '') => (tier && resolved.strengths[tier]) || '';
  const entries = roots.flatMap(entry => {
    if (entry.cli === 'hermes') return [{ ...entry, provider: 'hermes', label: 'Hermes', connections: false }];
    if (!entry.connections) return [entry];
    const connections = summary?.models?.[entry.cli]?.connections ?? [];
    if (!connections.length) return [entry];
    return connections.map(connection => {
      const vendor = roots.find(row => row.provider === connection.provider);
      return { ...entry, provider: `${entry.cli}_${Buffer.from(connection.provider).toString('hex')}`,
        label: vendor?.label || connection.label, inference_provider: connection.provider,
        connection_rows: connection.rows,
        families: vendor?.families ?? entry.families };
    });
  });
  const operational = new Set(summary?.operational ?? []);
  const turnedOff = new Set(summary?.off ?? []);
  const joined = await Promise.all(entries.map(async (entry): Promise<ProviderRows> => {
    const agent = AGENTS.find((candidate) => candidate.id === entry.cli);
    const off = turnedOff.has(entry.cli);
    if (entry.cli === 'hermes') {
      const settings = await readHermesSettings();
      const grammar = entry.launchable ? await grammarOf(entry.cli) : null;
      const on = !!grammar && (summary?.installed ?? []).includes('hermes') && !off;
      const models: ProviderRow[] = settings.setups.filter(setup => settings.connections.some(c => c.id === setup.connection)).map((setup, index) => ({
        provider: 'hermes', cli: 'hermes', provider_label: 'Hermes', cli_label: 'Hermes', operational: on, off,
        selectable: on, origin: entry.origin, shadowed: entry.shadowed, model: setup.id, name: setup.name,
        cmd: grammar ? commandText(renderLaunch(grammar.model, { model: setup.model })) : '',
        ...(grammar?.modelDangerously.length ? { dangerousCmd: commandText(renderLaunch(grammar.modelDangerously, { model: setup.model })) } : {}),
        tier: '', strengths: '', default: index === 0,
      }));
      return { ...entry, provider: 'hermes', label: 'Hermes', cli_label: 'Hermes', operational: on && models.length > 0, off,
        models, launch_modes: ['configured', 'live_dangerously'] };
    }

    const on = operational.has(entry.cli) && (!entry.connections || !!entry.connection_rows?.length);
    const base = {
      provider: entry.provider, cli: entry.cli, provider_label: entry.label, cli_label: agent?.label ?? entry.cli,
      operational: on, off, selectable: on, origin: entry.origin, shadowed: entry.shadowed,
      ...(entry.connections && !entry.inference_provider ? { unavailable_reason: 'No API connections configured' } : {}),
    };
    const grammar = entry.launchable ? await grammarOf(entry.cli) : null;
    const models: ProviderRow[] = [];
    let launch: Pick<ProviderRows, 'native' | 'nativeDangerousCmd' | 'launch_modes'> = {};
    if (grammar) {
      const values = (model = '') => ({ provider: entry.inference_provider || entry.provider, model });
      const native = commandText(renderLaunch(grammar.native, values()));
      const dangerous = grammar.nativeDangerously.length || grammar.modelDangerously.length;
      launch = {
        native,
        launch_modes: dangerous ? ['configured', 'live_dangerously'] : ['configured'],
        ...(grammar.nativeDangerously.length ? { nativeDangerousCmd: commandText(renderLaunch(grammar.nativeDangerously, values())) } : {}),
      };
      if (!entry.inference_provider) models.push({
        ...base, model: NATIVE_MODEL, name: NATIVE_NAME, cmd: native,
        ...(launch.nativeDangerousCmd ? { dangerousCmd: launch.nativeDangerousCmd } : {}),
        tier: '', strengths: '', default: true,
      });
      const listed = (entry.connection_rows ?? summary?.models?.[entry.cli]?.rows ?? []).filter((row) => SAFE_MODEL_ID.test(row.id));
      for (const row of oneModelPerTier(listed, entry.families)) {
        const tier = familyTier(row.id, entry.families);
        models.push({
          ...base, model: row.id, name: row.name || row.id,
          cmd: commandText(renderLaunch(grammar.model, values(row.id))),
          ...(grammar.modelDangerously.length ? { dangerousCmd: commandText(renderLaunch(grammar.modelDangerously, values(row.id))) } : {}),
          tier, strengths: strengthsOf(tier), default: !!entry.inference_provider && models.length === 0,
        });
      }
    }
    const { families: _families, connection_rows: _connectionRows, ...rest } = entry;
    return { ...rest, cli_label: base.cli_label, operational: on, off, ...launch, models };
  }));
  // A part's provider (Ronin models, in a hosted office) leads, apart from every CLI's list.
  const parts = await partProviderRows();
  return [...parts, ...joined.filter((entry) => entry.operational), ...joined.filter((entry) => !entry.operational)];
}

/** The joined rows flat: what a launch resolves against. */
export async function listSessionLaunchSpecs(summary: ProviderSummary | null = null): Promise<SessionLaunchSpec[]> {
  return (await providerRows(summary)).flatMap((entry) => entry.models);
}

/** The one catalog read for the client: the catalog's own facts, the dates, and the joined rows. */
export async function providerCatalogAnswer(summary: ProviderSummary | null): Promise<ProviderCatalogAnswer> {
  const catalog = await readProviderCatalog();
  const { providers: _entries, ...facts } = catalog;
  return {
    ...facts,
    measured_at: summary?.measured_at ?? '',
    refreshed_at: summary?.refreshed_at ?? '',
    providers: await providerRows(summary, catalog),
  };
}

/** A provider's own default row: Native, else its first. */
export function providerDefault(specs: readonly SessionLaunchSpec[], provider: string): SessionLaunchSpec | undefined {
  const own = specs.filter((spec) => spec.provider === provider);
  return own.find((spec) => spec.default) ?? own[0];
}
