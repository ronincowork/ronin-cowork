/**
 * THE PROVIDER CATALOG AND THE ONE JOIN — every model row a picker offers or a launch runs.
 *
 * Two records, one join, two names per model (owner's ruling, 2026-09-25):
 *
 * - THE CATALOG (`ronin_catalogs/MODEL_PROVIDERS.md`, stock; the owner's copy in the
 *   catalogs store is an OVERLAY on it, merged per `### <Vendor>` section and keyed by
 *   the section's `provider` id — `docs/architecture/shadowing.md`). It joins the vendor
 *   id a launch names to the CLI that serves it (`src/agents.ts`), and carries
 *   descriptive metadata per model id: tier, a dated cost reading, good at, not good at.
 *   It never says what is available.
 * - THE CAMPAIGN'S PROVIDER SUMMARY: what this machine measured, dated, hung on the
 *   Campaign record. Its `models` are each activated CLI's own list, read on Refresh all
 *   and never guessed. The CLI is the one source of truth for what can be launched.
 *
 * `providerRows` is the one join: Native first, then every model the CLI listed, in the
 * CLI's order, each with its `model` (the id every launch uses) and `name` (the CLI's
 * own display name, which carries the version — "Opus 5.5"), enriched by the catalog row
 * of the same id when there is one. Launches, Mika, machine settings and every picker read
 * these rows; no client joins anything.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { mergeSections, readUserCatalog, STOCK_DIR, storeDir, type CatalogSection, type Origin } from './resources.js';
import { commandText, readAgentLaunches, renderLaunch, type AgentLaunches } from './agent-launches.js';
import { AGENTS } from './agents.js';

export const CATALOG_FILE = 'MODEL_PROVIDERS.md';
export const TIERS = ['light', 'standard', 'frontier'] as const;
export type Tier = typeof TIERS[number];
export const NATIVE_MODEL = 'native';

/** One catalog row: descriptive metadata for a model id, keyed by the id the CLI reports. */
export interface CatalogModel {
  /** The full model id passed to the CLI, unchanged. */
  model: string;
  tier: Tier;
  /** The vendor's public list price, dated — a reading, not a contract. */
  cost: string;
  good_at: string;
  not_good_at: string;
}

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
  models: CatalogModel[];
}

export interface ProviderCatalog {
  /** 'user' when the owner's copy exists and takes part; the per-entry `origin` says which sections are theirs. */
  origin: Origin;
  /** The owner's copy when there is one, else the stock file. */
  path: string;
  /** The `updated` day of the file at `path`, `YYYY-MM-DD`; '' when it carries none — never borrowed from the other layer. */
  updated: string;
  /** The stock file's own `updated` day, whichever layer `path` names. */
  stock_updated: string;
  providers: ProviderCatalogEntry[];
  /** Shipped providers the owner's copy withdrew with `- **hidden:** yes`. */
  withdrawn: Array<{ provider: string; label: string }>;
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
  /** '' for a listed model the catalog has no row for. */
  tier: Tier | '';
  /** Native: the row a launch naming this provider and no model gets when no preference is set. */
  default: boolean;
  cost: string;
  good_at: string;
  not_good_at: string;
}

