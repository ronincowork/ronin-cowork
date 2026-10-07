/**
 * MEASURING THE PROVIDERS — the one place the machine is asked what it has, and the
 * Campaign record that keeps the answer.
 *
 * Two facts are probed: whether each CLI in `src/agents.ts` is on the login-shell PATH,
 * and whether its own credential file is on this machine (presence only; never read). A
 * third is recorded, not probed: the activation the owner completed through Done, kept in
 * machine settings under `setup.providers.<cli id>`. A provider is operational when it is
 * installed, signed in or recorded, not turned off, and holds at least one cell in the
 * provider catalog — an installed, signed-in CLI with nothing to launch is not counted.
 *
 * Two writers, one record (owner's ruling, 2026-09-25):
 * - `measureAndRecordProviders` — machine facts; the recorded model lists and the last
 *   npm answer ride along unchanged. Ronin start, and a sign-in closing.
 * - `refreshProviders` — Refresh all: the same facts, then every activated CLI's own
 *   model list read again through the reader its registry entry names, then npm asked
 *   for the newest release. The owner's press, never a timer.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { appendEgress, type EgressLine } from './activation/egress.js';
import { AGENTS, listAgentAvailability, type AgentAvailability, type ModelsSource } from './agents.js';
import { execFile } from './spawn-broker.js';
import { ensureInitialCampaign, initialCampaign, writeCampaignProviders } from './campaigns.js';
import { readSetupSection } from './machine-state.js';
import { listProviderCatalog, type ModelList, type ModelRow, type ProviderCatalogEntry, type ProviderSummary } from './model-providers.js';

interface SetupSection { providers?: Record<string, { activated_at?: unknown; off_at?: unknown }>; [key: string]: unknown }
export type Agent = typeof AGENTS[number];

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

export interface ReadModelsOptions {
  home?: string;
  /** Where the installed CLI was found; a `command` reader runs it. */
  file?: string;
  /** The installed CLI version, stamped on the list as `by`. */
  version?: string;
  now?: () => string;
}

export interface MeasureOps {
  availability?: AgentAvailability[];
  signedIn?: (cli: string) => Promise<boolean>;
  catalog?: ProviderCatalogEntry[];
  now?: () => string;
  /** What the installed CLI printed to the registry's version argv, given its path; '' when it would not say. The first dotted number in it is the version. */
  version?: (path: string, argv: readonly string[]) => Promise<string>;
  /** The CLI's own model list, read on Refresh all only. */
  models?: (agent: Agent, options: ReadModelsOptions) => Promise<ModelList>;
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

/** The rows a CLI prints under `Available models:`; null when it printed no such list (not signed in, say). */
export function commandModels(text: string): ModelRow[] | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^Available models:\s*$/i.test(line.trim()));
  if (start < 0) return null;
  const rows = lines.slice(start + 1).flatMap((line) => {
    const match = /^\s*(?:\*|-)\s+(.+?)(?:\s+\(default\))?\s*$/.exec(line);
    const id = match?.[1]?.trim();
    return id ? [{ id, name: id }] : [];
  });
  return rows.length ? rows : null;
}

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * THE READERS — one per way a CLI publishes its list. Which reader a CLI uses is the
 * registry's declaration (`operations.models`), so no CLI id appears here. Each returns
 * the rows in the CLI's own order, or null when it found no readable list.
 */
const READERS: Record<ModelsSource['read'], (agent: Agent, home: string, file: string) => Promise<ModelRow[] | null>> = {
  // Claude Code keeps the catalog it fetched under ~/.claude/cache/model-catalog/*-cc.json:
  // `catalog.config.models[]`, each with `id`, `name` ("Opus 5.5"), `short_name` ("Opus") and
  // `section`: `main` is what its own picker offers, `overflow` the older generations it
  // still serves behind "more models". Only the offered rows are read, as Codex's hidden ones.
  'claude-cache': async (_agent, home) => {
    const dir = path.join(home, '.claude', 'cache', 'model-catalog');
    const files = (await readdir(dir)).filter((name) => name.endsWith('-cc.json')).sort();
    const file = files.at(-1);
    if (!file) return null;
    const raw = asObject(JSON.parse(await readFile(path.join(dir, file), 'utf8')));
    const models = asObject(asObject(raw.catalog).config).models;
    if (!Array.isArray(models)) return null;
    return models.flatMap((model) => {
      const m = asObject(model);
      const id = text(m.id);
      const offered = m.section === undefined || m.section === 'main';
      return id && offered ? [{ id, name: text(m.name) || text(m.short_name) || id }] : [];
    });
  },
  // Codex keeps ~/.codex/models_cache.json: `models[]` with `slug`, `display_name` and
  // `visibility`; a hidden row is one the CLI itself does not offer.
  'codex-cache': async (_agent, home) => {
    const raw = asObject(JSON.parse(await readFile(path.join(home, '.codex', 'models_cache.json'), 'utf8')));
    if (!Array.isArray(raw.models)) return null;
    return raw.models.flatMap((model) => {
      const m = asObject(model);
      const id = text(m.slug);
      return id && m.visibility === 'list' ? [{ id, name: text(m.display_name) || id }] : [];
    });
  },
  command: async (agent, _home, file) => {
    if (!file || agent.operations.models.read !== 'command') return null;
    const { stdout, stderr } = await execFile(file, [...agent.operations.models.argv], { timeout: 20_000 });
    return commandModels(`${stdout}\n${stderr}`);
  },
  none: async () => null,
};

