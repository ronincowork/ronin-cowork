import { mkdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AGENTS, discoverExecutable, launchArgv, listAgentAvailability } from './agents.js';
import { updateSection } from './machine-state.js';
import { listHarnesses, type ModelList, type HarnessSummary } from './harness-catalog.js';
import { activatedAt, offAt, harnessSignedIn, withCurrentModels } from './harness-summary.js';
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

export interface SetupHarnessState {
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
  /** Whether Ronin signs it in itself, without a terminal (AGENTS `login`, src/harness-sign-in.ts). */
  direct_sign_in: boolean;
  install_open: boolean;
  signed_in: boolean;
  activated: boolean;
  /** A model service gives it models (a configured service bound to it: Ronin Gateway, a key in the
   *  Ronin key vault, OpenRouter): Active without its own sign-in (docs/architecture/harness-catalog.md,
   *  One harness panel). */
  served: boolean;
  activated_at: string | null;
  /** Turned off by the owner: Ronin is not using this provider. The sign-in is kept; live tiles run on. */
  off: boolean;
  off_at: string | null;
  /** What the installed CLI said it is; null when not installed or it would not say. */
  version: string | null;
  /** Its own model list as the last refresh read it, with the date and the CLI version; null until read, or when not activated. */
  model_list: ModelList | null;
  /** Registry-owned native command Mika may run for this provider's authentication flow. */
  login_command: string;
  attachment: { type: 'session'; key: string; team: typeof PROVIDER_SETUP_TEAM; temporary: true } | null;
  state: 'absent' | 'installable' | 'installed' | 'login_open' | 'activated' | 'off';
}

export interface SetupRuntimeAnswer {
  harnesses: SetupHarnessState[];
  activated_count: number;
  activated_band: 'zero' | 'one' | 'two_plus';
  /** When the machine facts were measured; a reader shows a stale date rather than guessing. */
  measured_at: string;
  /** When the last refresh read every activated CLI's model list; '' when never. */
  refreshed_at: string;
  services: { installed: boolean; active: boolean };
}

export interface ProviderSessionOps {
  exists(name: string): Promise<boolean>;
  open(provider: string, name: string): Promise<void>;
  close(name: string): Promise<void>;
}

type Availability = Awaited<ReturnType<typeof listAgentAvailability>>;

const sessionName = (provider: string) => `provider_setup_${provider}`;
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
  close: killSessionTree,
};

/**
 * The runtime facts as the Campaign's summary holds them. Only `login_open` is live: a
 * tmux session's presence is an attachment, not a probe of the provider.
 */
export async function setupRuntimeAnswer(
  section: SetupSection,
  summary: HarnessSummary,
  ops: Pick<ProviderSessionOps, 'exists'> = defaultSessionOps,
  installed?: InstalledAnswer,
  /** The harnesses a configured model service is bound to. */
  servedBy: readonly string[] = [],
): Promise<SetupRuntimeAnswer> {
  const entries = listHarnesses();
  // model_list is each CLI's list as of this ask (KAN-995): the park reports it to HQ as cli_models.
  const lists = (await withCurrentModels(summary)).models;
  const providers = await Promise.all(AGENTS.map(async (agent): Promise<SetupHarnessState> => {
    const entry = entries.find((row) => row.cli === agent.id);
    const session = sessionName(agent.id);
    const installSession = installSessionName(agent.id);
    const [loginOpen, installOpen] = await Promise.all([ops.exists(session), ops.exists(installSession)]);
    const completed = activatedAt(section, agent.id);
    const offSince = offAt(section, agent.id);
    const isInstalled = summary.installed.includes(agent.id);
    // While its sign-in is open, the credential file is read now, not from the last measure (KAN-723).
    const signedIn = isInstalled && (summary.signed_in.includes(agent.id) || (loginOpen && await harnessSignedIn(agent.id)));
    const activated = isInstalled && offSince === null && (completed !== null || signedIn) && entry?.launchable === true;
    // Not activated: nothing was asked and nothing is offered — Installed, and stop. A
    // version from an earlier measurement is not printed as though it were current.
    const version = activated ? summary.versions?.[agent.id] ?? null : null;
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
      served: isInstalled && offSince === null && servedBy.includes(agent.id),
      activated_at: completed,
      off: offSince !== null,
      off_at: offSince,
      version,
      model_list: activated ? lists?.[agent.id] ?? null : null,
      login_command: [agent.cmd, ...(agent.operations.setup ?? [])].join(' '),
      // One attachment per provider: sign-in, then install. The same Close ends both;
      // installation remains visible after the binary appears.
      attachment: loginOpen ? setupAttachment(session)
        : installOpen ? setupAttachment(installSession) : null,
      state: offSince !== null && isInstalled ? 'off' : activated || (isInstalled && servedBy.includes(agent.id)) ? 'activated' : loginOpen ? 'login_open' : isInstalled ? 'installed' : agent.operations.install ? 'installable' : 'absent',
    };
  }));
  // Active: its own sign-in or a model service (owner, 27 Nov 2026).
  const activated_count = providers.filter((provider) => provider.activated || provider.served).length;
  return {
    harnesses: providers,
    activated_count,
    activated_band: activated_count === 0 ? 'zero' : activated_count === 1 ? 'one' : 'two_plus',
    measured_at: summary.measured_at,
    refreshed_at: summary.refreshed_at,
    services: {
      installed: installed?.services.installed ?? false,
      active: Boolean(installed?.services.loaded.length),
    },
  };
}

