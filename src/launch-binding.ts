import { serviceLaunch } from './model-service-launch.js';
import { prepareHermesHome } from './model-service-store.js';
/** One launch processor. The CLI grammar owns identity capability; this module owns
 * sequencing and the artifact Ronin sets before starting the process. No provider list.
 */
import { mkdir, readdir, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { newProviderSession } from './agents.js';
import { type AgentLaunches } from './agent-launches.js';
import { emitSessionBorn, emitSessionWillBorn } from './sockets.js';
import type { LaunchIdentity } from './sockets-contract.js';
import { agentTempEnv } from './agent-scope.js';
import { agentBinDir } from './agent-install.js';
import { boundOperatorSocket, OPERATOR_SOCKET_ENV } from './operator-socket.js';
import { REPO_ROOT, storeDir } from './resources.js';
import { setAhead } from './launch-ahead.js';

/** The environment every start is handed beyond what the pane inherits: launch, Mika's
 *  restart and a restore alike (a restore once came back with a bare PATH, KAN-555).
 *  Every Agent sees the same command locations, followed by Ronin's install bin and the
 *  parent PATH. The install bin dir (`~/.local/bin`) is there because a server started by
 *  systemd or npm has no `.profile` (2026-09-09). The operator socket is told at birth the
 *  way tmux tells every shell where its server is; a process that bound none says nothing. */
export function birthEnv(socket: string | undefined = boundOperatorSocket(), installBin: string = agentBinDir(), parentPath: string = process.env.PATH ?? ''): Record<string, string> {
  const fixed = [path.join(REPO_ROOT, 'bin', 'shim'), storeDir('tools'), path.join(REPO_ROOT, 'ronin_bin')];
  const PATH = [...new Set([...fixed, installBin, ...parentPath.split(':')].filter(Boolean))].join(':');
  const env: Record<string, string> = { PATH };
  if (socket) env[OPERATOR_SOCKET_ENV] = socket;
  return env;
}

export interface LaunchRequest {
  name: string; key?: string; cli: string; argv: readonly string[]; cwd: string;
  team?: string; env?: Readonly<Record<string, string>>; resume?: boolean;
}
export const launchIdentityFile = (key: string) => path.join(storeDir('session'), key, 'launch-identity.json');
export async function writeLaunchIdentity(identity: LaunchIdentity): Promise<void> {
  const target = launchIdentityFile(identity.key);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(identity, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, target);
}
export async function readLaunchIdentity(key: string): Promise<LaunchIdentity | null> {
  try { return JSON.parse(await readFile(launchIdentityFile(key), 'utf8')); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}
const expand = (value: string, home: string) => value.replace(/^~(?=\/|$)/, homedir()).replaceAll('{home}', home);
async function isolate(grammar: AgentLaunches, key: string): Promise<{ home: string; env: Record<string, string> }> {
  const home = path.join(storeDir('session'), key, 'cli-home');
  await mkdir(home, { recursive: true, mode: 0o700 });
  await linkInherited(grammar, home);
  return { home, env: { [grammar.isolation!.env]: home } };
}

/** Link the CLI home's inherited entries into an isolated home; one already there is left alone,
 * so a resumed birth picks up what appeared since (a sign-in's credential file, say). */
async function linkInherited(grammar: AgentLaunches, home: string): Promise<void> {
  const declaration = grammar.isolation!;
  const source = process.env[declaration.env] || expand(declaration.home, '');
  const entries = await readdir(source).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return []; throw e; });
  if (declaration.shared !== undefined && declaration.private !== undefined) throw new Error('Isolation must choose shared or private entries, not both.');
  const privateEntries = typeof declaration.private === 'string' ? [declaration.private] : declaration.private ?? [];
  const namedEntries = declaration.shared ?? privateEntries;
  if (namedEntries.some(entry => !entry || path.basename(entry) !== entry || entry === '.' || entry === '..')) throw new Error('Isolation entries must be home-relative basenames.');
  // Legacy string declares a directory. Shared lists inherit only explicitly named entries.
  if (typeof declaration.private === 'string') await mkdir(path.join(home, declaration.private), { recursive: true, mode: 0o700 });
  const inherited = entries.filter(entry => declaration.shared ? declaration.shared.includes(entry) : !privateEntries.includes(entry));
  const present = new Set(await readdir(home));
  for (const entry of inherited) {
    if (!present.has(entry)) await symlink(path.join(source, entry), path.join(home, entry));
  }
}

const provisioners = { 'hermes-setup': prepareHermesHome };

const strategies = {
  minted: async (_grammar: AgentLaunches, _key: string) => ({ env: {} }),
  isolated: isolate,
  unbound: async (_grammar: AgentLaunches, _key: string) => ({ env: {} }),
};
let queue: Promise<unknown> = Promise.resolve();
/** Serial entry for fresh launches, named resumes, restores, and plain shells alike. */
export function processLaunch(request: LaunchRequest,
  start: (argv: readonly string[], env: Record<string, string>, identity: LaunchIdentity) => Promise<void>,
): Promise<LaunchIdentity> {
  const work = queue.then(async () => {
    const key = request.key || `${request.name}-${randomUUID()}`;
    const assigned = await newProviderSession(request.cli, request.argv);
    const grammar = assigned.grammar;
    const retained = request.resume ? await readLaunchIdentity(key) : null;
    const prepared: { home?: string; env: Record<string, string> } = retained ?? await strategies[assigned.strategy](grammar!, key);
    const home = prepared.home;
    if (retained && home && grammar?.isolation) await linkInherited(grammar, home);
    const provision = grammar?.isolation?.provision;
    if (!retained && home && provision && request.env?.RONIN_SETUP_ID) await provisioners[provision](request.env.RONIN_SETUP_ID, home, request.env.RONIN_PERSON);
    const identity: LaunchIdentity = {
      key, cli: request.cli, strategy: retained?.strategy ?? assigned.strategy,
      providerSession: assigned.id, home, env: prepared.env,
      journal: retained?.journal ?? (grammar?.transcript ? { ...grammar.transcript, root: expand(grammar.transcript.root, home || (grammar.isolation ? process.env[grammar.isolation.env] || expand(grammar.isolation.home, '') : '')) } : undefined),
    };
    await writeLaunchIdentity(identity);
    await emitSessionWillBorn(request.name);
    // TMPDIR on disk in the session folder, never /tmp (RAM): src/agent-scope.ts
    // What the CLI would ask before its first turn, answered; its asking hook (src/launch-ahead.ts).
    const ahead = await setAhead(request.cli, request.cwd, home);
    const exe = assigned.argv.findIndex((part) => path.basename(part) === request.cli);
    const argv = exe < 0 ? assigned.argv : [...assigned.argv.slice(0, exe + 1), ...ahead, ...assigned.argv.slice(exe + 1)];
    const serviceArgv = await serviceLaunch(request.cli, argv, request.env?.RONIN_PERSON ?? '', retained?.home);
    await start(serviceArgv, { ...birthEnv(), ...await agentTempEnv(key), ...request.env, ...identity.env }, identity);
    emitSessionBorn({ name: request.name, key, team: request.team, root: request.cwd, identity });
    return identity;
  });
  queue = work.catch(() => {});
  return work;
}
