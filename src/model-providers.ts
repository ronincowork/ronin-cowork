/**
 * THE PROVIDER CATALOG — one record of every model provider and every model Ronin offers.
 *
 * `ronin_catalogs/MODEL_PROVIDERS.md` is stock; a copy in the owner's catalogs store is an
 * OVERLAY on it, merged per `### <Vendor>` section and keyed by the section's `provider` id
 * — the same entry-merge macros get (`docs/shadowing.md`), so adding one provider or one
 * row does not fork the seven the owner did not touch. A user section of a stock id
 * replaces that section whole and keeps its place; a new id appends; a user section that
 * says `- **hidden:** yes`, or whose every launch cell is `—`, withdraws the stock one.
 * Every entry carries its `origin` and whether it shadowed a shipped section, so a surface
 * can SAY which layer a cell came from — a shadow nobody can see is the fault this replaces.
 * Each provider section carries the vendor id a launch names and the id of the CLI that
 * serves it (`src/agents.ts`), so the two are joined here, in data, and nowhere else. Each
 * model row carries its tier, a dated cost reading, what it is good at and not good at,
 * whether it is the provider's default, and the complete launch command — the
 * session_launch_spec.
 *
 * Each file's header carries `- **updated:** YYYY-MM-DD`, the day its prices, models and
 * descriptions were last read from the public record. It is a snapshot, refreshed with each
 * release (stock) or by the owner (their copy); readers show both dates, never hide either,
 * and never borrow one for the other.
 *
 * This module also holds the shape of the Campaign's measured provider summary, so that
 * the record and the catalog share one vocabulary; measuring and recording live in
 * `src/provider-summary.ts`.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { mergeSections, readUserCatalog, STOCK_DIR, storeDir, type CatalogSection, type Origin } from './resources.js';

export const CATALOG_FILE = 'MODEL_PROVIDERS.md';
export const TIERS = ['light', 'standard', 'frontier'] as const;
export type Tier = typeof TIERS[number];

export interface SessionLaunchSpec {
  /** The vendor id a launch names: `anthropic`, `openai`, … */
  provider: string;
  /** The id of the CLI that serves it in `src/agents.ts`: `claude`, `codex`, … */
  cli: string;
  /** The model id passed to the CLI, unchanged. */
  model: string;
  /** The complete interactive command for this model. */
  cmd: string;
  tier: Tier;
  /** The row a launch naming this provider and no model gets when no preference is set. */
  default: boolean;
  /** The vendor's public list price, dated — a reading, not a contract. */
  cost: string;
  good_at: string;
  not_good_at: string;
  liveDangerously?: string;
  gbrainDisconnected?: string;
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
  liveDangerously?: string;
  gbrainDisconnected?: string;
  models: SessionLaunchSpec[];
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
  /** Shipped providers the owner's copy withdrew — by `- **hidden:** yes`, or every launch cell `—`. */
  withdrawn: Array<{ provider: string; label: string }>;
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

/** A launch cell that says there is nothing to launch: the tombstone form of a row. */
const isTombstone = (cell: string): boolean => /^[—–-]$/.test(cell.trim());

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

/**
 * A user section withdraws the shipped provider of its id in either tombstone form: the
 * house's `- **hidden:** yes`, or every launch cell `—` — a table's way of saying nothing
 * here launches.
 */
function isWithdrawal(section: CatalogSection): boolean {
  if (section.origin !== 'user') return false;
  if (section.lines.some((l) => /^-\s*\*\*hidden:\*\*\s*yes\b/i.test(l.trim()))) return true;
  const cells = launchCells(section.lines.join('\n'));
  return cells.length > 0 && cells.every(isTombstone);
}

/** Every `launch` cell in a section's tables, unquoted, in order. */
function launchCells(section: string): string[] {
  const out: string[] = [];
  let header: string[] = [];
  for (const line of section.split('\n')) {
    if (!line.includes('|')) { header = []; continue; }
    const cells = cellsOf(line);
    if (cells.length < 2) continue;
    if (/^model$/i.test(cells[0])) { header = cells.map((c) => c.toLowerCase()); continue; }
    if (!header.length || isSeparator(cells)) continue;
    const at = header.indexOf('launch');
    if (at > 0 && cells[at] !== undefined) out.push(unquote(cells[at]));
  }
  return out;
}

/**
 * One `### <Vendor>` section per provider; under it `- **provider:**`, `- **cli:**` and the
 * launch-mode flags, then one or more tables whose header begins with `model`. A section
 * may spread a model's columns over several tables (facts in one, `launch` in another);
 * they are joined by model id, and the first table's row order is the picker's order.
 * This reads ONE file; `readProviderCatalog` layers the owner's copy on stock.
 */
