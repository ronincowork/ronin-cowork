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
import { AGENTS, listAgentAvailability, type AgentAvailability } from './agents.js';
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
}

/** Probe the machine once and say what it has, dated. Pure of any record: the caller writes it. */
export async function measureProviders(section: SetupSection, ops: MeasureOps = {}): Promise<ProviderSummary> {
  const [available, catalog] = await Promise.all([
    ops.availability ?? listAgentAvailability(),
    ops.catalog ?? listProviderCatalog(),
  ]);
  const signedIn = ops.signedIn ?? providerSignedIn;
  const installed = available.filter((agent) => agent.installed).map((agent) => agent.id);
  const paths: Record<string, string> = {};
  for (const agent of available) if (agent.installed && agent.path) paths[agent.id] = agent.path;
  const signed_in: string[] = [];
  for (const agent of AGENTS) if (await signedIn(agent.id)) signed_in.push(agent.id);
  const launchable = new Set(catalog.filter((entry) => entry.models.length > 0).map((entry) => entry.cli));
  const operational = installed.filter((cli) =>
    (signed_in.includes(cli) || activatedAt(section, cli) !== null) && launchable.has(cli));
  return {
    measured_at: (ops.now ?? (() => new Date().toISOString()))(),
    installed, signed_in, operational,
    activated_count: operational.length,
    paths,
  };
}

/** The summary the Campaign record holds, or null when Ronin has not measured yet. */
export async function readProviderSummary(): Promise<ProviderSummary | null> {
  return (await initialCampaign())?.providers ?? null;
}

export async function recordProviderSummary(summary: ProviderSummary): Promise<void> {
  const campaign = await ensureInitialCampaign();
  await writeCampaignProviders(campaign.id, summary);
}

/** Probe, write, answer: the one door for every measurement Ronin takes. */
export async function measureAndRecordProviders(section?: SetupSection, ops: MeasureOps = {}): Promise<ProviderSummary> {
  const summary = await measureProviders(section ?? await readSetupSection(), ops);
  await recordProviderSummary(summary);
  return summary;
}
