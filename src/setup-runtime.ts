import { mkdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AGENTS, launchArgv, listAgentAvailability } from './agents.js';
import { updateSection } from './machine-state.js';
import { listProviderCatalog, newerVersion, type ProviderCatalogEntry, type ProviderSummary } from './model-providers.js';
import { activatedAt } from './provider-summary.js';
import { peekProjectRoots, upsertProjectRoot } from './project-roots.js';
import { rootDir } from './resources.js';
import { execFile as run } from './spawn-broker.js';
import { collectBirthLines } from './sockets.js';
import { createSession, killSessionTree, sessionExists, setLaunchStamp, setTags } from './tmux.js';
import { addJob, isValidTeam, listJobs, type Job } from './jikan.js';
import type { InstalledAnswer } from './routes/installed-api.js';

export const PROVIDER_SETUP_TEAM = 'provider_setup';
export const INSTALLED_ROOTS = [
  { name: 'ronin_lab', label: 'Ronin Lab', remit: 'Ideas, assistants, notes, research, and pre-project work.', managed: false },
  { name: 'ronin_project_1', label: 'Ronin Project 1', remit: 'The first project-shaped workspace folder.', managed: true },
] as const;

export const SETUP_PREFERENCE_KINDS = ['build', 'life', 'research'] as const;
export type SetupPreferenceKind = typeof SETUP_PREFERENCE_KINDS[number];
export interface SetupPreferences { kinds: SetupPreferenceKind[]; providers: string[] }
interface SetupSection {
  providers?: Record<string, { activated_at?: unknown }>;
  preferences?: { kinds?: unknown; providers?: unknown };
  [key: string]: unknown;
}

export interface SetupProviderState {
  /** The CLI id — the key of every machine fact. */
  id: string;
  /** The vendor id the catalog joins to this CLI; '' when the catalog has no section for it. */
  provider: string;
  label: string;
  /** The vendor's name, from the catalog. */
  from: string;
  installed: boolean;
  installable: boolean;
  install: string | null;
  blocked: string | null;
  path: string | null;
  login_open: boolean;
  signed_in: boolean;
  activated: boolean;
  activated_at: string | null;
  /** Catalog cells this CLI can launch; zero means it cannot count as activated. */
  models: number;
  /** What the installed CLI said it is; null when not installed or it would not say. */
  version: string | null;
  /** The newest release its package source listed at the last Refresh; null when never asked or unaskable. */
  latest: string | null;
  latest_checked_at: string | null;
  /** Installed, and the registry knows how to update it — the Update control's condition. */
  updatable: boolean;
  /** The line Update runs, for the owner to read before pressing. */
  update: string | null;
  /** Latest is known and newer than what is installed. */
  update_available: boolean;
  attachment: { type: 'session'; key: string; team: typeof PROVIDER_SETUP_TEAM; temporary: true } | null;
  state: 'absent' | 'installable' | 'installed' | 'login_open' | 'activated';
}

export interface SetupRuntimeAnswer {
  providers: SetupProviderState[];
  activated_count: number;
  activated_band: 'zero' | 'one' | 'two_plus';
  /** When the machine facts were measured; a reader shows a stale date rather than guessing. */
  measured_at: string;
  roots: Array<{ name: string; label: string; dir: string }>;
  gbrain: { installed: boolean; active: boolean };
  services: { installed: boolean; activated: boolean; switched_on: boolean; active: boolean };
  preferences: SetupPreferences;
}

export interface ProviderSessionOps {
  exists(name: string): Promise<boolean>;
  open(provider: string, name: string): Promise<void>;
  close(name: string): Promise<void>;
}

type Availability = Awaited<ReturnType<typeof listAgentAvailability>>;

const sessionName = (provider: string) => `provider_setup_${provider}`;

export function setupPreferences(section: SetupSection): SetupPreferences {
  const selected = new Set(
    (Array.isArray(section.preferences?.kinds) ? section.preferences.kinds : [])
      .filter((kind): kind is SetupPreferenceKind =>
        typeof kind === 'string' && SETUP_PREFERENCE_KINDS.includes(kind as SetupPreferenceKind)),
  );
  const providers = Array.isArray(section.preferences?.providers)
    ? [...new Set(section.preferences.providers.filter((provider): provider is string =>
      typeof provider === 'string' && /^[a-z0-9_-]+$/.test(provider)))]
    : [];
  return { kinds: SETUP_PREFERENCE_KINDS.filter((kind) => selected.has(kind)), providers };
}

