/** One launch processor. The CLI grammar owns identity capability; this module owns
 * sequencing and the artifact Ronin sets before starting the process. No provider list.
 */
import { mkdir, readdir, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { newProviderSession } from './agents.js';
import { type AgentLaunches } from './agent-launches.js';
import { storeDir } from './resources.js';
import { emitSessionBorn, emitSessionWillBorn } from './sockets.js';
import type { LaunchIdentity } from './sockets-contract.js';

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
  const declaration = grammar.isolation!;
  const source = process.env[declaration.env] || expand(declaration.home, '');
  const home = path.join(storeDir('session'), key, 'cli-home');
  await mkdir(home, { recursive: true, mode: 0o700 });
  const entries = await readdir(source).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return []; throw e; });
  await mkdir(path.join(home, declaration.private), { recursive: true, mode: 0o700 });
  for (const entry of entries.filter(entry => entry !== declaration.private)) {
    await symlink(path.join(source, entry), path.join(home, entry));
  }
  return { home, env: { [declaration.env]: home } };
}

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
    const identity: LaunchIdentity = {
      key, cli: request.cli, strategy: retained?.strategy ?? assigned.strategy,
      providerSession: assigned.id, home, env: prepared.env,
      journal: retained?.journal ?? (grammar?.transcript ? { ...grammar.transcript, root: expand(grammar.transcript.root, home || (grammar.isolation ? process.env[grammar.isolation.env] || expand(grammar.isolation.home, '') : '')) } : undefined),
    };
    await writeLaunchIdentity(identity);
    await emitSessionWillBorn(request.name);
    await start(assigned.argv, { ...request.env, ...identity.env }, identity);
    emitSessionBorn({ name: request.name, key, team: request.team, root: request.cwd, identity });
    return identity;
  });
  queue = work.catch(() => {});
  return work;
}
