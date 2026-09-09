import { chmod, lstat, mkdir, realpath, stat } from 'node:fs/promises';
import { storeDir } from './resources.js';
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

/** Exact-level only: provider affinity may change the vendor, never the chosen band. */
export function resolveMikaModel(input: {
  level: MikaLevel;
  generalProvider?: string;
  specs: readonly SessionLaunchSpec[];
  summary: ProviderSummary | null;
}): MikaSelection {
  const { level, specs, summary } = input;
  if (!summary) throw new MikaUnavailable('mika_provider_unmeasured', 'Provider readiness has not been measured. Check Model providers before Mika can start.', [], level);
  const operational = new Set(summary.operational);
  // Mika is born with MCP disconnected. A row that cannot express that boundary is not
  // actually launchable for this house seat.
  const eligible = specs.filter((spec) => operational.has(spec.cli) && !!spec.gbrainDisconnected);
  if (!eligible.length) throw new MikaUnavailable('mika_no_ready_provider', 'Mika needs a ready provider that can launch without external tools. Open Model providers.', [], level);
  const available = orderedLevels(eligible);
  const exact = eligible.filter((spec) => spec.tier === level);
  if (!exact.length) {
    throw new MikaUnavailable(
      'mika_no_model_at_level',
      `No ready provider has a ${level} model for Mika. Choose one of the available levels: ${available.join(', ')}.`,
      available,
      level,
    );
  }
  const provider = String(input.generalProvider ?? '').trim();
  const chosen = exact.find((spec) => spec.provider === provider) ?? exact[0];
  const providerKnown = provider && eligible.some((spec) => spec.provider === provider);
  const providerNotice = chosen.provider === provider || !provider
    ? null
    : providerKnown
      ? 'default_provider_has_no_level' as const
      : 'default_provider_unavailable' as const;
  return {
    requested_level: level,
    provider: chosen.provider,
    model: chosen.model,
    resolved_level: chosen.tier,
    provider_notice: providerNotice,
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
  return dir;
}
