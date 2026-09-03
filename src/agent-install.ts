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

function agentBinDir(): string {
  return path.join(agentPrefix(), 'bin');
}

function bundledNodeBin(): string | null {
  const dir = path.join(REPO_ROOT, 'vendor', 'node', 'bin');
  return fs.existsSync(path.join(dir, 'node')) ? dir : null;
}

function installPreamble(): string[] {
  const nodeBin = bundledNodeBin();
  const pathParts = ['$PATH', agentBinDir(), ...(nodeBin ? [nodeBin] : [])];
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
