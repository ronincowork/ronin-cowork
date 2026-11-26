import { modelServiceConfigured, readModelServiceStore } from './model-service-store.js';
/**
 * MEASURING THE PROVIDERS — the one place the machine is asked what it has, and the
 * Campaign record that keeps the answer.
 *
 * Two facts are probed: whether each CLI in `src/agents.ts` is on the login-shell PATH,
 * and whether its own credential file is on this machine (presence only; never read). A
 * third is recorded, not probed: the activation the owner completed through Done, kept in
 * machine settings under `setup.providers.<cli id>`. A provider is operational when it is
 * installed, signed in or recorded, not turned off, and its vendor in `src/agents.ts` is not
 * `comingSoon` — an installed, signed-in CLI with nothing to launch is not counted.
 *
 * Two writers, one record (owner's ruling, 2026-09-25):
 * - `measureAndRecordHarnesses` — machine facts; the recorded model lists and the last
 *   npm answer ride along unchanged. A sign-in closing, a switch, a setup saved.
 * - `refreshHarnesses` — Refresh all: the same facts, then every activated CLI's own
 *   model list read again through the reader its registry entry names, the Ronin
 *   Gateway's list, then npm asked for the newest release. Ronin
 *   start (so after every Update, which restarts it), the park's call in a hosted office,
 *   and the member's press; never a timer (KAN-651, MODEL_MANAGEMENT.md §4).
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { appendEgress, type EgressLine } from './activation/egress.js';
import { AGENTS, listAgentAvailability, type AgentAvailability, type ModelsSource } from './agents.js';
import { execFile } from './spawn-broker.js';
import { ensureInitialCampaign, initialCampaign, writeCampaignHarnesses } from './campaigns.js';
import { readAgentsSection, readSetupSection, writeAgentsSection } from './machine-state.js';
import { readGatewayModels } from './model-service-store.js';
import { listHarnesses, harnessRows, type ModelConnection, type ModelList, type ModelRow, type HarnessSummary } from './harness-catalog.js';

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
export async function harnessSignedIn(cli: string, home = os.homedir()): Promise<boolean> {
  if (cli === 'hermes') return modelServiceConfigured();
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

/** One id per line; a line with a space in it is not an id (a banner, a warning). */
export function lineModels(text: string): ModelRow[] | null {
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !/\s/.test(line)).map((id) => ({ id, name: id }));
  return rows.length ? rows : null;
}

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * THE READERS — one per way a CLI publishes its list. Which reader a CLI uses is the
 * registry's declaration (`operations.models`), so no CLI id appears here. Each returns
 * the rows in the CLI's own order, or null when it found no readable list.
 */
const READERS: Record<ModelsSource['read'], (agent: Agent, home: string, file: string) => Promise<ModelRow[] | { connections: ModelConnection[] } | null>> = {
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
  // One model id per line, nothing else (OpenCode's `opencode models`: provider/model).
  'command-lines': async (agent, _home, file) => {
    if (!file || agent.operations.models.read !== 'command-lines') return null;
    const { stdout } = await execFile(file, [...agent.operations.models.argv], { timeout: 20_000 });
    return lineModels(stdout);
  },
  'model-options': async () => (await readModelServiceStore()).setups.map(setup => ({ id: setup.id, name: setup.name })),
  none: async () => null,
};

/** Read one CLI's own model list the way its registry entry says; never infer entitlement from Ronin's catalog. */
export async function readModels(agent: Agent, { home = os.homedir(), file = '', version = '', now }: ReadModelsOptions = {}): Promise<ModelList> {
  const read_at = (now ?? (() => new Date().toISOString()))();
  const source = agent.operations.models;
  if (source.read === 'none') return { read_at, by: version, rows: [], unavailable: `${agent.label} publishes no model list Ronin can read.` };
  let inventory: ModelRow[] | { connections: ModelConnection[] } | null = null;
  try { inventory = await READERS[source.read](agent, home, file); } catch { inventory = null; }
  if (inventory && !Array.isArray(inventory)) {
    return { read_at, by: version, rows: [], connections: inventory.connections,
      ...(!inventory.connections.length ? { unavailable: 'No API connections configured. Open connection setup, then refresh.' } : {}) };
  }
  const rows = inventory;
  if (!rows?.length) return { read_at, by: version, rows: [], unavailable: `No readable model list from ${agent.label}.` };
  return { read_at, by: version, rows };
}

