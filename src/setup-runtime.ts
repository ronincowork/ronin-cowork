import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AGENTS, launchArgv, listAgentAvailability } from './agents.js';
import { updateSection } from './machine-state.js';
import { upsertProjectRoot } from './project-roots.js';
import { rootDir } from './resources.js';
import { execFile as run } from './spawn-broker.js';
import { collectBirthLines } from './sockets.js';
import { createSession, killSessionTree, sessionExists, setLaunchStamp, setTags } from './tmux.js';

export const PROVIDER_SETUP_TEAM = 'provider_setup';
export const INSTALLED_ROOTS = [
  { name: 'ronin_lab', label: 'Ronin Lab', remit: 'Ideas, assistants, notes, research, and pre-project work.', managed: false },
  { name: 'ronin_project_1', label: 'Ronin Project 1', remit: 'The first project-shaped workspace folder.', managed: true },
] as const;

interface ProviderMarker { activated_at?: unknown }
interface SetupSection { providers?: Record<string, ProviderMarker>; [key: string]: unknown }

export interface SetupProviderState {
  id: string;
  label: string;
  from: string;
  installed: boolean;
  installable: boolean;
  install: string | null;
  blocked: string | null;
  path: string | null;
  login_open: boolean;
  activated: boolean;
  activated_at: string | null;
  session: string;
  state: 'absent' | 'installable' | 'installed' | 'login_open' | 'activated';
}

export interface SetupRuntimeAnswer {
  providers: SetupProviderState[];
  activated_count: number;
  activated_band: 'zero' | 'one' | 'two_plus';
  roots: Array<{ name: string; label: string; dir: string }>;
}

export interface ProviderSessionOps {
  exists(name: string): Promise<boolean>;
  open(provider: string, name: string): Promise<void>;
  close(name: string): Promise<void>;
}

type Availability = Awaited<ReturnType<typeof listAgentAvailability>>;

const sessionName = (provider: string) => `provider_setup_${provider}`;
const activatedAt = (section: SetupSection, provider: string): string | null => {
  const value = section.providers?.[provider]?.activated_at;
  return typeof value === 'string' && value.trim() ? value : null;
};

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

export async function setupRuntimeAnswer(
  section: SetupSection,
  ops: Pick<ProviderSessionOps, 'exists'> = defaultSessionOps,
  availability?: Availability,
): Promise<SetupRuntimeAnswer> {
  const available = availability ?? await listAgentAvailability();
  const providers = await Promise.all(available.map(async (agent): Promise<SetupProviderState> => {
    const session = sessionName(agent.id);
    const loginOpen = await ops.exists(session);
    const completed = activatedAt(section, agent.id);
    const activated = agent.installed && completed !== null;
    return {
      id: agent.id,
      label: agent.label,
      from: agent.from,
      installed: agent.installed,
      installable: !agent.installed && Boolean(agent.get),
      install: agent.get || null,
      blocked: agent.parked || null,
      path: agent.path || null,
      login_open: loginOpen,
      activated,
      activated_at: completed,
      session,
      state: activated ? 'activated' : loginOpen ? 'login_open' : agent.installed ? 'installed' : agent.get ? 'installable' : 'absent',
    };
  }));
  const activated_count = providers.filter((provider) => provider.activated).length;
  const roots = INSTALLED_ROOTS.map((root) => ({ ...root, dir: path.join(rootDir('user'), root.label) }));
  return {
    providers,
    activated_count,
    activated_band: activated_count === 0 ? 'zero' : activated_count === 1 ? 'one' : 'two_plus',
    roots: roots.map(({ name, label, dir }) => ({ name, label, dir })),
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
  for (const root of INSTALLED_ROOTS) {
    const dir = path.join(rootDir('user'), root.label);
    await ensureRepository(dir, root.label, root.managed);
    await upsertProjectRoot(root.name, {
      dir,
      match: root.label.toLowerCase(),
      remit: root.remit,
      archived: '',
    }, { declareArrangement: false });
    installed.push({ name: root.name, label: root.label, dir });
  }
  return installed;
}