/** A joined row as the client paints it: the launch spec plus what this machine can do with it. */
export interface ProviderRow extends SessionLaunchSpec {
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

export interface ProviderRows extends Omit<ProviderCatalogEntry, 'models'> {
  cli_label: string;
  operational: boolean;
  off: boolean;
  /** Complete ordinary CLI launch with model choice delegated to the CLI; absent when no Agent page serves this CLI. */
  native?: string;
  nativeDangerousCmd?: string;
  launch_modes?: Array<'configured' | 'live_dangerously'>;
  models: ProviderRow[];
}

/** What `GET /api/provider-catalog` answers: the catalog's own facts, and the joined rows. */
export interface ProviderCatalogAnswer extends Omit<ProviderCatalog, 'providers'> {
  measured_at: string;
  /** When Refresh all last read every activated CLI's list; '' when never. */
  refreshed_at: string;
  providers: ProviderRows[];
}

const cellsOf = (line: string): string[] => {
  const c = line.split('|').map((s) => s.trim());
  return c[0] === '' && c[c.length - 1] === '' ? c.slice(1, -1) : c;
};
const unquote = (s: string): string => s.replace(/^`(.*)`$/s, '$1').trim();
const isSeparator = (cells: string[]): boolean => cells.every((c) => /^:?-+:?$/.test(c));
const field = (section: string, key: string): string | undefined =>
  new RegExp(`^-\\s*\\*\\*${key}:\\*\\*\\s*\`(.+)\`\\s*$`, 'm').exec(section)?.[1]?.trim();
const asTier = (value: string): Tier => (TIERS as readonly string[]).includes(value) ? value as Tier : 'standard';

/** The header's `- **updated:** YYYY-MM-DD`, read before the first provider section; '' when absent. */
export function catalogUpdated(raw: string): string {
  const preamble = raw.split(/^### /m)[0] ?? '';
  return /^-\s*\*\*updated:\*\*\s*(\d{4}-\d{2}-\d{2})\s*$/m.exec(preamble)?.[1] ?? '';
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
    const rows = new Map<string, Record<string, string>>();
    let header: string[] = [];
    for (const line of section.split('\n')) {
      if (!line.includes('|')) { header = []; continue; }
      const cells = cellsOf(line);
      if (cells.length < 2) continue;
      if (/^model$/i.test(cells[0])) { header = cells.map((c) => c.toLowerCase()); continue; }
      if (!header.length || isSeparator(cells)) continue;
      const model = unquote(cells[0]);
      if (!model) continue;
      const row = rows.get(model) ?? {};
      header.slice(1).forEach((name, i) => {
        const value = cells[i + 1];
        if (value !== undefined && value !== '') row[name] = value;
      });
      rows.set(model, row);
    }
    const models: CatalogModel[] = [];
    for (const [model, row] of rows) {
      models.push({
        model,
        tier: asTier((row.tier ?? '').toLowerCase()),
        cost: row.cost ?? '',
        good_at: row['good at'] ?? '',
        not_good_at: row['not good at'] ?? '',
      });
    }
    out.push({
      provider, cli, label, origin, shadowed: false, models,
      ...(maturity ? { maturity } : {}),
    });
  }
  return out;
}

export const STOCK_CATALOG_MD = path.join(STOCK_DIR, CATALOG_FILE);
export const userCatalogMd = (): string => path.join(storeDir('catalogs'), CATALOG_FILE);

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
  return {
    origin: hasUser ? 'user' : 'stock',
    path: hasUser ? user : STOCK_CATALOG_MD,
    updated: catalogUpdated(hasUser ? userRaw : stockRaw),
    stock_updated: catalogUpdated(stockRaw),
    providers,
    withdrawn,
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

/** A CLI's own model list as Ronin last read it. Rows are in the CLI's order. */
export interface ModelList {
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
const NATIVE_GOOD_AT = 'the CLI choosing its own configured or current default model';
const NATIVE_NOT_GOOD_AT = 'pinning a particular model';
/** A model id goes into a command line: only the characters CLIs actually use in one. */
const SAFE_MODEL_ID = /^[A-Za-z0-9._:/-]+$/;

/** The Agent page's launch grammar for a CLI, or null when no page serves it. */
async function grammarOf(cli: string): Promise<AgentLaunches | null> {
  try { return await readAgentLaunches(cli); } catch { return null; }
}

/**
 * Every provider with its joined rows: Native first, then each model the CLI listed, in
 * the CLI's order, enriched by the catalog row of the same id. Providers this machine can
 * launch come first; catalog order holds within each group. A provider whose CLI has no
 * Agent page has no rows at all.
 */
export async function providerRows(summary: ProviderSummary | null, catalog?: ProviderCatalogEntry[]): Promise<ProviderRows[]> {
  const entries = catalog ?? await listProviderCatalog();
  const operational = new Set(summary?.operational ?? []);
  const turnedOff = new Set(summary?.off ?? []);
  const joined = await Promise.all(entries.map(async (entry): Promise<ProviderRows> => {
    const agent = AGENTS.find((candidate) => candidate.id === entry.cli);
    const off = turnedOff.has(entry.cli);
    const on = operational.has(entry.cli);
    const base = {
      provider: entry.provider, cli: entry.cli, provider_label: entry.label, cli_label: agent?.label ?? entry.cli,
      operational: on, off, selectable: on, origin: entry.origin, shadowed: entry.shadowed,
    };
    const grammar = entry.models.length ? await grammarOf(entry.cli) : null;
    const models: ProviderRow[] = [];
    let launch: Pick<ProviderRows, 'native' | 'nativeDangerousCmd' | 'launch_modes'> = {};
    if (grammar) {
      const values = (model = '') => ({ provider: entry.provider, model });
      const native = commandText(renderLaunch(grammar.native, values()));
      const dangerous = grammar.nativeDangerously.length || grammar.modelDangerously.length;
      launch = {
        native,
        launch_modes: dangerous ? ['configured', 'live_dangerously'] : ['configured'],
        ...(grammar.nativeDangerously.length ? { nativeDangerousCmd: commandText(renderLaunch(grammar.nativeDangerously, values())) } : {}),
      };
      models.push({
        ...base, model: NATIVE_MODEL, name: NATIVE_NAME, cmd: native,
        ...(launch.nativeDangerousCmd ? { dangerousCmd: launch.nativeDangerousCmd } : {}),
        tier: '', default: true, cost: '', good_at: NATIVE_GOOD_AT, not_good_at: NATIVE_NOT_GOOD_AT,
      });
      const known = new Map(entry.models.map((row) => [row.model, row]));
      for (const listed of summary?.models?.[entry.cli]?.rows ?? []) {
        if (!SAFE_MODEL_ID.test(listed.id)) continue;
        const meta = known.get(listed.id);
        models.push({
          ...base, model: listed.id, name: listed.name || listed.id,
          cmd: commandText(renderLaunch(grammar.model, values(listed.id))),
          ...(grammar.modelDangerously.length ? { dangerousCmd: commandText(renderLaunch(grammar.modelDangerously, values(listed.id))) } : {}),
          tier: meta?.tier ?? '', default: false, cost: meta?.cost ?? '', good_at: meta?.good_at ?? '', not_good_at: meta?.not_good_at ?? '',
        });
      }
    }
    const { models: _catalogModels, ...rest } = entry;
    return { ...rest, cli_label: base.cli_label, operational: on, off, ...launch, models };
  }));
  return [...joined.filter((entry) => entry.operational), ...joined.filter((entry) => !entry.operational)];
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
    providers: await providerRows(summary, catalog.providers),
  };
}

/** A provider's own default row: Native, else its first. */
export function providerDefault(specs: readonly SessionLaunchSpec[], provider: string): SessionLaunchSpec | undefined {
  const own = specs.filter((spec) => spec.provider === provider);
  return own.find((spec) => spec.default) ?? own[0];
}