export async function writeSetupPreferences(input: unknown): Promise<SetupPreferences> {
  const patch = Array.isArray(input) ? { kinds: input } : input;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Send Setup preferences.');
  const update = patch as { kinds?: unknown; providers?: unknown };
  if (update.kinds === undefined && update.providers === undefined) throw new Error('Send kinds or providers.');
  let written: SetupPreferences = { kinds: [], providers: [] };
  await updateSection<SetupSection>('setup', (setup) => {
    const current = setupPreferences(setup);
    const kinds = update.kinds === undefined ? current.kinds : update.kinds;
    const providers = update.providers === undefined ? current.providers : update.providers;
    if (!Array.isArray(kinds) || kinds.some((kind) => typeof kind !== 'string' || !SETUP_PREFERENCE_KINDS.includes(kind as SetupPreferenceKind))) {
      throw new Error('Kinds are build, life, and research.');
    }
    if (!Array.isArray(providers) || providers.some((provider) => typeof provider !== 'string' || !/^[a-z0-9_-]+$/.test(provider))) {
      throw new Error('Providers must be provider IDs.');
    }
    written = setupPreferences({ preferences: { kinds, providers } });
    return { ...setup, preferences: written };
  });
  return written;
}

const defaultSessionOps: ProviderSessionOps = {
  exists: sessionExists,
  async open(provider, name) {
    const spec = AGENTS.find((agent) => agent.id === provider);
    if (!spec) throw new Error(`Unknown provider "${provider}".`);
    const launch = await launchArgv(spec.cmd, '');
    if (!launch.argv.length) throw new Error(`${spec.label} is not installed on this machine.`);
    await mkdir(rootDir('user'), { recursive: true });
    await createSession(name, rootDir('user'), { agent: true, argv: launch.argv });
    void collectBirthLines(name, true);
    await setTags(name, [PROVIDER_SETUP_TEAM]);
    await setLaunchStamp(name, spec.id);
  },
  close: killSessionTree,
};

/**
 * The runtime facts as the Campaign's summary holds them. Only `login_open` is live: a
 * tmux session's presence is an attachment, not a probe of the provider.
 */
export async function setupRuntimeAnswer(
  section: SetupSection,
  summary: ProviderSummary,
  ops: Pick<ProviderSessionOps, 'exists'> = defaultSessionOps,
  installed?: InstalledAnswer,
  catalog?: ProviderCatalogEntry[],
): Promise<SetupRuntimeAnswer> {
  const entries = catalog ?? await listProviderCatalog();
  const providers = await Promise.all(AGENTS.map(async (agent): Promise<SetupProviderState> => {
    const entry = entries.find((row) => row.cli === agent.id);
    const session = sessionName(agent.id);
    const loginOpen = await ops.exists(session);
    const completed = activatedAt(section, agent.id);
    const isInstalled = summary.installed.includes(agent.id);
    const signedIn = isInstalled && summary.signed_in.includes(agent.id);
    const models = entry?.models.length ?? 0;
    const activated = isInstalled && (completed !== null || signedIn) && models > 0;
    const version = isInstalled ? summary.versions?.[agent.id] ?? null : null;
    const latest = isInstalled ? summary.latest?.[agent.id] ?? null : null;
    const updateLine = agent.operations.update.shell || (agent.operations.update.argv.length ? [agent.cmd, ...agent.operations.update.argv].join(' ') : '');
    return {
      id: agent.id,
      provider: entry?.provider ?? '',
      label: agent.label,
      from: entry?.label ?? '',
      installed: isInstalled,
      installable: !isInstalled && Boolean(agent.operations.install),
      install: agent.operations.install || null,
      blocked: agent.parked || null,
      path: isInstalled ? summary.paths[agent.id] ?? null : null,
      login_open: loginOpen,
      signed_in: signedIn,
      activated,
      activated_at: completed,
      models,
      version,
      latest: latest?.version ?? null,
      latest_checked_at: latest?.checked_at ?? null,
      updatable: isInstalled && Boolean(updateLine),
      update: isInstalled && updateLine ? updateLine : null,
      update_available: Boolean(version && latest && newerVersion(version, latest.version)),
      attachment: loginOpen ? { type: 'session', key: session, team: PROVIDER_SETUP_TEAM, temporary: true } : null,
      state: activated ? 'activated' : loginOpen ? 'login_open' : isInstalled ? 'installed' : agent.operations.install ? 'installable' : 'absent',
    };
  }));
  const activated_count = providers.filter((provider) => provider.activated).length;
  const roots = INSTALLED_ROOTS.map((root) => ({ ...root, dir: path.join(rootDir('user'), root.label) }));
  return {
    providers,
    activated_count,
    activated_band: activated_count === 0 ? 'zero' : activated_count === 1 ? 'one' : 'two_plus',
    measured_at: summary.measured_at,
    roots: roots.map(({ name, label, dir }) => ({ name, label, dir })),
    gbrain: {
      installed: installed?.services.parts.includes('gbrain') ?? false,
      active: installed?.services.loaded.includes('gbrain') ?? false,
    },
    services: {
      installed: installed?.services.installed ?? false,
      activated: installed?.services.activated ?? false,
      switched_on: installed?.services.switched_on ?? false,
      active: Boolean(installed?.services.installed && installed.services.activated && installed.services.switched_on && installed.services.loaded.length),
    },
    preferences: setupPreferences(section),
  };
}

