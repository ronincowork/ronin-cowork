/**
 * THE PROVIDER CATALOG — one record of every model provider and every model Ronin offers.
 *
 * `ronin_catalogs/MODEL_PROVIDERS.md` is stock; a copy in the owner's catalogs store wins
 * whole, file for file, which is how names stay fresh without a code release. Each
 * provider section carries the vendor id a launch names and the id of the CLI that serves
 * it (`src/agents.ts`), so the two are joined here, in data, and nowhere else. Each model
 * row carries its tier, a dated cost reading, what it is good at and not good at, whether
 * it is the provider's default, and the complete launch command — the session_launch_spec.
 *
 * The file's header carries `- **updated:** YYYY-MM-DD`, the day its prices, models and
 * descriptions were last read from the public record. It is a snapshot, refreshed with each
 * release (stock) or by the owner (a shadow copy); readers show the date, never hide it.
 *
 * This module also holds the shape of the Campaign's measured provider summary, so that
 * the record and the catalog share one vocabulary; measuring and recording live in
 * `src/provider-summary.ts`.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { STOCK_DIR, storeDir } from './resources.js';

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
  liveDangerously?: string;
  gbrainDisconnected?: string;
  models: SessionLaunchSpec[];
}

export interface ProviderCatalog {
  origin: 'stock' | 'user';
  path: string;
  /** The catalog header's `updated` day, `YYYY-MM-DD`; '' when the file carries none. */
  updated: string;
  providers: ProviderCatalogEntry[];
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
 * One `### <Vendor>` section per provider; under it `- **provider:**`, `- **cli:**` and the
 * launch-mode flags, then one or more tables whose header begins with `model`. A section
 * may spread a model's columns over several tables (facts in one, `launch` in another);
 * they are joined by model id, and the first table's row order is the picker's order.
 */
export function parseProviderCatalog(raw: string): ProviderCatalogEntry[] {
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
      if (!cmd) continue; // a model with no launch cell is a name, not a session_launch_spec
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
      provider, cli, label, models,
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

/** The catalog as this machine resolves it: the owner's copy when there is one, else stock. */
export async function readProviderCatalog(): Promise<ProviderCatalog> {
  const user = userCatalogMd();
  const origin = (await exists(user)) ? 'user' : 'stock';
  const file = origin === 'user' ? user : STOCK_CATALOG_MD;
  const raw = await readFile(file, 'utf8');
  return { origin, path: file, updated: catalogUpdated(raw), providers: parseProviderCatalog(raw) };
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
  return {
    measured_at: v.measured_at,
    installed: idList(v.installed),
    signed_in: idList(v.signed_in),
    operational,
    activated_count: operational.length,
    paths,
  };
}
