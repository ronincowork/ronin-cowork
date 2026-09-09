import { chmod, lstat, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, storeDir } from './resources.js';
import { TIERS, listSessionLaunchSpecs, type ProviderSummary, type SessionLaunchSpec, type Tier } from './model-providers.js';
import { readProviderSummary } from './provider-summary.js';
import { readAgentsSection } from './machine-state.js';

export const MIKA_LEVELS = TIERS;
export type MikaLevel = Tier;

export interface MikaSelection {
  requested_level: MikaLevel;
  provider: string;
  model: string;
  resolved_level: MikaLevel;
  provider_notice: 'default_provider_unavailable' | 'default_provider_has_no_level' | null;
  available_levels: MikaLevel[];
  spec: SessionLaunchSpec;
}

export class MikaUnavailable extends Error {
  constructor(
    public readonly code: 'mika_provider_unmeasured' | 'mika_no_ready_provider' | 'mika_no_model_at_level' | 'mika_model_level_choice_required' | 'invalid_mika_level',
    message: string,
    public readonly available_levels: MikaLevel[] = [],
    public readonly requested_level?: MikaLevel,
  ) { super(message); }
}

const isLevel = (value: unknown): value is MikaLevel =>
  typeof value === 'string' && (MIKA_LEVELS as readonly string[]).includes(value);

export function mikaLevelFromAgents(agents: Record<string, unknown>): MikaLevel {
  const jobs = agents.jobs && typeof agents.jobs === 'object' ? agents.jobs as Record<string, unknown> : {};
  const job = jobs.mikaassist && typeof jobs.mikaassist === 'object'
    ? jobs.mikaassist as Record<string, unknown> : {};
  if (job.level === undefined || job.level === null || job.level === '') return 'light';
  if (!isLevel(job.level)) throw new MikaUnavailable('invalid_mika_level', 'Mika model level must be light, standard, or frontier.');
  return job.level;
}

const orderedLevels = (specs: readonly SessionLaunchSpec[]): MikaLevel[] =>
  MIKA_LEVELS.filter((level) => specs.some((spec) => spec.tier === level));

/**
 * THE OWNER'S RULE (2026-09-09), and only this:
 *  1. The default provider (⚙ sessions.default.provider) supplies Mika when it is signed in.
 *     Inside it she takes the configured level (Light unless the owner moved it) and
 *     cascades UP — Light → Standard → Frontier — never across to another provider.
 *  2. No default, or the default is not signed in yet (first-run Setup): the first
 *     operational provider in catalog order supplies her, with the same cascade.
 * Providers are never compared for a better level.
 */
export function resolveMikaModel(input: {
  level: MikaLevel;
  generalProvider?: string;
  specs: readonly SessionLaunchSpec[];
  summary: ProviderSummary | null;
}): MikaSelection {
  const { level, specs, summary } = input;
  if (!summary) throw new MikaUnavailable('mika_provider_unmeasured', 'Provider readiness has not been measured. Check Model providers before Mika can start.', [], level);
  const operational = new Set(summary.operational);
  const eligible = specs.filter((spec) => operational.has(spec.cli));
  if (!eligible.length) throw new MikaUnavailable('mika_no_ready_provider', 'Mika needs a signed-in model provider. Open Model providers.', [], level);
  const general = input.generalProvider ?? '';
  const generalReady = !!general && eligible.some((spec) => spec.provider === general);
  const provider = generalReady ? general : eligible[0].provider;
  const within = eligible.filter((spec) => spec.provider === provider);
  const available = orderedLevels(within);
  const from = MIKA_LEVELS.indexOf(level);
  const chosen = MIKA_LEVELS.slice(from).map((tier) => within.find((spec) => spec.tier === tier)).find(Boolean);
  if (!chosen) {
    throw new MikaUnavailable(
      'mika_no_model_at_level',
      `${provider} has no ${level} model or anything above it for Mika.`,
      available,
      level,
    );
  }
  return {
    requested_level: level,
    provider: chosen.provider,
    model: chosen.model,
    resolved_level: chosen.tier,
    provider_notice: general && !generalReady ? 'default_provider_unavailable' : null,
    available_levels: available,
    spec: chosen,
  };
}

