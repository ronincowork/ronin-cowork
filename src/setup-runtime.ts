import { mkdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { updateCommand, updateLineOf } from './agent-install.js';
import { AGENTS, discoverExecutable, launchArgv, listAgentAvailability } from './agents.js';
import { updateSection } from './machine-state.js';
import { listProviders, newerVersion, type ModelList, type ProviderSummary } from './model-providers.js';
import { activatedAt, npmPackageOf, offAt, providerSignedIn } from './provider-summary.js';
import { rootDir } from './resources.js';
import { runCommand } from './send.js';
import { execFile as run, SpawnBrokerError } from './spawn-broker.js';
import { collectBirthLines } from './sockets.js';
import { killSessionTree, sessionExists } from './tmux.js';
import type { InstalledAnswer } from './routes/installed-api.js';

import { createSetupSession, setupAttachment, PROVIDER_SETUP_TEAM, type SetupSessionPrimitives } from './setup-session.js';
export { PROVIDER_SETUP_TEAM } from './setup-session.js';

interface SetupSection {
  providers?: Record<string, { activated_at?: unknown; off_at?: unknown }>;
  [key: string]: unknown;
}

export interface SetupProviderState {
  /** The CLI id — the key of every machine fact. */
  id: string;
  /** The vendor id this CLI serves, from its entry in `src/agents.ts`. */
  provider: string;
  label: string;
  /** The vendor's name, from the same entry. */
  from: string;
  installed: boolean;
  installable: boolean;
  install: string | null;
  blocked: string | null;
  path: string | null;
  login_open: boolean;
  /** How its sign-in goes, in the CLI's own words (AGENTS signIn, KAN-716); '' when not read. */
  sign_in_how: string;
  /** Whether Ronin signs it in itself, without a terminal (AGENTS `login`, src/provider-sign-in.ts). */
  direct_sign_in: boolean;
  install_open: boolean;
  signed_in: boolean;
  activated: boolean;
  activated_at: string | null;
  /** Turned off by the owner: Ronin is not using this provider. The sign-in is kept; live tiles run on. */
  off: boolean;
  off_at: string | null;
  /** What the installed CLI said it is; null when not installed or it would not say. */
  version: string | null;
  /** Its own model list as Refresh all last read it, with the date and the CLI version; null until read, or when not activated. */
  model_list: ModelList | null;
  /** The newest release its package source listed at the last Refresh; null when never asked or unaskable. */
  latest: string | null;
  latest_checked_at: string | null;
  /** Installed, and the registry knows how to update it — the Update control's condition. */
  updatable: boolean;
  /** The CLI's documented behavior: it normally updates itself without an owner action. */
  self_updates: boolean;
  /** The line Update runs, for the owner to read before pressing. */
  update: string | null;
  /** Registry-owned native command Mika may run for this provider's authentication flow. */
  login_command: string;
  /** Latest is known and newer than what is installed. */
  update_available: boolean;
  /** Whether Refresh has a package source to ask for this CLI's newest release (its install line names an npm package). */
  askable: boolean;
  /** An update is running in its temporary provider_setup session; `attachment` shows it. */
  update_open: boolean;
  attachment: { type: 'session'; key: string; team: typeof PROVIDER_SETUP_TEAM; temporary: true } | null;
  state: 'absent' | 'installable' | 'installed' | 'login_open' | 'activated' | 'off';
}

export interface SetupRuntimeAnswer {
  providers: SetupProviderState[];
  activated_count: number;
  activated_band: 'zero' | 'one' | 'two_plus';
  /** When the machine facts were measured; a reader shows a stale date rather than guessing. */
  measured_at: string;
  /** When Refresh all last read every activated CLI's model list; '' when never. */
  refreshed_at: string;
  services: { installed: boolean; switched_on: boolean; active: boolean };
}

export interface ProviderSessionOps {
  exists(name: string): Promise<boolean>;
  open(provider: string, name: string): Promise<void>;
  /** A shell session running the registry's update line for the provider, tagged as the sign-in is. */
  openUpdate?(provider: string, name: string): Promise<void>;
  close(name: string): Promise<void>;
}

type Availability = Awaited<ReturnType<typeof listAgentAvailability>>;

const sessionName = (provider: string) => `provider_setup_${provider}`;
const updateSessionName = (provider: string) => `provider_setup_${provider}_update`;
const installSessionName = (provider: string) => `install_${provider}`;

const defaultSessionOps: ProviderSessionOps = {
  exists: sessionExists,
  async open(provider, name) {
    const spec = AGENTS.find((agent) => agent.id === provider);
    if (!spec) throw new Error(`Unknown provider "${provider}".`);
    const launch = await launchArgv(spec.cmd, '');
    if (!launch.argv.length) throw new Error(`${spec.label} is not installed on this machine.`);
    await mkdir(rootDir('user'), { recursive: true });
    await createSetupSession(name, spec.id, rootDir('user'), { agent: false, argv: [] });
    void collectBirthLines(name, true);
    await runCommand(name, [...launch.argv, ...(spec.operations.setup ?? [])].map((arg) => "'" + arg.replace(/'/g, "'\\''") + "'").join(' '));
  },
  async openUpdate(provider, name) {
    const spec = AGENTS.find((agent) => agent.id === provider);
    if (!spec) throw new Error(`Unknown provider "${provider}".`);
    await mkdir(rootDir('user'), { recursive: true });
    await createSetupSession(name, spec.id, rootDir('user'), { agent: false, argv: [] });
    void collectBirthLines(name, true);
    await runCommand(name, updateCommand(spec));
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
): Promise<SetupRuntimeAnswer> {
  const entries = listProviders();
  const providers = await Promise.all(AGENTS.map(async (agent): Promise<SetupProviderState> => {
    const entry = entries.find((row) => row.cli === agent.id);
    const session = sessionName(agent.id);
    const updateSession = updateSessionName(agent.id);
    const installSession = installSessionName(agent.id);
    const [loginOpen, updateOpen, installOpen] = await Promise.all([ops.exists(session), ops.exists(updateSession), ops.exists(installSession)]);
    const completed = activatedAt(section, agent.id);
    const offSince = offAt(section, agent.id);
    const isInstalled = summary.installed.includes(agent.id);
    // While its sign-in is open, the credential file is read now, not from the last measure (KAN-723).
    const signedIn = isInstalled && (summary.signed_in.includes(agent.id) || (loginOpen && await providerSignedIn(agent.id)));
    const activated = isInstalled && offSince === null && (completed !== null || signedIn) && entry?.launchable === true;
    // Not activated: nothing was asked and nothing is offered — Installed, and stop. A
    // version from an earlier measurement is not printed as though it were current.
    const version = activated ? summary.versions?.[agent.id] ?? null : null;
    const latest = activated ? summary.latest?.[agent.id] ?? null : null;
    const updateLine = activated ? updateLineOf(agent) : '';
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
      sign_in_how: agent.signIn,
      direct_sign_in: 'login' in agent,
      install_open: installOpen,
      signed_in: signedIn,
      activated,
      activated_at: completed,
      off: offSince !== null,
      off_at: offSince,
      version,
      model_list: activated ? summary.models?.[agent.id] ?? null : null,
      latest: latest?.version ?? null,
      latest_checked_at: latest?.checked_at ?? null,
      updatable: activated && Boolean(updateLine),
      self_updates: agent.operations.selfUpdates,
      update: activated && updateLine ? updateLine : null,
      login_command: [agent.cmd, ...(agent.operations.setup ?? [])].join(' '),
      update_available: Boolean(version && latest && newerVersion(version, latest.version)),
      askable: npmPackageOf(agent.operations.install) !== '',
      update_open: updateOpen,
      // One attachment per provider: sign-in, update, then install. The same Close
      // ends all three; installation remains visible after the binary appears.
      attachment: loginOpen ? setupAttachment(session)
        : updateOpen ? setupAttachment(updateSession)
          : installOpen ? setupAttachment(installSession) : null,
      state: offSince !== null && isInstalled ? 'off' : activated ? 'activated' : loginOpen ? 'login_open' : isInstalled ? 'installed' : agent.operations.install ? 'installable' : 'absent',
    };
  }));
  const activated_count = providers.filter((provider) => provider.activated).length;
  return {
    providers,
    activated_count,
    activated_band: activated_count === 0 ? 'zero' : activated_count === 1 ? 'one' : 'two_plus',
    measured_at: summary.measured_at,
    refreshed_at: summary.refreshed_at,
    services: {
      installed: installed?.services.installed ?? false,
      switched_on: installed?.services.switched_on ?? false,
      active: Boolean(installed?.services.installed && installed.services.switched_on && installed.services.loaded.length),
    },
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

/**
 * Close ends whichever temporary session the provider has open — install, sign-in, update,
 * or any combination — through the one teardown. Nothing shown in the page outlives it.
 */
export async function closeProviderLogin(provider: string, ops: ProviderSessionOps = defaultSessionOps): Promise<{ session: string; closed: boolean }> {
  if (!AGENTS.some((agent) => agent.id === provider)) throw new Error(`Unknown provider "${provider}".`);
  let closed: string | null = null;
  // Keep the long-standing sign-in name as the receipt when several exist; install joins
  // the teardown without changing the close response callers already consume.
  for (const session of [sessionName(provider), updateSessionName(provider), installSessionName(provider)]) {
    if (!(await ops.exists(session))) continue;
    await ops.close(session);
    closed ??= session;
  }
  return { session: closed ?? sessionName(provider), closed: closed !== null };
}

/**
 * Update: the registry's update line in a temporary provider_setup session, shown in the
 * page like a sign-in and ended by the same Close. The owner's press, never Ronin's.
 */
export async function openProviderUpdate(
  provider: string,
  ops: ProviderSessionOps = defaultSessionOps,
  availability?: Availability,
): Promise<{ session: string; opened: boolean }> {
  const spec = AGENTS.find((agent) => agent.id === provider);
  if (!spec) throw new Error(`Unknown provider "${provider}".`);
  if (!updateLineOf(spec)) throw new Error(`Nothing updates ${spec.label} from here yet.`);
  const installed = (availability ?? await listAgentAvailability()).find((agent) => agent.id === provider)?.installed === true;
  if (!installed) throw new Error(`${spec.label} is not installed on this machine; install it first.`);
  if (!ops.openUpdate) throw new Error('This box cannot open an update session.');
  const session = updateSessionName(provider);
  if (await ops.exists(session)) return { session, opened: false };
  await ops.openUpdate(provider, session);
  return { session, opened: true };
}

export async function completeProviderLogin(
  provider: string,
  ops: ProviderSessionOps = defaultSessionOps,
  now = () => new Date().toISOString(),
  record: (provider: string, activated_at: string) => Promise<void> = recordProviderActivation,
): Promise<{ session: string; activated_at: string }> {
  if (!AGENTS.some((agent) => agent.id === provider)) throw new Error(`Unknown provider "${provider}".`);
  const loginSession = sessionName(provider);
  const installSession = installSessionName(provider);
  const session = await ops.exists(loginSession)
    ? loginSession
    : await ops.exists(installSession) ? installSession : '';
  if (!session) throw new Error(`No open login or install session for ${provider}; activation was not recorded.`);
  const activated_at = now();
  await record(provider, activated_at);
  await closeProviderLogin(provider, ops);
  return { session, activated_at };
}

/**
 * THE SWITCH. Off writes Ronin's own `off_at` and nothing else — no vendor file, no
 * session; on deletes it. What the record then says is measured, not assumed: the caller
 * measures again so `operational` moves with the switch.
 */
export async function setProviderOff(provider: string, off: boolean, now = () => new Date().toISOString()): Promise<{ provider: string; off: boolean; off_at: string | null }> {
  if (!AGENTS.some((agent) => agent.id === provider)) throw new Error(`Unknown provider "${provider}".`);
  let off_at: string | null = null;
  await updateSection<SetupSection>('setup', (setup) => {
    const current = { ...(setup.providers?.[provider] ?? {}) };
    if (off) { off_at = now(); current.off_at = off_at; } else { delete current.off_at; }
    return { ...setup, providers: { ...(setup.providers ?? {}), [provider]: current } };
  });
  return { provider, off, off_at };
}

async function recordProviderActivation(provider: string, activated_at: string): Promise<void> {
  await updateSection<SetupSection>('setup', (setup) => ({
    ...setup,
    providers: { ...(setup.providers ?? {}), [provider]: { ...setup.providers?.[provider], activated_at } },
  }));
}

async function exists(file: string): Promise<boolean> {
  try { await stat(file); return true; } catch { return false; }
}

async function git(dir: string, args: string[]): Promise<string> {
  return (await run('git', ['-C', dir, ...args], { timeout: 10_000 })).stdout.trim();
}

/** GitHub on this machine (KAN-809): whether gh is there and signed in, as whom. Signing in is the
 * Helpful Assistant's, in her chat; nothing here opens a session. */
export type GithubSetupState = 'missing' | 'needs_authentication' | 'authenticated' | 'unreadable';
export interface GithubSetupAnswer {
  installed: boolean;
  authenticated: boolean;
  account: string;
  state: GithubSetupState;
  problem: string;
}

export async function githubSetupAnswer(): Promise<GithubSetupAnswer> {
  const gh = await discoverExecutable('gh');
  if (!gh) return { installed: false, authenticated: false, account: '', state: 'missing', problem: '' };
  try {
    // `gh api user` verifies the active github.com credential and prints only its login.
    const login = (await run(gh, ['api', 'user', '--hostname', 'github.com', '--jq', '.login'], { timeout: 8_000 })).stdout.trim();
    const account = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login) ? login : '';
    return account
      ? { installed: true, authenticated: true, account, state: 'authenticated', problem: '' }
      : { installed: true, authenticated: false, account: '', state: 'unreadable', problem: 'GitHub CLI returned an unreadable authentication result.' };
  } catch (error) {
    return error instanceof SpawnBrokerError && error.code === 4
      ? { installed: true, authenticated: false, account: '', state: 'needs_authentication', problem: '' }
      : { installed: true, authenticated: false, account: '', state: 'unreadable', problem: 'Ronin could not ask GitHub CLI to verify authentication.' };
  }
}

/** A repository cloned into `parent`, a Workspace's repos/ (addRepository, src/workspaces.ts; KAN-809):
 * any Git URL, from any host, with plain git; `owner/name` means GitHub. A public one needs no sign-in;
 * a private one needs this machine's Git or GitHub sign-in, and git says so in its own words. */
export async function cloneRepository(repository: unknown, parent: string): Promise<{ dir: string }> {
  const entered = typeof repository === 'string' ? repository.trim() : '';
  const shorthand = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(entered);
  const url = /^(?:https?:\/\/|ssh:\/\/|git@[^:]+:|git:\/\/)\S+$/.test(entered);
  if (!shorthand && !url) throw new Error('Paste a Git URL (https://…, git@…) or owner/name for GitHub.');
  const remote = shorthand ? `https://github.com/${shorthand[1]}.git` : entered;
  const base = remote.replace(/\.git$/, '').replace(/\/+$/, '').split(/[/:]/).pop() || '';
  if (!/^[A-Za-z0-9_.-]+$/.test(base)) throw new Error('That URL names no repository.');
  const dir = path.join(parent, base);
  if (await exists(dir)) throw new Error(`The destination ${dir} already exists.`);
  const git = await discoverExecutable('git');
  if (!git) throw new Error('Git is not installed or is not available to the owner’s login shell.');
  try {
    await run(git, ['clone', remote, dir], {
      timeout: 120_000, maxBuffer: 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
    });
  } catch (error) {
    const detail = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr || '') : '';
    const safe = detail
      .replace(/https?:\/\/[^\s/@]+(?::[^\s/@]*)?@/gi, 'https://[credentials]@')
      .replace(/\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[credential]')
      .replace(/([?&](?:access_token|token|password)=)[^\s&]+/gi, '$1[credential]')
      .replace(/[\r\n]+/g, ' ').trim().slice(0, 500);
    throw new Error(safe || 'Git could not access that repository with this machine’s current Git connection.');
  }
  return { dir };
}

/** The signed-in GitHub account's repositories, newest first, as gh lists them (w926). */
export async function githubRepositories(): Promise<Array<{ name: string; url: string; private: boolean }>> {
  const gh = await discoverExecutable('gh');
  if (!gh) throw new Error('GitHub is not connected here.');
  const { stdout } = await run(gh, ['repo', 'list', '--limit', '100', '--json', 'nameWithOwner,url,isPrivate'], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  return (JSON.parse(String(stdout || '[]')) as Array<{ nameWithOwner: string; url: string; isPrivate: boolean }>)
    .map((repo) => ({ name: repo.nameWithOwner, url: `${repo.url}.git`, private: repo.isPrivate }));
}

/** A new folder's repository, created on GitHub with the GitHub CLI: origin set, the first commit pushed.
 *  The folder stays whatever happens; the one line thrown is git's or gh's own message. No pre-checks:
 *  a folder that is not a repository says so itself. */
export async function createGithubRepository(dirRaw: unknown, visibilityRaw: unknown): Promise<{ repository: string; url: string }> {
  const dir = path.resolve(typeof dirRaw === 'string' ? dirRaw.trim() : '');
  const visibility = visibilityRaw === 'public' ? 'public' : 'private';
  const gh = await discoverExecutable('gh');
  if (!gh) throw new Error('GitHub CLI is not installed on this machine.');
  const name = path.basename(dir);
  const line = (error: unknown) => {
    const detail = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr || '') : error instanceof Error ? error.message : '';
    return detail.replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
  };
  // gh pushes commits, so a fresh folder gets its first one: a README that names it (the identity ensureRepository uses).
  const committed = await git(dir, ['rev-parse', '--verify', '--quiet', 'HEAD']).then(() => true, () => false);
  if (!committed) {
    const readme = path.join(dir, 'README.md');
    if (!(await exists(readme))) await writeFile(readme, `# ${name}\n`, 'utf8');
    try { await git(dir, ['add', '-A']); await git(dir, ['-c', 'user.name=Ronin', '-c', 'user.email=ronin@localhost', 'commit', '-m', `Start ${name}`]); }
    catch (error) { throw new Error(`The first commit failed: ${line(error) || 'git commit refused'}`); }
  }
  try {
    const result = await run(gh, ['repo', 'create', name, `--${visibility}`, '--source', dir, '--remote', 'origin', '--push'], { timeout: 60_000, maxBuffer: 1024 * 1024 });
    const url = result.stdout.trim().split(/\s+/).find((word) => /^https:\/\/github\.com\//.test(word)) || '';
    const repository = url.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '') || name;
    return { repository, url };
  } catch (error) {
    throw new Error(`GitHub did not create it: ${line(error) || 'the GitHub CLI refused'}`);
  }
}
