import { randomUUID } from 'node:crypto';
import { execFile } from './spawn-broker.js';

const pexec = execFile;

export type InitialPrompt = 'positional' | 'none';

export interface AgentScreen {
  busy: readonly string[];
  asking: readonly string[];
  ready: readonly string[];
}

export interface AgentOperations {
  install: string;
  update: { shell: string; argv: readonly string[] };
  version: readonly string[];
  session: {
    newIdFlag: string;
    resume: readonly string[];
    discovery: 'claude-history' | 'codex-fds' | 'unsupported';
  };
}

export const AGENTS = [
  {
    id: 'claude',
    cmd: 'claude',
    label: 'Claude Code',
    from: 'Anthropic',
    operations: {
      install: 'npm install -g @anthropic-ai/claude-code',
      update: { shell: 'npm install -g @anthropic-ai/claude-code@latest', argv: [] },
      version: ['--version'],
      session: { newIdFlag: '--session-id', resume: ['--resume'], discovery: 'claude-history' },
    } as AgentOperations,
    parked: '',
    initial: 'positional' as InitialPrompt,
    screen: { busy: ['esc to interrupt'], asking: ['❯\\s*\\d+\\.\\s'], ready: ['^\\s*[│┃]?\\s*❯'] },
  },
  {
    id: 'codex',
    cmd: 'codex',
    label: 'Codex',
    from: 'OpenAI',
    operations: {
      install: 'npm install -g @openai/codex',
      update: { shell: 'npm install -g @openai/codex@latest', argv: [] },
      version: ['--version'],
      session: { newIdFlag: '', resume: ['resume'], discovery: 'codex-fds' },
    } as AgentOperations,
    parked: '',
    initial: 'positional' as InitialPrompt,
    screen: { busy: ['esc to interrupt'], asking: ['›\\s*\\d+\\.\\s'], ready: ['^\\s*›(?:\\s|$)'] },
  },
  {
    id: 'gemini',
    cmd: 'gemini',
    label: 'Gemini CLI',
    from: 'Google',
    operations: {
      install: 'npm install -g @google/gemini-cli',
      update: { shell: '', argv: ['update'] },
      version: ['--version'],
      session: { newIdFlag: '', resume: ['--resume'], discovery: 'unsupported' },
    } as AgentOperations,
    parked: '',
    initial: 'positional' as InitialPrompt,
    screen: { busy: [], asking: ['●\\s*\\d+\\.\\s'], ready: [] },
  },
  { id: 'grok', cmd: 'grok', label: 'Grok CLI', from: 'xAI', operations: { install: 'npm install -g @xai-official/grok', update: { shell: 'npm install -g @xai-official/grok@latest', argv: [] }, version: ['--version'], session: { newIdFlag: '', resume: [], discovery: 'unsupported' } } as AgentOperations, parked: '', initial: 'positional' as InitialPrompt, screen: { busy: [], asking: [], ready: [] } },
  {
    id: 'hermes',
    cmd: 'hermes',
    label: 'Hermes',
    from: 'Nous Research',
    operations: {
      install: '',
      update: { shell: '', argv: ['update'] },
      version: ['--version'],
      session: { newIdFlag: '', resume: ['--resume'], discovery: 'unsupported' },
    } as AgentOperations,
    initial: 'none' as InitialPrompt,
    parked: "Ronin cannot install this one yet — Nous's own installer needs system packages it has to ask you for, and does not finish without them. Install it from their site and it appears here.",
    screen: { busy: [], asking: [], ready: [] },
  },
] as const;

export interface AgentAvailability {
  id: string;
  label: string;
  from: string;
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

export async function listAgentAvailability(): Promise<AgentAvailability[]> {
  const names = AGENTS.map((a) => a.cmd).join(' ');
  const script = `for c in ${names}; do printf '%s\\t%s\\n' "$c" "$(command -v "$c" 2>/dev/null || true)"; done`;

  const found = new Map<string, string>();
  try {
    const { stdout } = await pexec(loginShell(), ['-lc', script], { timeout: 5000 });
    for (const line of stdout.split('\n')) {
      const [cmd, where] = line.split('\t');
      if (cmd) found.set(cmd, (where ?? '').trim());
    }
  } catch {
  }

  return AGENTS.map((a) => {
    const where = found.get(a.cmd) ?? '';
    return { id: a.id, label: a.label, from: a.from, get: a.operations.install, parked: a.parked, cmd: a.cmd, installed: !!where, path: where };
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
  if (spec?.initial === 'positional' && brief) return { argv: [bin, ...rest, brief], parked: false };
  return { argv: [bin, ...rest], parked: !!brief };
}

export function newProviderSession(agent: string, argv: readonly string[]): { argv: string[]; id: string } {
  const spec = AGENTS.find((a) => a.id === agent);
  const flag = spec?.operations.session.newIdFlag;
  if (!flag) return { argv: [...argv], id: '' };
  const id = randomUUID();
  return { argv: [argv[0], flag, id, ...argv.slice(1)], id };
}

export async function resumeAgentArgv(agent: string, id: string): Promise<string[]> {
  const spec = AGENTS.find((a) => a.id === agent);
  if (!spec?.operations.session.resume.length) return [];
  const launch = await launchArgv(spec.cmd, '');
  return launch.argv.length ? [launch.argv[0], ...spec.operations.session.resume, id] : [];
}

export function agentSpec(id: string): (typeof AGENTS)[number] | undefined {
  return AGENTS.find((agent) => agent.id === id);
}

export function defaultAgentCommand(): string {
  return AGENTS[0].cmd;
}
