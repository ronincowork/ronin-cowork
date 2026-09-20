/**
 * MEASURING THE PROVIDERS — the one place the machine is asked what it has, and the
 * Campaign record that keeps the answer.
 *
 * Two facts are probed: whether each CLI in `src/agents.ts` is on the login-shell PATH,
 * and whether its own credential file is on this machine (presence only; never read). A
 * third is recorded, not probed: the activation the owner completed through Done, kept in
 * machine settings under `setup.providers.<cli id>`. A provider is operational when it is
 * installed, signed in or recorded, and holds at least one cell in the provider catalog —
 * an installed, signed-in CLI with nothing to launch is not counted.
 *
 * The summary is written on the Campaign record at Ronin start, after Done and Close, and
 * whenever the Setup Model providers surface (or its Check again) probes. Everything else
 * reads the record and never probes. Agent installs run in a tile with no completion hook,
 * so a fresh install shows on the next probe or the next Ronin start, dated.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { appendEgress, type EgressLine } from './activation/egress.js';
import { AGENTS, listAgentAvailability, type AgentAvailability } from './agents.js';
import { execFile } from './spawn-broker.js';
import { ensureInitialCampaign, initialCampaign, writeCampaignProviders } from './campaigns.js';
import { readSetupSection } from './machine-state.js';
import { listProviderCatalog, parseProviderSummary, type CliModelList, type ProviderCatalogEntry, type ProviderSummary } from './model-providers.js';
import { broadcastEvent } from './ws/events.js';

interface SetupSection { providers?: Record<string, { activated_at?: unknown; off_at?: unknown }>; [key: string]: unknown }

/** When the owner completed a sign-in through Done, as machine settings record it. */
export function activatedAt(section: SetupSection, cli: string): string | null {
  const value = section.providers?.[cli]?.activated_at;
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * When the owner turned the provider OFF — Ronin's own mark, in Ronin's own record. It
 * outranks both the CLI's credential file and `activated_at`, because `operational` is
 * derived from those and neither can be unset: the file is the vendor's, and Done was
 * pressed. Off means Ronin stops using the provider — not measured, not updated, not
 * offered, not launched anew — and nothing else: no vendor file is touched, the sign-in
 * is kept, and turning it back on clears this one field (owner, 2026-09-09: "stopping
 * it does not mean signing it out; we keep the credentials, we just turn it quiet").
 */
export function offAt(section: SetupSection, cli: string): string | null {
  const value = section.providers?.[cli]?.off_at;
  return typeof value === 'string' && value.trim() ? value : null;
}

async function exists(file: string): Promise<boolean> {
  try { await stat(file); return true; } catch { return false; }
}

/** The CLI signed in on this machine and left its credential file; Ronin reads only that it exists. */
export async function providerSignedIn(cli: string, home = os.homedir()): Promise<boolean> {
  const files = AGENTS.find((agent) => agent.id === cli)?.credentials ?? [];
  for (const file of files) if (await exists(path.join(home, file))) return true;
  return false;
}

export interface MeasureOps {
  availability?: AgentAvailability[];
  signedIn?: (cli: string) => Promise<boolean>;
  catalog?: ProviderCatalogEntry[];
  now?: () => string;
  /** What the installed CLI printed to the registry's version argv, given its path; '' when it would not say. The first dotted number in it is the version. */
  version?: (path: string, argv: readonly string[]) => Promise<string>;
  /** The CLI-owned model list, or null when this CLI has no readable list. */
  modelList?: (cli: string, home?: string, file?: string, version?: string) => Promise<CliModelList | null>;
}

/** The first dotted number a `--version` line carries, or ''. */
export const versionIn = (text: string): string => /\d+\.\d+(?:\.\d+)*/.exec(text)?.[0] ?? '';

/** How long one CLI may take to say its version. A slow one (gemini: 2.9s, 2026-09-09) reads *version not read*, never holds the rest. */
export const VERSION_PROBE_MS = 4_000;

/** Ask the installed CLI what it is, with the argv the registry declares for it; what it printed, or '' — including when it took too long. */
export async function installedVersion(file: string, argv: readonly string[]): Promise<string> {
  if (!file || !argv.length) return '';
  try {
    const { stdout, stderr } = await execFile(file, argv, { timeout: VERSION_PROBE_MS });
    return `${stdout}\n${stderr}`;
  } catch {
    return '';
  }
}

/** Turn the stable, human-readable output of `grok models` into its live inventory. */
export function grokModelList(text: string, clientVersion = ''): CliModelList | null {
  if (/you are not authenticated/i.test(text)) return null;
  const start = text.split(/\r?\n/).findIndex((line) => /^Available models:\s*$/i.test(line.trim()));
  if (start < 0) return null;
  const models = text.split(/\r?\n/).slice(start + 1).flatMap((line, priority) => {
    const match = /^\s*(?:\*|-)\s+(.+?)(?:\s+\(default\))?\s*$/.exec(line);
    if (!match) return [];
    const slug = match[1].trim();
    return slug ? [{ slug, display_name: slug, description: '', visibility: 'list' as const, priority }] : [];
  });
  if (!models.length) return null;
  return { fetched_at: new Date().toISOString(), etag: '', client_version: clientVersion, models };
}

/** Read the model inventory owned or printed by a CLI; never infer entitlement from Ronin's catalog. */
export async function cliModelList(cli: string, home = os.homedir(), file = '', clientVersion = ''): Promise<CliModelList | null> {
  if (cli === 'claude') {
    try {
      const dir = path.join(home, '.claude', 'cache', 'model-catalog');
      const files = (await readdir(dir)).filter((name) => name.endsWith('-cc.json')).sort();
      const file = files.at(-1);
      if (!file) return null;
      const raw = JSON.parse(await readFile(path.join(dir, file), 'utf8')) as Record<string, any>;
      const models = raw?.catalog?.config?.models;
      if (!Array.isArray(models)) return null;
      return {
        fetched_at: new Date(Number(raw.fetchedAt)).toISOString(), etag: file, client_version: `catalog-${raw.version}`,
        models: models.filter((model) => model && typeof model.id === 'string').map((model, priority) => ({
          slug: model.id, display_name: String(model.name || model.short_name || model.id),
          description: String(model.description || ''), visibility: 'list', priority,
        })),
      };
    } catch { return null; }
  }
  if (cli === 'grok') {
    if (!file) return null;
    try {
      const { stdout, stderr } = await execFile(file, ['models'], { timeout: 20_000 });
      return grokModelList(`${stdout}\n${stderr}`, clientVersion);
    } catch { return null; }
  }
  if (cli !== 'codex') return null;
  try {
    const raw = JSON.parse(await readFile(path.join(home, '.codex', 'models_cache.json'), 'utf8')) as Record<string, unknown>;
    const parsed = { measured_at: 'cache', model_lists: { codex: raw } };
    return parseProviderSummary(parsed)?.model_lists.codex ?? null;
  } catch {
    return null;
  }
}

/** Probe the machine once and say what it has, dated. Pure of any record: the caller writes it. */
export async function measureProviders(section: SetupSection, ops: MeasureOps = {}): Promise<ProviderSummary> {
  const [available, catalog] = await Promise.all([
    ops.availability ?? listAgentAvailability(),
    ops.catalog ?? listProviderCatalog(),
  ]);
  const signedIn = ops.signedIn ?? providerSignedIn;
  const version = ops.version ?? installedVersion;
  const modelList = ops.modelList ?? cliModelList;
  const installed = available.filter((agent) => agent.installed).map((agent) => agent.id);
  const paths: Record<string, string> = {};
  for (const agent of available) if (agent.installed && agent.path) paths[agent.id] = agent.path;
  const signed_in: string[] = [];
  for (const agent of AGENTS) if (await signedIn(agent.id)) signed_in.push(agent.id);
  const launchable = new Set(catalog.filter((entry) => entry.models.length > 0).map((entry) => entry.cli));
  const operational = installed.filter((cli) =>
    offAt(section, cli) === null && (signed_in.includes(cli) || activatedAt(section, cli) !== null) && launchable.has(cli));
  // THE OWNER'S RULE (2026-09-09): a provider that is not activated gets nothing spent on
  // it — no exec, no ask, not a millisecond. Installed is enough to say "installed".
  // Gemini, installed and never signed in here, took 2.9s to say its version on every
  // paint of a row that offered no action. Only the activated are asked, all at once, each
  // bounded, so the measure costs the slowest activated answer, not the sum.
  const versions: Record<string, string> = {};
  const asked = await Promise.all(AGENTS.filter((agent) => operational.includes(agent.id) && paths[agent.id])
    .map(async (agent) => [agent.id, versionIn(await version(paths[agent.id], agent.operations.version))] as const));
  for (const [id, found] of asked) if (found) versions[id] = found;
  const model_lists: Record<string, CliModelList> = {};
  const model_inventory: NonNullable<ProviderSummary['model_inventory']> = {};
  const lists = await Promise.all(AGENTS.filter((agent) => operational.includes(agent.id))
    .map(async (agent) => [agent.id, await modelList(agent.id, undefined, paths[agent.id], versions[agent.id])] as const));
  for (const [id, list] of lists) {
    if (list) model_lists[id] = list;
    model_inventory[id] = { state: list ? 'ready' : 'unavailable', checked_at: (ops.now ?? (() => new Date().toISOString()))() };
  }
  for (const id of installed) model_inventory[id] ??= { state: 'unavailable', checked_at: (ops.now ?? (() => new Date().toISOString()))() };
  return {
    measured_at: (ops.now ?? (() => new Date().toISOString()))(),
    installed, signed_in, operational,
    activated_count: operational.length,
    paths,
    versions,
    model_lists,
    model_inventory,
    latest: {},
  };
}

/** The npm package an install line names: the release source even when updating uses the CLI's own command. */
export function npmPackageOf(installShell: string): string {
  return /^npm install -g (\S+?)(?:@latest)?$/.exec(installShell.trim())?.[1] ?? '';
}

export interface LatestOps {
  /** The newest version the npm registry lists for a package; throws when the registry cannot be asked. */
  npmView?: (pkg: string) => Promise<string>;
  egress?: (line: EgressLine) => Promise<void>;
  now?: () => string;
}

const NPM_REGISTRY = 'registry.npmjs.org';

async function npmViewVersion(pkg: string): Promise<string> {
  const { stdout } = await execFile('npm', ['view', pkg, 'version'], { timeout: 20_000 });
  return versionIn(stdout);
}

/**
 * THE ONE OUTBOUND ASK: what is the newest release of each ACTIVATED CLI (the caller passes
 * the summary's `operational`; a provider not activated is not asked — the owner's rule).
 * Only for a CLI whose registry install line names an npm package — that is a source Ronin
 * can ask by name; a vendor page is not. Every ask is an egress line, answered or not. A
 * CLI with no such source is simply absent from the answer, and the surface says
 * *latest unknown*.
 */
export async function latestVersions(activated: readonly string[], ops: LatestOps = {}): Promise<ProviderSummary['latest']> {
  const view = ops.npmView ?? npmViewVersion;
  const egress = ops.egress ?? appendEgress;
  const now = ops.now ?? (() => new Date().toISOString());
  const out: ProviderSummary['latest'] = {};
  for (const agent of AGENTS) {
    if (!activated.includes(agent.id)) continue;
    const pkg = npmPackageOf(agent.operations.install);
    if (!pkg) continue;
    const started = Date.now();
    let version = '';
    let outcome = 'unreachable';
    try {
      version = await view(pkg);
      outcome = version ? 'ok' : 'unreadable';
    } catch {
      outcome = 'unreachable';
    }
    await egress({ at: now(), host: NPM_REGISTRY, method: 'GET', path: `/${pkg}`, status: version ? 200 : 0, outcome, ms: Date.now() - started }).catch(() => { /* bookkeeping never fails the ask */ });
    if (version) out[agent.id] = { version, checked_at: now() };
  }
  return out;
}

/** The summary the Campaign record holds, or null when Ronin has not measured yet. */
export async function readProviderSummary(): Promise<ProviderSummary | null> {
  return (await initialCampaign())?.providers ?? null;
}

export async function recordProviderSummary(summary: ProviderSummary): Promise<void> {
  const campaign = await ensureInitialCampaign();
  await writeCampaignProviders(campaign.id, summary);
}

/**
 * Probe, write, answer: the one door for every measurement Ronin takes. An ordinary
 * measure keeps the last Refresh's `latest` — it was true when asked and its date says
 * when; `refresh` asks again, one outbound request per askable CLI.
 */
export async function measureAndRecordProviders(section?: SetupSection, ops: MeasureOps = {}, refresh: LatestOps | false = false): Promise<ProviderSummary> {
  const previous = await readProviderSummary();
  const summary = await measureProviders(section ?? await readSetupSection(), ops);
  summary.latest = refresh ? await latestVersions(summary.operational, refresh) : (previous?.latest ?? {});
  await recordProviderSummary(summary);
  return summary;
}

export interface ProviderInventoryNeed {
  needed: boolean;
  providers: string[];
}

/** Installed, usable CLIs whose inventory has never completed or whose saved result is structurally invalid. */
export function providerInventoryNeed(summary: ProviderSummary | null): ProviderInventoryNeed {
  if (!summary) return { needed: false, providers: [] };
  const providers = summary.operational.filter((id) => {
    const state = summary.model_inventory?.[id]?.state ?? (summary.model_lists?.[id] ? 'ready' : 'unmeasured');
    return state === 'unmeasured' || state === 'invalid' || (state === 'ready' && !summary.model_lists?.[id]);
  });
  return { needed: providers.length > 0, providers };
}

export interface ProviderInventoryCompletion {
  state: 'complete' | 'failed';
  summary: ProviderSummary | null;
  providers: string[];
}

let inventoryRefresh: Promise<ProviderInventoryCompletion> | null = null;

/**
 * The one background inventory refresh. Concurrent Setup callers share this flight; the
 * completed Campaign write is announced on `/events` so already-open model pickers repaint.
 */
export function refreshProviderInventory(section?: SetupSection, ops: MeasureOps = {}): Promise<ProviderInventoryCompletion> {
  if (inventoryRefresh) return inventoryRefresh;
  inventoryRefresh = (async () => {
    const before = await readProviderSummary();
    const providers = providerInventoryNeed(before).providers;
    try {
      const summary = await measureAndRecordProviders(section, ops);
      const completion: ProviderInventoryCompletion = { state: 'complete', summary, providers };
      broadcastEvent({ t: 'provider-inventory', state: completion.state, measured_at: summary.measured_at, providers });
      return completion;
    } catch {
      const completion: ProviderInventoryCompletion = { state: 'failed', summary: null, providers };
      broadcastEvent({ t: 'provider-inventory', state: completion.state, providers });
      return completion;
    } finally {
      inventoryRefresh = null;
    }
  })();
  return inventoryRefresh;
}