export function parseProviderCatalog(raw: string, origin: Origin = 'stock'): ProviderCatalogEntry[] {
  const out: ProviderCatalogEntry[] = [];
  for (const section of raw.split(/^### /m).slice(1)) {
    const label = (section.split('\n')[0] ?? '').trim();
    const provider = field(section, 'provider');
    const cli = field(section, 'cli');
    if (!label || !provider || !cli) continue;
    const liveDangerously = field(section, 'live_dangerously');
    const gbrainDisconnected = field(section, 'gbrain_disconnected');
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
    const models: SessionLaunchSpec[] = [];
    for (const [model, row] of rows) {
      const cmd = unquote(row.launch ?? '');
      if (!cmd || isTombstone(cmd)) continue; // a model with no launch cell is a name, not a session_launch_spec
      models.push({
        provider, cli, model, cmd,
        tier: asTier((row.tier ?? '').toLowerCase()),
        default: /^yes$/i.test(row.default ?? ''),
        cost: row.cost ?? '',
        good_at: row['good at'] ?? '',
        not_good_at: row['not good at'] ?? '',
        ...(liveDangerously ? { liveDangerously } : {}),
        ...(gbrainDisconnected ? { gbrainDisconnected } : {}),
      });
    }
    out.push({
      provider, cli, label, origin, shadowed: false, models,
      ...(liveDangerously ? { liveDangerously } : {}),
      ...(gbrainDisconnected ? { gbrainDisconnected } : {}),
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
 * replaces it in place, a new id appends, `- **hidden:** yes` withdraws — and for this file
 * so does a section whose every launch cell is `—`, the tombstone a table can carry.
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

/** Every launch cell, flat, in catalog order: what the pickers and the launch resolve over. */
export async function listSessionLaunchSpecs(): Promise<SessionLaunchSpec[]> {
  return (await listProviderCatalog()).flatMap((entry) => entry.models);
}

/** A provider's own default row: the one marked `default`, else its first. */
export function providerDefault(specs: readonly SessionLaunchSpec[], provider: string): SessionLaunchSpec | undefined {
  const own = specs.filter((spec) => spec.provider === provider);
  return own.find((spec) => spec.default) ?? own[0];
}

/**
 * THE CAMPAIGN'S PROVIDER SUMMARY — what this machine measured, dated.
 *
 * Written by the runtime when a provider is signed in, activated or closed and at Ronin
 * start, and by the Setup Model providers surface's own probe; read by everything else.
 * A stale summary shows its date. It is never guessed.
 */
export interface ProviderSummary {
  measured_at: string;
  /** CLI ids found on this machine's login-shell PATH. */
  installed: string[];
  /** CLI ids whose own credential file is on this machine. Presence only; never read. */
  signed_in: string[];
  /** CLI ids that can launch: installed, signed in or recorded, and holding a catalog cell. */
  operational: string[];
  activated_count: number;
  /** Where each installed CLI was found. */
  paths: Record<string, string>;
  /** Each installed CLI's own version, as its `--version` printed it; absent when it would not say. */
  versions: Record<string, string>;
  /** A CLI-owned model list, stamped by the CLI version that fetched it. */
  model_lists: Record<string, CliModelList>;
  /**
   * The newest version its package source offers, asked only on Refresh — never on an
   * ordinary measure, since each ask is an outbound request with an egress line. Kept
   * from the last Refresh until the next; absent for a CLI with no source Ronin can ask.
   */
  latest: Record<string, { version: string; checked_at: string }>;
}

export interface CliModelList {
  fetched_at: string;
  etag: string;
  client_version: string;
  models: Array<{
    slug: string;
    display_name: string;
    description: string;
    visibility: string;
    priority: number;
  }>;
}

const idList = (v: unknown): string[] => Array.isArray(v)
  ? [...new Set(v.filter((x): x is string => typeof x === 'string' && /^[a-z0-9_-]+$/.test(x)))]
  : [];

/** The summary as a record holds it, or null when the record carries none or a malformed one. */
export function parseProviderSummary(value: unknown): ProviderSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.measured_at !== 'string' || !v.measured_at.trim()) return null;
  const operational = idList(v.operational);
  const rawPaths = v.paths && typeof v.paths === 'object' && !Array.isArray(v.paths) ? v.paths as Record<string, unknown> : {};
  const paths: Record<string, string> = {};
  for (const [id, where] of Object.entries(rawPaths)) if (typeof where === 'string' && where) paths[id] = where;
  const rawVersions = v.versions && typeof v.versions === 'object' && !Array.isArray(v.versions) ? v.versions as Record<string, unknown> : {};
  const versions: Record<string, string> = {};
  for (const [id, version] of Object.entries(rawVersions)) if (typeof version === 'string' && version) versions[id] = version;
  const rawLatest = v.latest && typeof v.latest === 'object' && !Array.isArray(v.latest) ? v.latest as Record<string, unknown> : {};
  const latest: Record<string, { version: string; checked_at: string }> = {};
  for (const [id, row] of Object.entries(rawLatest)) {
    if (!row || typeof row !== 'object') continue;
    const { version, checked_at } = row as Record<string, unknown>;
    if (typeof version === 'string' && version && typeof checked_at === 'string' && checked_at) latest[id] = { version, checked_at };
  }
  const rawLists = v.model_lists && typeof v.model_lists === 'object' && !Array.isArray(v.model_lists) ? v.model_lists as Record<string, unknown> : {};
  const model_lists: Record<string, CliModelList> = {};
  for (const [id, row] of Object.entries(rawLists)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const item = row as Record<string, unknown>;
    if (typeof item.fetched_at !== 'string' || !item.fetched_at || typeof item.etag !== 'string'
      || typeof item.client_version !== 'string' || !item.client_version || !Array.isArray(item.models)) continue;
    const models = item.models.filter((model): model is CliModelList['models'][number] => {
      if (!model || typeof model !== 'object' || Array.isArray(model)) return false;
      const m = model as Record<string, unknown>;
      return typeof m.slug === 'string' && Boolean(m.slug) && typeof m.display_name === 'string'
        && typeof m.description === 'string' && typeof m.visibility === 'string' && typeof m.priority === 'number';
    });
    if (models.length !== item.models.length) continue;
    model_lists[id] = { fetched_at: item.fetched_at, etag: item.etag, client_version: item.client_version, models };
  }
  return {
    measured_at: v.measured_at,
    installed: idList(v.installed),
    signed_in: idList(v.signed_in),
    operational,
    activated_count: operational.length,
    paths,
    versions,
    model_lists,
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