/** Read one CLI's own model list the way its registry entry says; never infer entitlement from Ronin's catalog. */
export async function readModels(agent: Agent, { home = os.homedir(), file = '', version = '', now }: ReadModelsOptions = {}): Promise<ModelList> {
  const read_at = (now ?? (() => new Date().toISOString()))();
  const source = agent.operations.models;
  if (source.read === 'none') return { read_at, by: version, rows: [], unavailable: `${agent.label} publishes no model list Ronin can read.` };
  let rows: ModelRow[] | null = null;
  try { rows = await READERS[source.read](agent, home, file); } catch { rows = null; }
  if (!rows?.length) return { read_at, by: version, rows: [], unavailable: `No readable model list from ${agent.label}.` };
  return { read_at, by: version, rows };
}

/** Probe the machine once and say what it has, dated. Pure of any record: the caller writes it. */
export async function measureProviders(section: SetupSection, ops: MeasureOps = {}): Promise<ProviderSummary> {
  const [available, catalog] = await Promise.all([
    ops.availability ?? listAgentAvailability(),
    ops.catalog ?? listProviderCatalog(),
  ]);
  const signedIn = ops.signedIn ?? providerSignedIn;
  const version = ops.version ?? installedVersion;
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
  return {
    measured_at: (ops.now ?? (() => new Date().toISOString()))(),
    refreshed_at: '',
    installed, signed_in, operational,
    off: installed.filter((cli) => offAt(section, cli) !== null),
    activated_count: operational.length,
    paths,
    versions,
    models: {},
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
 * Machine facts, written: what is installed, signed in, activated, and what version each
 * activated CLI says. The recorded model lists, the last npm answer and the last Refresh
 * all date ride along unchanged — nothing is read again without the owner's press.
 */
export async function measureAndRecordProviders(section?: SetupSection, ops: MeasureOps = {}): Promise<ProviderSummary> {
  const previous = await readProviderSummary();
  const summary = await measureProviders(section ?? await readSetupSection(), ops);
  for (const id of summary.installed) if (previous?.models?.[id]) summary.models[id] = previous.models[id];
  summary.latest = previous?.latest ?? {};
  summary.refreshed_at = previous?.refreshed_at ?? '';
  await recordProviderSummary(summary);
  return summary;
}

/**
 * REFRESH ALL — the owner's press. The same machine facts, then every activated CLI's own
 * model list read again through the reader its registry entry names, then npm asked for
 * each activated CLI's newest release (one outbound request each, on the egress record).
 * A CLI not activated gets nothing spent on it; its old list, if any, is dropped with it.
 */
export async function refreshProviders(section?: SetupSection, ops: MeasureOps = {}, latest: LatestOps = {}): Promise<ProviderSummary> {
  const now = ops.now ?? (() => new Date().toISOString());
  const read = ops.models ?? readModels;
  const summary = await measureProviders(section ?? await readSetupSection(), ops);
  const lists = await Promise.all(AGENTS.filter((agent) => summary.operational.includes(agent.id))
    .map(async (agent) => [agent.id, await read(agent, { file: summary.paths[agent.id] ?? '', version: summary.versions[agent.id] ?? '', now })] as const));
  for (const [id, list] of lists) summary.models[id] = list;
  summary.latest = await latestVersions(summary.operational, latest);
  summary.refreshed_at = now();
  await recordProviderSummary(summary);
  return summary;
}