export async function resolveConfiguredMikaModel(): Promise<MikaSelection> {
  const agents = await readAgentsSection();
  const sessions = agents.sessions && typeof agents.sessions === 'object'
    ? agents.sessions as Record<string, unknown> : {};
  const dflt = sessions.default && typeof sessions.default === 'object'
    ? sessions.default as Record<string, unknown> : {};
  const jobs = agents.jobs && typeof agents.jobs === 'object' ? agents.jobs as Record<string, unknown> : {};
  const legacy = jobs.mikaassist && typeof jobs.mikaassist === 'object'
    ? jobs.mikaassist as Record<string, unknown>
    : jobs.mika && typeof jobs.mika === 'object' ? jobs.mika as Record<string, unknown> : {};
  const specs = await listSessionLaunchSpecs();
  let level = mikaLevelFromAgents(agents);
  if (legacy.level === undefined && (legacy.provider !== undefined || legacy.model !== undefined)) {
    const pair = specs.find((spec) => spec.provider === legacy.provider && spec.model === legacy.model);
    if (!pair) throw new MikaUnavailable('mika_model_level_choice_required', 'Mika’s previous model is no longer in the catalog. Choose Light, Standard, or Frontier before she starts.');
    level = pair.tier;
  }
  return resolveMikaModel({
    level,
    generalProvider: typeof dflt.provider === 'string' ? dflt.provider : '',
    specs,
    summary: await readProviderSummary(),
  });
}

export const mikaHomeDir = (): string => storeDir('mika_home');
export const mikaHouseDir = (): string => path.join(REPO_ROOT, 'ronin_session_boot', 'house', 'mika');
export const mikaRulesSource = (): string => path.join(mikaHouseDir(), 'MIKA_RULES.md');
export const mikaStartHereSource = (): string => path.join(mikaHouseDir(), 'START_HERE.md');
/** What she is TOLD at birth, one line each; the long reading is in her README. */
export const MIKA_PROMPTS = {
  help: 'The owner opened Help without asking anything yet. Say hello in one line, say what you can do, and wait.',
  setup_provider_ready: 'The owner just signed in their first model provider on Ronin Setup. Follow the Setup walkthrough in your README, starting with its first question.',
} as const;
export const mikaStartHerePath = (): string => path.join(mikaHomeDir(), 'START_HERE.md');

/** Create once, then fail closed on links, ownership, permissions, or path substitution. */
export async function ensureMikaHome(): Promise<string> {
  const dir = mikaHomeDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const link = await lstat(dir);
  if (!link.isDirectory() || link.isSymbolicLink()) throw new Error(`Mika home is not a private directory: ${dir}`);
  await chmod(dir, 0o700);
  const [resolved, info] = await Promise.all([realpath(dir), stat(dir)]);
  if (resolved !== dir) throw new Error(`Mika home resolves somewhere else: ${dir} -> ${resolved}`);
  if (typeof process.getuid === 'function' && info.uid !== process.getuid()) throw new Error(`Mika home is owned by another account: ${dir}`);
  if ((info.mode & 0o777) !== 0o700) throw new Error(`Mika home permissions are not 0700: ${dir}`);
  const stock = await readFile(mikaStartHereSource(), 'utf8');
  const target = mikaStartHerePath();
  try {
    const present = await readFile(target, 'utf8');
    if (present !== stock) throw new Error(`Mika starter is corrupt: ${target}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await writeFile(target, stock, { encoding: 'utf8', mode: 0o444, flag: 'wx' });
  }
  await chmod(target, 0o444);
  return dir;
}

export async function readMikaStartHere(): Promise<string> {
  const text = await readFile(mikaStartHerePath(), 'utf8');
  if (text !== await readFile(mikaStartHereSource(), 'utf8')) throw new Error(`Mika starter is corrupt: ${mikaStartHerePath()}`);
  return text;
}
