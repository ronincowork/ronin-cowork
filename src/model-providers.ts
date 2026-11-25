import { modelServices } from './model-services.js';
/**
 * THE PROVIDERS AND THE ONE JOIN — every model row a picker offers or a launch runs.
 *
 * Three records, one join (KAN-829; plan ronin_hosted/model-catalog):
 *
 * - THE CLIS (`src/agents.ts`): each CLI with its vendor, the vendor id a launch names.
 * - THE CAMPAIGN'S PROVIDER SUMMARY: what this machine measured, dated, hung on the
 *   Campaign record. Its `models` are each activated CLI's own list, read on every refresh
 *   and never guessed. The CLI is the one source of truth for what can be launched.
 * - HQ'S MODEL CATALOG (`src/model-catalog.ts`): each CLI model's tier, its "use it for" line
 *   and its facts, keyed by cli + id. It never grants a model: a catalog row the CLI doesn't
 *   list is not offered.
 *
 * `providerRows` is the one join: Native first, then every model the CLI lists, grouped by
 * the catalog's tier (Frontier, Standard, Light, in the catalog's order within each), then
 * Unrated (a listed model the catalog lacks, in the CLI's order, with no line). Each row has
 * its `model` (the id every launch uses), its `name` (the CLI's own display name, which
 * carries the version — "Opus 5.5"), its `use_for` line and its facts. Launches, Mika, machine
 * settings and every picker read these rows; no client joins anything.
 */
import { AGENTS } from './agents.js';
import { commandText, readAgentLaunches, renderLaunch, type AgentLaunches } from './agent-launches.js';
import { readModelCatalog, type CatalogModel, type ModelCatalog } from './model-catalog.js';
import { partProviderRows } from './provider-parts.js';

export const TIERS = ['light', 'standard', 'frontier'] as const;
export type Tier = typeof TIERS[number];
/** A model the CLI lists that the catalog lacks. */
export const UNRATED = 'unrated';
export const NATIVE_MODEL = 'native';
export const isTier = (value: unknown): value is Tier => (TIERS as readonly unknown[]).includes(value);

/** One CLI's vendor, as `src/agents.ts` declares it. */
export interface ProviderEntry {
  provider: string;
  cli: string;
  /** The vendor's name: Anthropic, OpenAI, … */
  label: string;
  /** Optional display status for a provider that is beta or not offered yet. */
  maturity?: string;
  /** False for a `comingSoon` provider: shown, never launched. */
  launchable: boolean;
}

/** Every CLI's vendor, in the registry's order. */
export function listProviders(): ProviderEntry[] {
  return AGENTS.map((agent) => {
    const { provider, label, maturity } = agent.vendor;
    return { provider, cli: agent.id, label, launchable: maturity !== 'comingSoon', ...(maturity ? { maturity } : {}) };
  });
}

/** A model's facts as HQ's catalog has them; an absent fact is absent. */
export type ModelFacts = Pick<CatalogModel, 'context' | 'output' | 'price' | 'released' | 'knowledge' | 'reasoning' | 'tools'>;

/** ONE JOINED ROW: what a launch runs and what a picker shows. */
export interface SessionLaunchSpec {
  service_id?: string;
  service_name?: string;
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
  /** The catalog's tier; `unrated` for a listed model the catalog lacks; '' for Native and setups. */
  tier: Tier | typeof UNRATED | '';
  /** The catalog's "use it for" line; absent when it has none. */
  use_for?: string;
  /** The catalog's facts; absent when it has none. */
  facts?: ModelFacts;
  /** Native: the row a launch naming this provider and no model gets when no preference is set. */
  default: boolean;
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
}