export async function openHarnessLogin(
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
 * Close ends whichever temporary session the provider has open — install, sign-in, or
 * both — through the one teardown. Nothing shown in the page outlives it.
 */
export async function closeHarnessLogin(provider: string, ops: ProviderSessionOps = defaultSessionOps): Promise<{ session: string; closed: boolean }> {
  if (!AGENTS.some((agent) => agent.id === provider)) throw new Error(`Unknown provider "${provider}".`);
  let closed: string | null = null;
  // Keep the long-standing sign-in name as the receipt when several exist; install joins
  // the teardown without changing the close response callers already consume.
  for (const session of [sessionName(provider), installSessionName(provider)]) {
    if (!(await ops.exists(session))) continue;
    await ops.close(session);
    closed ??= session;
  }
  return { session: closed ?? sessionName(provider), closed: closed !== null };
}

export async function completeHarnessLogin(
  provider: string,
  ops: ProviderSessionOps = defaultSessionOps,
  now = () => new Date().toISOString(),
  record: (provider: string, activated_at: string) => Promise<void> = recordHarnessActivation,
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
  await closeHarnessLogin(provider, ops);
  return { session, activated_at };
}

/**
 * THE SWITCH. Off writes Ronin's own `off_at` and nothing else — no vendor file, no
 * session; on deletes it. What the record then says is measured, not assumed: the caller
 * measures again so `operational` moves with the switch.
 */
export async function setHarnessOff(provider: string, off: boolean, now = () => new Date().toISOString()): Promise<{ provider: string; off: boolean; off_at: string | null }> {
  if (!AGENTS.some((agent) => agent.id === provider)) throw new Error(`Unknown provider "${provider}".`);
  let off_at: string | null = null;
  await updateSection<SetupSection>('setup', (setup) => {
    const current = { ...(setup.providers?.[provider] ?? {}) };
    if (off) { off_at = now(); current.off_at = off_at; } else { delete current.off_at; }
    return { ...setup, providers: { ...(setup.providers ?? {}), [provider]: current } };
  });
  return { provider, off, off_at };
}

async function recordHarnessActivation(provider: string, activated_at: string): Promise<void> {
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

/** How many repositories one owner's group lists; a group with more says it was cut short. */
const REPOS_PER_OWNER = 100;

export interface GithubRepository { name: string; short: string; owner: string; url: string; private: boolean }

/**
 * EVERY REPOSITORY THE SIGN-IN REACHES (owner, 28 Nov 2026; KAN-999): the account's own, then each organization
 * it belongs to by name, each owner's newest first, as gh lists them. `cut` names an owner with more than
 * REPOS_PER_OWNER, so the page can say its group was cut short.
 */
export async function githubRepositories(): Promise<{ repos: GithubRepository[]; cut: string[] }> {
  const gh = await discoverExecutable('gh');
  if (!gh) throw new Error('GitHub is not connected here.');
  const json = async (args: string[]) => JSON.parse(String((await run(gh, args, { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 })).stdout || 'null')) as unknown;
  const me = String(((await json(['api', 'user'])) as { login?: string } | null)?.login || '');
  const orgs = ((await json(['api', 'user/orgs', '--paginate']).catch(() => [])) as Array<{ login?: string }> | null ?? [])
    .map((org) => String(org.login || '')).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const owners = [me, ...orgs].filter(Boolean);
  const lists = await Promise.all(owners.map(async (owner) => {
    const rows = (await json(['repo', 'list', owner, '--limit', String(REPOS_PER_OWNER + 1), '--json', 'name,nameWithOwner,url,isPrivate']).catch(() => [])) as Array<{ name: string; nameWithOwner: string; url: string; isPrivate: boolean }> | null ?? [];
    return { owner, rows };
  }));
  return {
    repos: lists.flatMap(({ owner, rows }) => rows.slice(0, REPOS_PER_OWNER)
      .map((repo) => ({ name: repo.nameWithOwner, short: repo.name, owner, url: `${repo.url}.git`, private: repo.isPrivate }))),
    cut: lists.filter(({ rows }) => rows.length > REPOS_PER_OWNER).map(({ owner }) => owner),
  };
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
