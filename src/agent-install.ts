import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENTS, listAgentAvailability } from './agents.js';
import { REPO_ROOT } from './resources.js';
import { runCommand } from './send.js';
import { collectBirthLines, emitSessionWillBorn } from './sockets.js';
import { createSession, killSessionTree, sessionExists } from './tmux.js';

function agentPrefix(): string {
  return path.join(os.homedir(), '.local');
}

/** Where Ronin's own Install and Update put a CLI's command: the owner's prefix, never root's. */
export function agentBinDir(): string {
  return path.join(agentPrefix(), 'bin');
}

function bundledNodeBin(): string | null {
  const dir = path.join(REPO_ROOT, 'vendor', 'node', 'bin');
  return fs.existsSync(path.join(dir, 'node')) ? dir : null;
}

function installPreamble(): string[] {
  const nodeBin = bundledNodeBin();
  // Ronin's own bin dir goes FIRST: the line ends by running the CLI it just installed, and
  // with the dir appended a system copy of the same name answered instead (0.151.0 printed
  // after 0.153.4 landed, 2026-09-09). This is the install tile's PATH only.
  const pathParts = [agentBinDir(), ...(nodeBin ? [nodeBin] : []), '$PATH'];
  return [`export npm_config_prefix=${shq(agentPrefix())}`, `export PATH=${shq(pathParts.join(':'), true)}`];
}

function shq(s: string, keep = false): string {
  if (keep) return `"${s.replace(/(["\\`])/g, '\\$1')}"`;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export interface InstallItem {
  kind: string;
  name: string;
}

export interface InstallStarted {
  kind: string;
  name: string;
  session: string | null;
  outcome: 'started' | 'already' | 'refused';
  say: string;
}

const sessionFor = (name: string): string => `install_${name}`;

export async function dispatchInstall(items: InstallItem[]): Promise<InstallStarted[]> {
  const agents = items.some((i) => i.kind === 'agent') ? await listAgentAvailability() : [];
  const out: InstallStarted[] = [];
  for (const item of items) {
    out.push(await one(item, agents));
  }
  return out;
}

async function one(
  item: InstallItem,
  probed: Awaited<ReturnType<typeof listAgentAvailability>>,
): Promise<InstallStarted> {
  const said = (outcome: InstallStarted['outcome'], say: string, session: string | null = null) => ({
    kind: item.kind,
    name: item.name,
    session,
    outcome,
    say,
  });
  if (item.kind !== 'agent') {
    return said('refused', `nothing installs a ${item.kind} mechanically yet — see met_by in the registry`);
  }
  const spec = AGENTS.find((a) => a.id === item.name);
  if (!spec) return said('refused', `no agent called "${item.name}"`);
  if (!spec.operations.install) return said('refused', spec.parked || `nothing installs ${item.name} yet`);
  if (probed.find((p) => p.id === spec.id)?.installed) {
    return said('already', `${spec.label} is already on this machine`);
  }

  const session = sessionFor(spec.id);
  try {
    if (await sessionExists(session)) await killSessionTree(session);
    await emitSessionWillBorn(session); // a reused name's stale tape is reset here
    await createSession(session, undefined, { agent: false });
    void collectBirthLines(session, true);
    await runCommand(session, installLine(spec.operations.install, spec.cmd));
    return said('started', `installing ${spec.label} in ${session}`, session);
  } catch (e) {
    return said('refused', String((e as Error)?.message ?? e));
  }
}

function installLine(get: string, cmd: string): string {
  return [...installPreamble(), `${get} && ${cmd}`].join('; ');
}

/** The registry's update for a CLI as one shell line, or '' when it has none. */
export function updateLineOf(spec: (typeof AGENTS)[number]): string {
  return spec.operations.update.shell || (spec.operations.update.argv.length ? [spec.cmd, ...spec.operations.update.argv].join(' ') : '');
}

/**
 * UPDATE — the same preamble as Install, the registry's update line, then the CLI's own
 * version so the owner sees what landed. The preamble points npm at the owner's own prefix
 * (no box needs root; the owner answers nothing) and puts that prefix's bin dir first so the
 * version printed is the one just installed. It runs in a temporary provider_setup session
 * shown in the page, opened and closed by src/setup-runtime.ts exactly as a sign-in is.
 */
export function updateCommand(spec: (typeof AGENTS)[number]): string {
  const line = updateLineOf(spec);
  if (!line) throw new Error(`nothing updates ${spec.label} from here yet`);
  return [...installPreamble(), `${line} && ${spec.cmd} ${spec.operations.version.join(' ')}`].join('; ');
}