export interface ProviderRows extends ProviderEntry {
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

/** What `GET /api/provider-catalog` answers: the dates of the record, and the joined rows. */
export interface ProviderCatalogAnswer {
  measured_at: string;
  /** When Refresh all last read every activated CLI's list; '' when never. */
  refreshed_at: string;
  /** When HQ's catalog was made; '' when none has arrived. */
  catalog_at: string;
  providers: ProviderRows[];
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
  /** CLI ids that can launch: installed, signed in or recorded, not off, and launchable. */
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
/** The picker's groups, in order. */
const GROUPS = ['frontier', 'standard', 'light', UNRATED] as const;

/** The Agent page's launch grammar for a CLI, or null when no page serves it. */
async function grammarOf(cli: string): Promise<AgentLaunches | null> {
  try { return await readAgentLaunches(cli); } catch { return null; }
}

/**
 * A CLI's listed models, each with its catalog row (or none), grouped by the catalog's tier:
 * Frontier, Standard, Light in the catalog's order, then Unrated in the CLI's order. A catalog
 * row the CLI doesn't list is not offered.
 */
function rated(listed: readonly ModelRow[], cli: string, catalog: ModelCatalog): Array<{ row: ModelRow; tier: typeof GROUPS[number]; at?: CatalogModel; order: number }> {
  const own = catalog.models.filter((m) => m.cli === cli);
  const out = listed.map((row, index) => {
    const at = own.find((m) => m.id === row.id);
    const tier: typeof GROUPS[number] = at && isTier(at.tier) ? at.tier : UNRATED;
    return { row, tier, at: tier === UNRATED ? undefined : at, order: tier === UNRATED ? index : own.indexOf(at!) };
  });
  return out.sort((a, b) => GROUPS.indexOf(a.tier) - GROUPS.indexOf(b.tier) || a.order - b.order);
}

const factsOf = (m: CatalogModel): ModelFacts | undefined => {
  const { cli: _cli, id: _id, name: _name, tier: _tier, use_for: _use, ...facts } = m;
  return Object.keys(facts).length ? facts : undefined;
};

/**
 * Every provider with its joined rows: Native first, then every model its CLI lists, grouped
 * by tier. Providers this machine can launch come first; the registry's order holds within
 * each group. A provider whose CLI has no Agent page has no rows at all.
 */
export async function providerRows(summary: ProviderSummary | null, catalog?: ModelCatalog): Promise<ProviderRows[]> {
  const models = catalog ?? await readModelCatalog();
  const operational = new Set(summary?.operational ?? []);
  const turnedOff = new Set(summary?.off ?? []);
  const services = await modelServices();
  const joined = await Promise.all(listProviders().map(async (entry): Promise<ProviderRows> => {
    const agent = AGENTS.find((candidate) => candidate.id === entry.cli);
    const off = turnedOff.has(entry.cli);
    const on = operational.has(entry.cli);
    const base = {
      provider: entry.provider, cli: entry.cli, provider_label: entry.label, cli_label: agent?.label ?? entry.cli,
      operational: on, off, selectable: on,
    };
    const grammar = entry.launchable ? await grammarOf(entry.cli) : null;
    const rows: ProviderRow[] = [];
    let launch: Pick<ProviderRows, 'native' | 'nativeDangerousCmd' | 'launch_modes'> = {};
    if (grammar && entry.cli !== 'hermes') {
      const values = (model = '') => ({ provider: entry.provider, model });
      const native = commandText(renderLaunch(grammar.native, values()));
      const dangerous = grammar.nativeDangerously.length || grammar.modelDangerously.length;
      launch = {
        native,
        launch_modes: dangerous ? ['configured', 'live_dangerously'] : ['configured'],
        ...(grammar.nativeDangerously.length ? { nativeDangerousCmd: commandText(renderLaunch(grammar.nativeDangerously, values())) } : {}),
      };
      rows.push({
        ...base, model: NATIVE_MODEL, name: NATIVE_NAME, cmd: native,
        ...(launch.nativeDangerousCmd ? { dangerousCmd: launch.nativeDangerousCmd } : {}),
        tier: '', default: true,
      });
      const listed = (summary?.models?.[entry.cli]?.rows ?? []).filter((row) => SAFE_MODEL_ID.test(row.id));
      for (const { row, tier, at } of rated(listed, entry.cli, models)) {
        const facts = at && factsOf(at);
        rows.push({
          ...base, model: row.id, name: row.name || row.id,
          cmd: commandText(renderLaunch(grammar.model, values(row.id))),
          ...(grammar.modelDangerously.length ? { dangerousCmd: commandText(renderLaunch(grammar.modelDangerously, values(row.id))) } : {}),
          tier, ...(at?.use_for ? { use_for: at.use_for } : {}), ...(facts ? { facts } : {}), default: false,
        });
      }
    }
    if (entry.cli === 'hermes' && grammar) launch.launch_modes = ['configured', 'live_dangerously'];
    const canUseService = !!grammar && !off && !!summary?.installed.includes(entry.cli);
    for (const service of services) {
      if (!grammar || !service.configured || !service.bound.includes(entry.cli)) continue;
      for (const setup of service.models) {
        const marker = 'service:' + setup.id;
        rows.push({ ...base, model: entry.cli === 'hermes' ? setup.id : marker, name: setup.name,
          service_id: service.id, service_name: service.name,
          cmd: commandText(renderLaunch(grammar.model, { model: marker })),
          ...(grammar.modelDangerously.length ? { dangerousCmd: commandText(renderLaunch(grammar.modelDangerously, { model: marker })) } : {}),
          selectable: canUseService, operational: canUseService, tier: '', default: rows.length === 0 });
      }
    }
    const ready = rows.some(row => row.operational);
    return { ...entry, cli_label: base.cli_label, operational: ready, off, ...launch, models: rows };
  }));
  // A part's provider (Ronin models, in a hosted office) leads, apart from every CLI's list.
  const parts = await partProviderRows();
  return [...parts, ...joined.filter((entry) => entry.operational), ...joined.filter((entry) => !entry.operational)];
}

/** The joined rows flat: what a launch resolves against. */
export async function listSessionLaunchSpecs(summary: ProviderSummary | null = null): Promise<SessionLaunchSpec[]> {
  return (await providerRows(summary)).flatMap((entry) => entry.models);
}

/** The one read for the client: the dates, and the joined rows. */
export async function providerCatalogAnswer(summary: ProviderSummary | null): Promise<ProviderCatalogAnswer> {
  const catalog = await readModelCatalog();
  return {
    measured_at: summary?.measured_at ?? '',
    refreshed_at: summary?.refreshed_at ?? '',
    catalog_at: catalog.at ?? '',
    providers: await providerRows(summary, catalog),
  };
}

/** A provider's own default row: Native, else its first. */
export function providerDefault(specs: readonly SessionLaunchSpec[], provider: string): SessionLaunchSpec | undefined {
  const own = specs.filter((spec) => spec.provider === provider);
  return own.find((spec) => spec.default) ?? own[0];
}
