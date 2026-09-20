import { mkdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { updateCommand, updateLineOf } from './agent-install.js';
import { AGENTS, discoverExecutable, launchArgv, listAgentAvailability } from './agents.js';
import { updateSection } from './machine-state.js';
import { listProviderCatalog, newerVersion, type ProviderCatalogEntry, type ProviderSummary } from './model-providers.js';
import { activatedAt, npmPackageOf, offAt } from './provider-summary.js';
import { peekProjectRoots, upsertProjectRoot } from './project-roots.js';
import { rootDir } from './resources.js';
import { runCommand } from './send.js';
import { execFile as run } from './spawn-broker.js';
import { collectBirthLines } from './sockets.js';
import { killSessionTree, sessionExists } from './tmux.js';
import { addJob, isValidTeam, listJobs, type Job } from './jikan.js';
import type { InstalledAnswer } from './routes/installed-api.js';

import { createSetupSession, setupAttachment, PROVIDER_SETUP_TEAM, type SetupSessionPrimitives } from './setup-session.js';
export { PROVIDER_SETUP_TEAM } from './setup-session.js';
export const INSTALLED_ROOTS = [
  { name: 'ronin_lab', label: 'Ronin Lab', remit: 'Ideas, assistants, notes, research, and pre-project work.', managed: false },
  { name: 'project_one', label: 'Project One', remit: 'The first project-shaped workspace folder.', managed: true },
] as const;

export const SETUP_PREFERENCE_KINDS = ['build', 'life', 'research', 'other'] as const;
export type SetupPreferenceKind = typeof SETUP_PREFERENCE_KINDS[number];
export interface SetupPreferences { kinds: SetupPreferenceKind[]; providers: string[]; path_note: string; identity_choice: '' | 'email' | 'anonymous' | 'declined'; bounty_opt_in: boolean }
interface SetupSection {
  providers?: Record<string, { activated_at?: unknown; off_at?: unknown; sign_in?: ProviderSignIn }>;
  preferences?: { kinds?: unknown; providers?: unknown; path_note?: unknown; identity_choice?: unknown; bounty_opt_in?: unknown };
  [key: string]: unknown;
}

export interface ProviderSignIn {
  method: 'subscription' | 'api_key' | 'third_party';
  label: string;
  recorded_at: string;
}

/** Owner-described metadata only: saving it never establishes authentication. */
export async function saveProviderSignIn(provider: string, input: unknown): Promise<ProviderSignIn | null> {
  if (!AGENTS.some((agent) => agent.id === provider)) throw new Error(`Unknown provider "${provider}".`);
  if (input === null) {
    await updateSection<SetupSection>('setup', (setup) => {
      const current = { ...setup.providers?.[provider] };
      delete current.sign_in;
      return { ...setup, providers: { ...setup.providers, [provider]: current } };
    });
    return null;
  }
  const data = input as Partial<ProviderSignIn> | null;
  if (!data || !['subscription', 'api_key', 'third_party'].includes(String(data.method))) {
    throw new Error('Choose Subscription, API key, or Third-party service.');
  }
  if (typeof data.label !== 'string' || !data.label.trim() || data.label.trim().length > 120) {
    throw new Error('Give this sign-in a label of 1–120 characters.');
  }
  const sign_in: ProviderSignIn = { method: data.method as ProviderSignIn['method'], label: data.label.trim(), recorded_at: new Date().toISOString() };
  await updateSection<SetupSection>('setup', (setup) => ({
    ...setup,
    providers: { ...setup.providers, [provider]: { ...setup.providers?.[provider], sign_in } },
  }));
  return sign_in;
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
  install_open: boolean;
  sign_in: ProviderSignIn | null;
  signed_in: boolean;
  activated: boolean;
  activated_at: string | null;
  /** Turned off by the owner: Ronin is not using this provider. The sign-in is kept; live tiles run on. */
  off: boolean;
  off_at: string | null;
  /** Catalog cells this CLI can launch; zero means it cannot count as activated. */
  models: number;
  /** What the installed CLI said it is; null when not installed or it would not say. */
  version: string | null;
  /** Its CLI-owned model list, including the CLI version that fetched it; null when not measured. */
  model_list: ProviderSummary['model_lists'][string] | null;
  /** The newest release its package source listed at the last Refresh; null when never asked or unaskable. */
  latest: string | null;
  latest_checked_at: string | null;
  /** Installed, and the registry knows how to update it — the Update control's condition. */
  updatable: boolean;
  /** The CLI's documented behavior: it normally updates itself without an owner action. */
  self_updates: boolean;
  /** The line Update runs, for the owner to read before pressing. */
  update: string | null;
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
  roots: Array<{ name: string; label: string; dir: string }>;
  gbrain: { installed: boolean; active: boolean };
  services: { installed: boolean; switched_on: boolean; active: boolean };
  preferences: SetupPreferences;
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
  const identity = section.preferences?.identity_choice;
  return {
    kinds: SETUP_PREFERENCE_KINDS.filter((kind) => selected.has(kind)), providers,
    path_note: typeof section.preferences?.path_note === 'string' ? section.preferences.path_note : '',
    identity_choice: identity === 'email' || identity === 'anonymous' || identity === 'declined' ? identity : '',
    bounty_opt_in: section.preferences?.bounty_opt_in === true,
  };
}

export async function writeSetupPreferences(input: unknown): Promise<SetupPreferences> {
  const patch = Array.isArray(input) ? { kinds: input } : input;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Send Setup preferences.');
  const update = patch as { kinds?: unknown; providers?: unknown; path_note?: unknown; identity_choice?: unknown; bounty_opt_in?: unknown };
  if (update.kinds === undefined && update.providers === undefined && update.path_note === undefined && update.identity_choice === undefined && update.bounty_opt_in === undefined) throw new Error('Send onboarding preferences.');
  let written: SetupPreferences = { kinds: [], providers: [], path_note: '', identity_choice: '', bounty_opt_in: false };
  await updateSection<SetupSection>('setup', (setup) => {
    const current = setupPreferences(setup);
    const kinds = update.kinds === undefined ? current.kinds : update.kinds;
    const providers = update.providers === undefined ? current.providers : update.providers;
    const path_note = update.path_note === undefined ? current.path_note : update.path_note;
    const identity_choice = update.identity_choice === undefined ? current.identity_choice : update.identity_choice;
    const bounty_opt_in = update.bounty_opt_in === undefined ? current.bounty_opt_in : update.bounty_opt_in;
    if (!Array.isArray(kinds) || kinds.some((kind) => typeof kind !== 'string' || !SETUP_PREFERENCE_KINDS.includes(kind as SetupPreferenceKind))) {
      throw new Error('Kinds are build, life, research, and other.');
    }
    if (!Array.isArray(providers) || providers.some((provider) => typeof provider !== 'string' || !/^[a-z0-9_-]+$/.test(provider))) {
      throw new Error('Providers must be provider IDs.');
    }
    if (typeof path_note !== 'string' || path_note.length > 2000) throw new Error('Path note must be text up to 2000 characters.');
    if (!['', 'email', 'anonymous', 'declined'].includes(String(identity_choice))) throw new Error('Identity choice must be email, anonymous, or declined.');
    if (typeof bounty_opt_in !== 'boolean') throw new Error('Bounty opt-in must be true or false.');
    written = setupPreferences({ preferences: { kinds, providers, path_note, identity_choice, bounty_opt_in } });
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
    await createSetupSession(name, spec.id, rootDir('user'), { agent: false, argv: [] });
    void collectBirthLines(name, true);
    await runCommand(name, launch.argv.map((arg) => "'" + arg.replace(/'/g, "'\\''") + "'").join(' '));
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
  catalog?: ProviderCatalogEntry[],
): Promise<SetupRuntimeAnswer> {
  const entries = catalog ?? await listProviderCatalog();
  const providers = await Promise.all(AGENTS.map(async (agent): Promise<SetupProviderState> => {
    const entry = entries.find((row) => row.cli === agent.id);
    const session = sessionName(agent.id);
    const updateSession = updateSessionName(agent.id);
    const installSession = installSessionName(agent.id);
    const [loginOpen, updateOpen, installOpen] = await Promise.all([ops.exists(session), ops.exists(updateSession), ops.exists(installSession)]);
    const completed = activatedAt(section, agent.id);
    const offSince = offAt(section, agent.id);
    const isInstalled = summary.installed.includes(agent.id);
    const signedIn = isInstalled && summary.signed_in.includes(agent.id);
    const models = entry?.models.length ?? 0;
    const activated = isInstalled && offSince === null && (completed !== null || signedIn) && models > 0;
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
      install_open: installOpen,
      sign_in: section.providers?.[agent.id]?.sign_in ?? null,
      signed_in: signedIn,
      activated,
      activated_at: completed,
      off: offSince !== null,
      off_at: offSince,
      models,
      version,
      model_list: activated ? summary.model_lists?.[agent.id] ?? null : null,
      latest: latest?.version ?? null,
      latest_checked_at: latest?.checked_at ?? null,
      updatable: activated && Boolean(updateLine),
      self_updates: agent.operations.selfUpdates,
      update: activated && updateLine ? updateLine : null,
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
  const roots = INSTALLED_ROOTS.map((root) => ({ ...root, dir: path.join(rootDir('user'), root.name) }));
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
      switched_on: installed?.services.switched_on ?? false,
      active: Boolean(installed?.services.installed && installed.services.switched_on && installed.services.loaded.length),
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

const GITHUB_SETUP_SESSION = 'setup_github';
const GITHUB_INSTALL_SESSION = 'install_github';
const GIT_SETUP_SESSION = 'setup_git';

export type GithubSetupState = 'missing' | 'needs_authentication' | 'authenticated' | 'unreadable';
export interface GithubSetupAnswer {
  installed: boolean;
  authenticated: boolean;
  account: string;
  state: GithubSetupState;
  problem: string;
  installing: boolean;
  attachment: { type: 'session'; key: string; team: typeof PROVIDER_SETUP_TEAM; temporary: true } | null;
}

export interface GithubSetupOps {
  installed(): Promise<boolean>;
  authStatus(): Promise<string>;
  exists(): Promise<boolean>;
  installExists(): Promise<boolean>;
  open(): Promise<void>;
  openInstall(): Promise<void>;
  close(): Promise<void>;
  closeInstall(): Promise<void>;
  logout(account: string): Promise<void>;
}

export type GithubSessionPrimitives = SetupSessionPrimitives;

export async function createGithubSetupSession(
  primitives?: GithubSessionPrimitives,
  command = runCommand,
  executable = () => discoverExecutable('gh'),
): Promise<void> {
  const gh = await executable();
  if (!gh) throw new Error('GitHub CLI is not installed on this machine.');
  await createSetupSession(GITHUB_SETUP_SESSION, 'gh', os.homedir(), {
    agent: false, provider: 'github',
    argv: [],
  }, primitives);
  await command(GITHUB_SETUP_SESSION, `'${gh.replaceAll("'", "'\\''")}' auth login --hostname github.com --git-protocol https`);
}

/** GitHub's supported package paths, run visibly because system package managers may ask for sudo. */
export function githubInstallCommand(platform = os.platform()): string {
  if (platform === 'darwin') return 'command -v brew >/dev/null || { echo "Homebrew is required to install GitHub CLI on macOS: https://brew.sh"; exit 1; }; brew install gh';
  if (platform === 'linux') return [
    'if [ "$(id -u)" -eq 0 ]; then SUDO=""; elif command -v sudo >/dev/null; then SUDO=sudo; else echo "Installing GitHub CLI requires sudo on this Linux machine."; exit 1; fi',
    'if command -v brew >/dev/null; then brew install gh',
    'elif command -v apt-get >/dev/null; then (command -v wget >/dev/null || ($SUDO apt-get update && $SUDO apt-get install -y wget)) && $SUDO mkdir -p -m 755 /etc/apt/keyrings && GH_KEY=$(mktemp) && wget -nv -O"$GH_KEY" https://cli.github.com/packages/githubcli-archive-keyring.gpg && $SUDO tee /etc/apt/keyrings/githubcli-archive-keyring.gpg <"$GH_KEY" >/dev/null && $SUDO chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | $SUDO tee /etc/apt/sources.list.d/github-cli.list >/dev/null && $SUDO apt-get update && $SUDO apt-get install -y gh',
    'elif command -v dnf >/dev/null; then $SUDO dnf install -y gh',
    'elif command -v yum >/dev/null; then $SUDO yum install -y gh',
    'elif command -v pacman >/dev/null; then $SUDO pacman -S --needed github-cli',
    'else echo "No supported GitHub CLI package manager was found. See https://cli.github.com/"; exit 1; fi',
  ].join('; ');
  throw new Error('GitHub CLI installation is supported on macOS and Linux.');
}

export async function createGithubInstallSession(primitives?: GithubSessionPrimitives): Promise<void> {
  await createSetupSession(GITHUB_INSTALL_SESSION, 'gh', os.homedir(), { agent: false, argv: [], provider: 'github' }, primitives);
  await runCommand(GITHUB_INSTALL_SESSION, githubInstallCommand());
}

/** A neutral owner shell for SSH, credential-helper, or organization-specific Git setup. */
export async function openGitSetupSession(primitives?: GithubSessionPrimitives): Promise<ReturnType<typeof setupAttachment>> {
  if (!(await sessionExists(GIT_SETUP_SESSION))) {
    await createSetupSession(GIT_SETUP_SESSION, 'git', os.homedir(), { agent: false, argv: [], provider: 'git' }, primitives);
  }
  return setupAttachment(GIT_SETUP_SESSION);
}

export async function closeGitSetupSession(): Promise<void> {
  if (await sessionExists(GIT_SETUP_SESSION)) await killSessionTree(GIT_SETUP_SESSION);
}

const defaultGithubSetupOps: GithubSetupOps = {
  installed: () => discoverExecutable('gh').then(Boolean),
  // `gh auth status --json` verifies every saved credential and returns structured state.
  // It never includes a token unless --show-token is explicitly requested (we do not).
  authStatus: async () => {
    const gh = await discoverExecutable('gh');
    if (!gh) throw new Error('GitHub CLI is not installed on this machine.');
    return (await run(gh, ['auth', 'status', '--hostname', 'github.com', '--json', 'hosts'], { timeout: 8_000 })).stdout;
  },
  exists: () => sessionExists(GITHUB_SETUP_SESSION),
  installExists: () => sessionExists(GITHUB_INSTALL_SESSION),
  open: () => createGithubSetupSession(),
  openInstall: () => createGithubInstallSession(),
  close: () => killSessionTree(GITHUB_SETUP_SESSION),
  closeInstall: () => killSessionTree(GITHUB_INSTALL_SESSION),
  logout: async (account) => {
    const gh = await discoverExecutable('gh');
    if (!gh) throw new Error('GitHub CLI is not installed on this machine.');
    await run(gh, ['auth', 'logout', '--hostname', 'github.com', '--user', account], { timeout: 8_000 });
  },
};

export interface GithubAuthMeasurement {
  state: 'needs_authentication' | 'authenticated' | 'unreadable';
  account: string;
  problem: string;
}

/** Read only gh's structured, mechanically verified result; never parse prose or tokens. */
export function githubAuthFromStatus(status: string): GithubAuthMeasurement {
  let parsed: unknown;
  try { parsed = JSON.parse(status); }
  catch { return { state: 'unreadable', account: '', problem: 'GitHub CLI returned an unreadable authentication result.' }; }
  const hosts = (parsed as { hosts?: unknown })?.hosts;
  if (!hosts || typeof hosts !== 'object' || Array.isArray(hosts)) {
    return { state: 'unreadable', account: '', problem: 'GitHub CLI returned an unreadable authentication result.' };
  }
  const accounts = (hosts as Record<string, unknown>)['github.com'];
  if (accounts === undefined) return { state: 'needs_authentication', account: '', problem: '' };
  if (!Array.isArray(accounts)) {
    return { state: 'unreadable', account: '', problem: 'GitHub CLI returned an unreadable authentication result.' };
  }
  const active = accounts.find((row) => row && typeof row === 'object' && (row as { active?: unknown }).active === true) as Record<string, unknown> | undefined;
  if (!active) return { state: 'needs_authentication', account: '', problem: '' };
  if (active.state !== 'success') {
    return { state: 'unreadable', account: '', problem: 'GitHub CLI could not verify the saved GitHub authentication.' };
  }
  const account = typeof active.login === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(active.login) ? active.login : '';
  return account
    ? { state: 'authenticated', account, problem: '' }
    : { state: 'unreadable', account: '', problem: 'GitHub CLI returned an unreadable authentication result.' };
}

export async function githubSetupAnswer(ops: GithubSetupOps = defaultGithubSetupOps): Promise<GithubSetupAnswer> {
  const installed = await ops.installed();
  let measurement: GithubAuthMeasurement = { state: 'needs_authentication', account: '', problem: '' };
  if (installed) {
    try { measurement = githubAuthFromStatus(await ops.authStatus()); }
    catch { measurement = { state: 'unreadable', account: '', problem: 'Ronin could not ask GitHub CLI to verify authentication.' }; }
  }
  const account = measurement.account;
  const [open, installing] = await Promise.all([ops.exists(), ops.installExists()]);
  const authenticated = account !== '';
  return {
    installed,
    authenticated,
    account,
    state: !installed ? 'missing' : measurement.state,
    problem: installed ? measurement.problem : '',
    installing,
    attachment: installing ? setupAttachment(GITHUB_INSTALL_SESSION)
      : open ? setupAttachment(GITHUB_SETUP_SESSION) : null,
  };
}

export async function openGithubInstall(ops: GithubSetupOps = defaultGithubSetupOps): Promise<GithubSetupAnswer> {
  if (await ops.installed()) return githubSetupAnswer(ops);
  if (!(await ops.installExists())) await ops.openInstall();
  return githubSetupAnswer(ops);
}

export async function openGithubLogin(ops: GithubSetupOps = defaultGithubSetupOps): Promise<GithubSetupAnswer> {
  if (!(await ops.installed())) throw new Error('GitHub CLI is not installed on this machine.');
  if (!(await ops.exists())) await ops.open();
  return githubSetupAnswer(ops);
}

export async function closeGithubLogin(ops: GithubSetupOps = defaultGithubSetupOps): Promise<GithubSetupAnswer> {
  if (await ops.exists()) await ops.close();
  if (await ops.installExists()) await ops.closeInstall();
  return githubSetupAnswer(ops);
}

/** Remove only the active github.com credential that gh reported; the browser cannot name another account. */
export async function removeGithubAuthentication(ops: GithubSetupOps = defaultGithubSetupOps): Promise<GithubSetupAnswer> {
  const current = await githubSetupAnswer(ops);
  if (!current.installed) throw new Error('GitHub CLI is not installed on this machine.');
  if (!current.authenticated || !current.account) throw new Error('GitHub is not authenticated on this machine.');
  if (await ops.exists()) await ops.close();
  await ops.logout(current.account);
  return githubSetupAnswer(ops);
}

export async function cloneGithubWorkspace(repository: unknown): Promise<{ name: string; dir: string }> {
  const entered = typeof repository === 'string' ? repository.trim() : '';
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(entered);
  if (!match) throw new Error('Repository must be owner/name or an HTTPS or SSH github.com URL.');
  const slug = match[1];
  const remote = /^(?:git@|ssh:\/\/)/.test(entered) ? entered : `https://github.com/${slug}.git`;
  const base = slug.split('/')[1].toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
  if (!base) throw new Error('That repository does not make a valid workspace ID.');
  const known = await peekProjectRoots();
  let name = base;
  for (let suffix = 2; known.some((root) => root.name === name); suffix++) name = `${base}-${suffix}`;
  const dir = path.join(rootDir('user'), name);
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
  await upsertProjectRoot(name, { title: slug.split('/')[1], dir, remit: `Work in ${slug}.`, match: slug, archived: '' }, { declareArrangement: false });
  return { name, dir };
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
    const dir = path.join(rootDir('user'), root.name);
    await ensureRepository(dir, root.label, root.managed);
    // Register once. A runtime read runs this on every call; rewriting an unchanged
    // catalog each time is what let concurrent reads collide.
    const current = known.find((row) => row.name === root.name);
    if (!current || path.resolve(current.dir) !== path.resolve(dir) || current.archived) {
      await upsertProjectRoot(root.name, {
        title: root.label,
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