export async function openProviderLogin(
  provider: string,
  ops: ProviderSessionOps = defaultSessionOps,
  availability?: Availability,
): Promise<{ session: string; opened: boolean }> {
  const spec = AGENTS.find((agent) => agent.id === provider);
  if (!spec) throw new Error(`Unknown provider "${provider}".`);
  const installed = (availability ?? await listAgentAvailability()).find((agent) => agent.id === provider)?.installed === true;
  if (!installed) throw new Error(`${spec.label} is not installed on this machine.`);
  const session = sessionName(provider);
  if (await ops.exists(session)) return { session, opened: false };
  await ops.open(provider, session);
  return { session, opened: true };
}

export async function closeProviderLogin(provider: string, ops: ProviderSessionOps = defaultSessionOps): Promise<{ session: string; closed: boolean }> {
  if (!AGENTS.some((agent) => agent.id === provider)) throw new Error(`Unknown provider "${provider}".`);
  const session = sessionName(provider);
  if (!(await ops.exists(session))) return { session, closed: false };
  await ops.close(session);
  return { session, closed: true };
}

export async function completeProviderLogin(
  provider: string,
  ops: ProviderSessionOps = defaultSessionOps,
  now = () => new Date().toISOString(),
  record: (provider: string, activated_at: string) => Promise<void> = recordProviderActivation,
): Promise<{ session: string; activated_at: string }> {
  if (!AGENTS.some((agent) => agent.id === provider)) throw new Error(`Unknown provider "${provider}".`);
  const session = sessionName(provider);
  if (!(await ops.exists(session))) throw new Error(`No open login session for ${provider}; activation was not recorded.`);
  const activated_at = now();
  await record(provider, activated_at);
  await ops.close(session);
  return { session, activated_at };
}

async function recordProviderActivation(provider: string, activated_at: string): Promise<void> {
  await updateSection<SetupSection>('setup', (setup) => ({
    ...setup,
    providers: { ...(setup.providers ?? {}), [provider]: { activated_at } },
  }));
}

async function exists(file: string): Promise<boolean> {
  try { await stat(file); return true; } catch { return false; }
}

async function git(dir: string, args: string[]): Promise<string> {
  return (await run('git', ['-C', dir, ...args], { timeout: 10_000 })).stdout.trim();
}

async function ensureRepository(dir: string, label: string, managed: boolean): Promise<void> {
  await mkdir(dir, { recursive: true });
  if (!(await exists(path.join(dir, '.git')))) await git(dir, ['init', '-b', 'main']);
  const readme = path.join(dir, 'README.md');
  if (!(await exists(readme))) await writeFile(readme, `# ${label}\n`, 'utf8');
  const tracked = ['README.md'];
  if (managed) {
    const arrangement = path.join(dir, 'RONIN_REPO');
    if (!(await exists(arrangement))) {
      await writeFile(arrangement, [
        '# RONIN_REPO — this repository is ready for Ronin Worktrees.',
        'mode=reviewed',
        'working=dev',
        'stable=main',
        'desks=managed',
        '',
      ].join('\n'), 'utf8');
    }
    tracked.push('RONIN_REPO');
  }
  const hasHead = await git(dir, ['rev-parse', '--verify', 'HEAD']).then(() => true, () => false);
  if (!hasHead) {
    await git(dir, ['add', '--', ...tracked]);
    await git(dir, ['-c', 'user.name=Ronin', '-c', 'user.email=ronin@localhost', 'commit', '-m', `Start ${label}`]);
  }
  if (managed && !(await git(dir, ['show-ref', '--verify', '--quiet', 'refs/heads/dev']).then(() => true, () => false))) {
    await git(dir, ['branch', 'dev', 'HEAD']);
  }
}

export async function ensureInstalledRoots(): Promise<Array<{ name: string; label: string; dir: string }>> {
  const installed = [];
  const known = await peekProjectRoots();
  for (const root of INSTALLED_ROOTS) {
    const dir = path.join(rootDir('user'), root.label);
    await ensureRepository(dir, root.label, root.managed);
    // Register once. A runtime read runs this on every call; rewriting an unchanged
    // catalog each time is what let concurrent reads collide.
    const current = known.find((row) => row.name === root.name);
    if (!current || path.resolve(current.dir) !== path.resolve(dir) || current.archived) {
      await upsertProjectRoot(root.name, {
        dir,
        match: root.label.toLowerCase(),
        remit: root.remit,
        archived: '',
      }, { declareArrangement: false });
    }
    installed.push({ name: root.name, label: root.label, dir });
  }
  return installed;
}

export interface MorningBriefScheduleDraft {
  team: unknown;
  request: unknown;
  when: unknown;
}

export async function createMorningBriefSchedule(draft: MorningBriefScheduleDraft): Promise<{ team: string; job: Job }> {
  const team = typeof draft.team === 'string' ? draft.team.trim() : '';
  const job = await addJob(team, { request: draft.request, when: draft.when, to: 'lead', by: 'owner' });
  return { team, job };
}

export async function morningBriefSchedules(team: string): Promise<{ team: string; schedules: Job[] }> {
  if (!isValidTeam(team)) throw new Error('A team name is lowercase letters, digits, _ and -.');
  return { team, schedules: await listJobs(team) };
}