/** Probe the machine once and say what it has, dated. Pure of any record: the caller writes it. */
export async function measureHarnesses(section: SetupSection, ops: MeasureOps = {}): Promise<HarnessSummary> {
  const available = ops.availability ?? await listAgentAvailability();
  const catalog = listHarnesses();
  const signedIn = ops.signedIn ?? harnessSignedIn;
  const version = ops.version ?? installedVersion;
  const installed = available.filter((agent) => agent.installed).map((agent) => agent.id);
  const paths: Record<string, string> = {};
  for (const agent of available) if (agent.installed && agent.path) paths[agent.id] = agent.path;
  const signed_in: string[] = [];
  for (const agent of AGENTS) if (await signedIn(agent.id)) signed_in.push(agent.id);
  const launchable = new Set(catalog.filter((entry) => entry.launchable).map((entry) => entry.cli));
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
export async function latestVersions(activated: readonly string[], ops: LatestOps = {}): Promise<HarnessSummary['latest']> {
  const view = ops.npmView ?? npmViewVersion;
  const egress = ops.egress ?? appendEgress;
  const now = ops.now ?? (() => new Date().toISOString());
  const out: HarnessSummary['latest'] = {};
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
export async function readHarnessSummary(): Promise<HarnessSummary | null> {
  return (await initialCampaign())?.providers ?? null;
}

export async function recordHarnessSummary(summary: HarnessSummary): Promise<void> {
  const campaign = await ensureInitialCampaign();
  const previous = campaign.providers ?? null;
  await writeCampaignHarnesses(campaign.id, summary);
  await settleFirstDefault(previous, summary);
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/**
 * THE FIRST SIGN-IN IS THE DEFAULT (owner, 2026-11-19; KAN-725): while no default provider is
 * set, the first CLI signed in here becomes ⚙ agents.sessions.default, written once: the
 * provider, its model blank (the provider's own default). A later sign-in never moves it; only the Agent defaults do.
 * One already signed in before this measure outranks one new in it. A model service is no
 * sign-in: it is never in `signed_in`. Returns the provider written, '' for none.
 */
export async function settleFirstDefault(previous: HarnessSummary | null, summary: HarnessSummary): Promise<string> {
  const agents = await readAgentsSection();
  const sessions = record(agents.sessions);
  const stated = record(sessions.default).provider;
  if (typeof stated === 'string' && stated.trim()) return '';
  const order = [...(previous?.signed_in ?? []), ...summary.signed_in]
    .filter((cli, at, all) => all.indexOf(cli) === at && summary.signed_in.includes(cli) && summary.operational.includes(cli));
  if (!order.length) return '';
  const rows = await harnessRows(summary);
  for (const cli of order) {
    const row = rows.find((entry) => entry.cli === cli && entry.operational);
    if (!row) continue;
    await writeAgentsSection({ ...agents, sessions: { ...sessions, default: { provider: row.provider, model: '' } } });
    return row.provider;
  }
  return '';
}

/**
 * Machine facts, written: what is installed, signed in, activated, and what version each
 * activated CLI says. The recorded model lists, the last npm answer and the last Refresh
 * all date ride along unchanged — nothing is read again but by a refresh.
 */
export async function measureAndRecordHarnesses(section?: SetupSection, ops: MeasureOps = {}): Promise<HarnessSummary> {
  const previous = await readHarnessSummary();
  const summary = await measureHarnesses(section ?? await readSetupSection(), ops);
  for (const id of summary.installed) if (previous?.models?.[id]) summary.models[id] = previous.models[id];
  summary.latest = previous?.latest ?? {};
  summary.refreshed_at = previous?.refreshed_at ?? '';
  await recordHarnessSummary(summary);
  return summary;
}

/**
 * REFRESH ALL — start-up, the park's call, the member's press. The same machine facts, then every activated CLI's own
 * model list read again through the reader its registry entry names, then npm asked for
 * each activated CLI's newest release (one outbound request each, on the egress record).
 * A CLI not activated gets nothing spent on it; its old list, if any, is dropped with it.
 */
export async function refreshHarnesses(section?: SetupSection, ops: MeasureOps = {}, latest: LatestOps = {}): Promise<HarnessSummary> {
  const now = ops.now ?? (() => new Date().toISOString());
  const read = ops.models ?? readModels;
  const summary = await measureHarnesses(section ?? await readSetupSection(), ops);
  await readGatewayModels().catch((e) => console.error('[providers] gateway list:', e));
  const lists = await Promise.all(AGENTS.filter((agent) => summary.operational.includes(agent.id))
    .map(async (agent) => [agent.id, await read(agent, { file: summary.paths[agent.id] ?? '', version: summary.versions[agent.id] ?? '', now })] as const));
  for (const [id, list] of lists) summary.models[id] = list;
  summary.latest = await latestVersions(summary.operational, latest);
  summary.refreshed_at = now();
  await recordHarnessSummary(summary);
  return summary;
}
