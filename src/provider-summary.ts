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
import { stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { appendEgress, type EgressLine } from './activation/egress.js';
import { AGENTS, listAgentAvailability, type AgentAvailability } from './agents.js';
import { execFile } from './spawn-broker.js';
import { ensureInitialCampaign, initialCampaign, writeCampaignProviders } from './campaigns.js';
import { readSetupSection } from './machine-state.js';
import { listProviderCatalog, type ProviderCatalogEntry, type ProviderSummary } from './model-providers.js';

interface SetupSection { providers?: Record<string, { activated_at?: unknown }>; [key: string]: unknown }

/** When the owner completed a sign-in through Done, as machine settings record it. */
export function activatedAt(section: SetupSection, cli: string): string | null {
  const value = section.providers?.[cli]?.activated_at;
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
}

/** The first dotted number a `--version` line carries, or ''. */
export const versionIn = (text: string): string => /\d+\.\d+(?:\.\d+)*/.exec(text)?.[0] ?? '';

/** Ask the installed CLI what it is, with the argv the registry declares for it; what it printed, or ''. */
export async function installedVersion(file: string, argv: readonly string[]): Promise<string> {
  if (!file || !argv.length) return '';
  try {
    const { stdout, stderr } = await execFile(file, argv, { timeout: 8_000 });
    return `${stdout}\n${stderr}`;
  } catch {
    return '';
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
  const installed = available.filter((agent) => agent.installed).map((agent) => agent.id);
  const paths: Record<string, string> = {};
  for (const agent of available) if (agent.installed && agent.path) paths[agent.id] = agent.path;
  const signed_in: string[] = [];
  for (const agent of AGENTS) if (await signedIn(agent.id)) signed_in.push(agent.id);
  const versions: Record<string, string> = {};
  for (const agent of AGENTS) {
    if (!paths[agent.id]) continue;
    const found = versionIn(await version(paths[agent.id], agent.operations.version));
    if (found) versions[agent.id] = found;
  }
  const launchable = new Set(catalog.filter((entry) => entry.models.length > 0).map((entry) => entry.cli));
  const operational = installed.filter((cli) =>
    (signed_in.includes(cli) || activatedAt(section, cli) !== null) && launchable.has(cli));
  return {
    measured_at: (ops.now ?? (() => new Date().toISOString()))(),
    installed, signed_in, operational,
    activated_count: operational.length,
    paths,
    versions,
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
 * THE ONE OUTBOUND ASK: what is the newest release of each installed CLI. Only for a CLI
 * whose registry install line names an npm package — that is a source Ronin can ask by
 * name; a vendor page is not. Every ask is an egress line, answered or not. A CLI with no
 * such source is simply absent from the answer, and the surface says *latest unknown*.
 */
export async function latestVersions(installed: readonly string[], ops: LatestOps = {}): Promise<ProviderSummary['latest']> {
  const view = ops.npmView ?? npmViewVersion;
  const egress = ops.egress ?? appendEgress;
  const now = ops.now ?? (() => new Date().toISOString());
  const out: ProviderSummary['latest'] = {};
  for (const agent of AGENTS) {
    if (!installed.includes(agent.id)) continue;
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
  summary.latest = refresh ? await latestVersions(summary.installed, refresh) : (previous?.latest ?? {});
  await recordProviderSummary(summary);
  return summary;
}
