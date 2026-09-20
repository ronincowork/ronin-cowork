import { randomUUID } from 'node:crypto';
import { execFile } from './spawn-broker.js';
import { readAgentLaunches, renderLaunch } from './agent-launches.js';

const pexec = execFile;

export interface AgentScreen {
  busy: readonly string[];
  asking: readonly string[];
  ready: readonly string[];
}

export interface AgentOperations {
  install: string;
  update: { shell: string; argv: readonly string[] };
  selfUpdates: boolean;
  version: readonly string[];
  session: {
    discovery: 'claude-history' | 'codex-fds' | 'unsupported';
  };
}

export const AGENTS = [
  {
    id: 'claude',
    cmd: 'claude',
    label: 'Claude Code',
    operations: {
      install: 'npm install -g @anthropic-ai/claude-code',
      // Native installs update in the background: https://code.claude.com/docs/en/getting-started#auto-updates
      update: { shell: '', argv: ['update'] },
      selfUpdates: true,
      version: ['--version'],
      session: { discovery: 'claude-history' },
    } as AgentOperations,
    parked: '',
    credentials: ['.claude/.credentials.json'],
    screen: { busy: ['esc to interrupt'], asking: ['❯\\s*\\d+\\.\\s'], ready: ['^\\s*[│┃]?\\s*❯'] },
  },
  {
    id: 'codex',
    cmd: 'codex',
    label: 'Codex',
    operations: {
      install: 'npm install -g @openai/codex',
      // OpenAI documents an explicit update, not automatic updates: https://developers.openai.com/codex/cli/
      update: { shell: 'npm install -g @openai/codex@latest', argv: [] },
      selfUpdates: false,
      version: ['--version'],
      session: { discovery: 'codex-fds' },
    } as AgentOperations,
    parked: '',
    credentials: ['.codex/auth.json'],
    screen: { busy: ['esc to interrupt'], asking: ['›\\s*\\d+\\.\\s'], ready: ['^\\s*›(?:\\s|$)'] },
  },
  {
    id: 'gemini',
    cmd: 'gemini',
    label: 'Gemini CLI',
    operations: {
      install: 'npm install -g @google/gemini-cli',
      // general.enableAutoUpdate defaults true: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/settings.md
      update: { shell: 'npm install -g @google/gemini-cli@latest', argv: [] },
      selfUpdates: true,
      version: ['--version'],
      session: { discovery: 'unsupported' },
    } as AgentOperations,
    parked: '',
    credentials: ['.gemini/oauth_creds.json'],
    screen: { busy: [], asking: ['●\\s*\\d+\\.\\s'], ready: [] },
  },
  // [cli] auto_update defaults true: https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/05-configuration.md
  { id: 'grok', cmd: 'grok', label: 'Grok CLI', operations: { install: 'npm install -g @xai-official/grok', update: { shell: 'npm install -g @xai-official/grok@latest', argv: [] }, selfUpdates: true, version: ['--version'], session: { discovery: 'unsupported' } } as AgentOperations, parked: '', credentials: ['.grok/auth.json'], screen: { busy: [], asking: [], ready: [] } },
  {
    id: 'hermes',
    cmd: 'hermes',
    label: 'Hermes',
    operations: {
      install: '',
      // Vendor docs require an explicit update: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/updating.md
      update: { shell: '', argv: ['update'] },
      selfUpdates: false,
      version: ['--version'],
      session: { discovery: 'unsupported' },
    } as AgentOperations,
    credentials: [],
    parked: "Ronin cannot install this one yet — Nous's own installer needs system packages it has to ask you for, and does not finish without them. Install it from their site and it appears here.",
    screen: { busy: [], asking: [], ready: [] },
  },
] as const;

export interface AgentAvailability {
  id: string;
  label: string;
  get: string;
  parked: string;
  cmd: string;
  installed: boolean;
  path: string;
}

function loginShell(): string {
  const s = process.env.SHELL;
  return s && s.trim() ? s : '/bin/bash';
}

/** Resolve owner-installed commands through the owner's login shell, not the service PATH. */
export async function discoverExecutables(names: readonly string[]): Promise<Map<string, string>> {
  const wanted = names.filter((name) => /^[A-Za-z0-9._+-]+$/.test(name));
  const found = new Map<string, string>();
  if (!wanted.length) return found;
  const script = `for c in "$@"; do printf '%s\\t%s\\n' "$c" "$(command -v "$c" 2>/dev/null || true)"; done`;
  try {
    const { stdout } = await pexec(loginShell(), ['-lc', script, 'ronin-discover', ...wanted], { timeout: 5000 });
    for (const line of stdout.split('\n')) {
      const [cmd, where] = line.split('\t');
      if (cmd && wanted.includes(cmd)) found.set(cmd, (where ?? '').trim());
    }
  } catch {
  }
  return found;
}

export async function discoverExecutable(name: string): Promise<string> {
  return (await discoverExecutables([name])).get(name) ?? '';
}

export async function listAgentAvailability(): Promise<AgentAvailability[]> {
  const found = await discoverExecutables(AGENTS.map((a) => a.cmd));
  return AGENTS.map((a) => {
    const where = found.get(a.cmd) ?? '';
    return { id: a.id, label: a.label, get: a.operations.install, parked: a.parked, cmd: a.cmd, installed: !!where, path: where };
  });
}

export interface LaunchArgv {
  argv: string[];
  parked: boolean;
}

export async function launchArgv(cmd: string, brief: string): Promise<LaunchArgv> {
  const parts = cmd.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { argv: [], parked: false };
  const [head, ...rest] = parts;
  const bare = head.split('/').pop() ?? head;
  const spec = AGENTS.find((a) => a.cmd === bare);
  const probed = (await listAgentAvailability()).find((a) => a.cmd === bare);
  const bin = probed?.path || (head.includes('/') ? head : '');
  if (!bin) return { argv: [], parked: false };
  const grammar = spec ? await readAgentLaunches(spec.id) : null;
  if (grammar?.initial === 'positional' && brief) return { argv: [bin, ...rest, brief], parked: false };
  return { argv: [bin, ...rest], parked: !!brief };
}

export async function newProviderSession(agent: string, argv: readonly string[]): Promise<{ argv: string[]; id: string }> {
  const spec = AGENTS.find((a) => a.id === agent);
  if (!spec) return { argv: [...argv], id: '' };
  const grammar = await readAgentLaunches(spec.id);
  if (!grammar.newSessionId.length) return { argv: [...argv], id: '' };
  const id = randomUUID();
  return { argv: [argv[0], ...renderLaunch(grammar.newSessionId, { session_id: id }), ...argv.slice(1)], id };
}

export async function resumeAgentArgv(agent: string, id: string): Promise<string[]> {
  const spec = AGENTS.find((a) => a.id === agent);
  if (!spec) return [];
  const grammar = await readAgentLaunches(spec.id);
  if (!grammar.resume.length) return [];
  const launch = await launchArgv(spec.cmd, '');
  return launch.argv.length ? renderLaunch(grammar.resume, { session_id: id }).map((part, index) => index === 0 ? launch.argv[0]! : part) : [];
}

export function agentSpec(id: string): (typeof AGENTS)[number] | undefined {
  return AGENTS.find((agent) => agent.id === id);
}

export function defaultAgentCommand(): string {
  return AGENTS[0].cmd;
}
