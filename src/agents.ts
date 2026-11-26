import { randomUUID } from 'node:crypto';
import { execFile } from './spawn-broker.js';
import { readAgentLaunches, renderLaunch, type AgentLaunches } from './agent-launches.js';

const pexec = execFile;

export interface AgentScreen {
  busy: readonly string[];
  asking: readonly string[];
  ready: readonly string[];
}

/**
 * HOW A CLI PUBLISHES ITS MODEL LIST — declared here, read by `readModels` in
 * `src/harness-summary.ts` on Refresh all. `claude-cache` and `codex-cache` are the two
 * cache files those CLIs keep; `command` runs the CLI with the argv and reads the list it
 * prints; `none` says plainly that Ronin has no way to read one, so Model: Native is the
 * only choice. A new way to read a list is a new key here, never an `if` on a CLI id.
 */
export type ModelsSource =
  | { read: 'claude-cache' }
  | { read: 'codex-cache' }
  | { read: 'command'; argv: readonly string[] }
  | { read: 'command-lines'; argv: readonly string[] }
  | { read: 'model-entries' }
  | { read: 'none' };

export interface AgentOperations {
  install: string;
  update: { shell: string; argv: readonly string[] };
  selfUpdates: boolean;
  version: readonly string[];
  models: ModelsSource;
  setup?: readonly string[];
  session: {
    discovery: 'explicit-argv' | 'unsupported';
  };
}

/**
 * HOW RONIN SIGNS A CLI IN, WITHOUT A TERMINAL (owner, 24 Nov 2026; samurai_lab/wip/SETUP_HARNESS.md):
 * the CLI's own login command per way, its menu skipped. Ronin runs it, shows the link and code it
 * prints (`code` finds the code), sends what the person pastes (`paste`: a code back, or a key on stdin),
 * and the CLI's credential file is the record. A CLI without `login` signs in on the terminal tile.
 */
export interface AgentLogin {
  subscription: { argv: readonly string[]; paste: 'code' | null };
  api_key: { argv: readonly string[]; paste: 'code' | 'key' };
  /** A pattern matching the one-time code the CLI prints, when it prints one. */
  code?: string;
  /** WHICH WAY IT IS SIGNED IN, from the CLI's own status (owner, 24 Nov 2026): nothing of Ronin's records
   *  it. `argv` prints the status; the first pattern that matches its output names the way. */
  status: { argv: readonly string[]; subscription: string; api_key: string };
}

/**
 * WHOSE MODELS A CLI SERVES (KAN-829): the vendor id a launch names (`anthropic`, the key of
 * `agents.sessions.by_provider`), the vendor's name, where its conversation journal lives as
 * observed (descriptive; availability needs a journal adapter and a verified launch identity),
 * and an optional display status: `comingSoon` is shown and never launched. Which models, their
 * tiers and their lines are HQ's model catalog (src/model-catalog.ts); docs/agents/<cli>.md
 * says the same in words.
 */
export interface AgentVendor {
  provider: string;
  label: string;
  transcript_source: string;
  maturity?: 'beta' | 'comingSoon';
}

export const AGENTS = [
  {
    id: 'claude',
    cmd: 'claude',
    label: 'Claude Code',
    vendor: { provider: 'anthropic', label: 'Anthropic', transcript_source: 'Observed 2026-09-22: ~/.claude/projects/<cwd-slug>/<uuid>.jsonl; one record per completed message. Journal adapter exists; exact launch identity is required.' } as AgentVendor,
    operations: {
      install: 'npm install -g @anthropic-ai/claude-code',
      // Native installs update in the background: https://code.claude.com/docs/en/getting-started#auto-updates
      update: { shell: '', argv: ['update'] },
      selfUpdates: true,
      version: ['--version'],
      models: { read: 'claude-cache' },
      session: { discovery: 'explicit-argv' },
    } as AgentOperations,
    parked: '',
    // HOW ITS SIGN-IN GOES (KAN-716): Setup's Authenticate step says it above the terminal, read off
    // the CLI's own first-run screens (2.1.x); '' where Ronin has not read them.
    signIn: 'Press Enter to keep the text style, then pick a login method: 1 Claude account with subscription, 2 Anthropic Console account (API billing), or 3 a third-party platform. Open the link it shows, sign in, and paste the code it gives you back into the terminal.',
    login: {
      subscription: { argv: ['auth', 'login', '--claudeai'], paste: 'code' },
      api_key: { argv: ['auth', 'login', '--console'], paste: 'code' },
      // `claude auth status --json`: "authMethod": "claude.ai" for a subscription, the Console otherwise.
      status: { argv: ['auth', 'status', '--json'], subscription: '"authMethod":\\s*"claude\\.ai"', api_key: '"loggedIn":\\s*true' },
    } as AgentLogin,
    credentials: ['.claude/.credentials.json'],
    // What a parked office carries besides credentials (src/machine-park.ts): the CLI's own
    // settings, without which a fresh home asks first-run questions instead of resuming.
    carry: ['.claude.json', '.claude/settings.json'],
    screen: { busy: ['esc to interrupt'], asking: ['❯\\s*\\d+\\.\\s'], ready: ['^\\s*[│┃]?\\s*❯'] },
  },
  {
    id: 'codex',
    cmd: 'codex',
    label: 'Codex',
    vendor: { provider: 'openai', label: 'OpenAI', transcript_source: 'Observed 2026-09-22: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl; ordinal-sequenced records with a session metadata header. Journal adapter exists; fresh Ronin launches isolate the journal home; the id comes from its header.' } as AgentVendor,
    operations: {
      install: 'npm install -g @openai/codex',
      // OpenAI documents an explicit update, not automatic updates: https://developers.openai.com/codex/cli/
      update: { shell: 'npm install -g @openai/codex@latest', argv: [] },
      selfUpdates: false,
      version: ['--version'],
      models: { read: 'codex-cache' },
      session: { discovery: 'unsupported' },
    } as AgentOperations,
    parked: '',
    signIn: 'Pick one and press Enter: 1 Sign in with ChatGPT (a browser link to approve, on the same computer), 2 Sign in with Device Code (open auth.openai.com/codex/device and enter the code it shows: use this one in a hosted office), or 3 to paste an OpenAI API key.',
    login: {
      subscription: { argv: ['login', '--device-auth'], paste: null },
      api_key: { argv: ['login', '--with-api-key'], paste: 'key' },
      code: '\\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\\b',
      // `codex login status`: "Logged in using ChatGPT", or using an API key.
      status: { argv: ['login', 'status'], subscription: 'Logged in using ChatGPT', api_key: 'Logged in using an API key|API key' },
    } as AgentLogin,
    credentials: ['.codex/auth.json'],
    carry: ['.codex/config.toml'],
    screen: { busy: ['esc to interrupt'], asking: ['›\\s*\\d+\\.\\s'], ready: ['^\\s*›(?:\\s|$)'] },
  },
  {
    id: 'agy',
    cmd: 'agy',
    label: 'Antigravity CLI',
    vendor: { provider: 'google', label: 'Google', transcript_source: 'Reported, not yet observed here: ~/.gemini/antigravity-cli/brain/<conversation-id>/.system_generated/logs/transcript.jsonl. No adapter yet.' } as AgentVendor,
    operations: {
      // Google's installer: a checksum-verified binary to ~/.local/bin, no npm package.
      install: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
      // "automatically self-updates in the background during regular runs" (the installer); `agy update` on demand.
      update: { shell: '', argv: ['update'] },
      selfUpdates: true,
      version: ['--version'],
      models: { read: 'none' },
      session: { discovery: 'unsupported' },
    } as AgentOperations,
    parked: '',
    signIn: 'Pick 1 Google OAuth or 2 a Google Cloud project with the arrows and Enter. For Google OAuth, open the link it shows, sign in, and paste the authorization code back if it is not picked up.',
    credentials: [],
    carry: [],
    // Its choice menu, measured on 1.5.1's sign-in screen: "> 1. Google OAuth".
    screen: { busy: [], asking: ['(?:^|\\n)\\s*>\\s*\\d+\\.\\s'], ready: [] },
  },
  // [cli] auto_update defaults true: https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/05-configuration.md
  { id: 'grok', cmd: 'grok', label: 'Grok CLI', vendor: { provider: 'xai', label: 'xAI', transcript_source: 'No conversation journal found in the 2026-09-22 investigation (an empty FTS index, memory profiling and telemetry only). No transcript adapter available.' } as AgentVendor, operations: { install: 'npm install -g @xai-official/grok', update: { shell: 'npm install -g @xai-official/grok@latest', argv: [] }, selfUpdates: true, version: ['--version'], models: { read: 'command', argv: ['models'] }, session: { discovery: 'unsupported' } } as AgentOperations, parked: '', signIn: 'It shows a browser link and a code at once: open the link, check the browser shows the same code, and approve. The terminal finishes by itself.', credentials: ['.grok/auth.json'], carry: [], screen: { busy: [], asking: [], ready: [] } },
  {
    id: 'hermes',
    cmd: 'hermes',
    label: 'Hermes',
    vendor: { provider: 'hermes', label: 'Hermes', transcript_source: 'Not established; no transcript availability promised.' } as AgentVendor,
    operations: {
      install: '',
      setup: ['model'],
      // Vendor docs require an explicit update: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/updating.md
      update: { shell: '', argv: ['update'] },
      selfUpdates: false,
      version: ['--version'],
      models: { read: 'model-entries' },
      session: { discovery: 'unsupported' },
    } as AgentOperations,
    signIn: 'Pick the model provider with the arrows and Enter (Nous Portal is first), then answer what it asks for that provider.',
    credentials: [],
    carry: [],
    parked: "Ronin cannot install this one yet — Nous's own installer needs system packages it has to ask you for, and does not finish without them. Install it from their site and it appears here.",
    screen: { busy: [], asking: [], ready: [] },
  },
  {
    id: 'copilot',
    cmd: 'copilot',
    label: 'GitHub Copilot CLI',
    vendor: { provider: 'github', label: 'GitHub Copilot', transcript_source: 'From docs, not yet seen on a real run: $COPILOT_HOME/session-state/<session-id>/events.jsonl, one session event per line, the first session.start carrying data.sessionId. Adapter copilot-events; fresh Ronin launches isolate session-state.' } as AgentVendor,
    operations: {
      install: 'npm install -g @github/copilot',
      // `copilot help config`, autoUpdate: "Installations run from npm/JavaScript only report that a
      // newer version is available - installing it stays a manual `npm install`."
      update: { shell: 'npm install -g @github/copilot@latest', argv: [] },
      selfUpdates: false,
      version: ['--version'],
      models: { read: 'none' },
      session: { discovery: 'unsupported' },
    } as AgentOperations,
    parked: '',
    // Its token goes to the OS keyring, or into ~/.copilot/config.json beside trusted folders
    // when there is none: no file that means "signed in" alone, so the owner's Done activates it.
    signIn: '',
    credentials: [],
    carry: ['.copilot/config.json', '.copilot/settings.json'],
    screen: { busy: [], asking: [], ready: [] },
  },
  {
    id: 'opencode',
    cmd: 'opencode',
    label: 'OpenCode',
    vendor: { provider: 'opencode', label: 'OpenCode', transcript_source: 'One SQLite store for every session, ~/.local/share/opencode/opencode.db; schema unpublished. No adapter; Chat shows the terminal.' } as AgentVendor,
    operations: {
      install: 'npm install -g opencode-ai',
      // `autoupdate` defaults on (opencode.ai/docs/config); Update is npm's, as it was installed.
      update: { shell: 'npm install -g opencode-ai@latest', argv: [] },
      selfUpdates: true,
      version: ['--version'],
      // `opencode models` prints one provider/model id per line.
      models: { read: 'command-lines', argv: ['models'] },
      session: { discovery: 'unsupported' },
    } as AgentOperations,
    parked: '',
    // `opencode providers login` writes each provider's key or token here (opencode.ai/docs/providers).
    signIn: '',
    credentials: ['.local/share/opencode/auth.json'],
    carry: ['.config/opencode/opencode.jsonc', '.config/opencode/opencode.json'],
    screen: { busy: [], asking: [], ready: [] },
  },
  {
    id: 'kimi',
    cmd: 'kimi',
    label: 'Kimi Code',
    vendor: { provider: 'moonshot', label: 'Moonshot AI', transcript_source: '~/.kimi-code/sessions/<workspace>/<session-id>/agents/main/wire.jsonl; line format unpublished. No adapter; Chat shows the terminal.' } as AgentVendor,
    operations: {
      // Moonshot's npm package (Node 22.19+); its curl installer puts kimi in ~/.kimi-code/bin
      // and edits .bashrc, which a login shell does not reach.
      install: 'npm install -g @moonshot-ai/kimi-code',
      update: { shell: 'npm install -g @moonshot-ai/kimi-code@latest', argv: [] },
      selfUpdates: false,
      version: ['--version'],
      models: { read: 'none' },
      session: { discovery: 'unsupported' },
    } as AgentOperations,
    parked: '',
    // `kimi login` (device code) writes the hosted Kimi sign-in here (Kimi Code docs, Data locations).
    signIn: '',
    credentials: ['.kimi-code/credentials/managed:kimi-code.json'],
    carry: ['.kimi-code/config.toml'],
    // Measured on 2.6.2's first start: its folder-trust dialog. Its ready prompt, "│ >", is the house row.
    screen: { busy: [], asking: ['↑↓ navigate · Enter select'], ready: [] },
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
  /** The brief goes as the Agent's first message, through the message queue, once its screen reads ready. */
  message?: boolean;
}

export function initialBriefArgs(grammar: AgentLaunches | null, brief: string): string[] {
  if (!brief || !grammar || grammar.initial === 'none' || grammar.initial === 'message') return [];
  return grammar.initial === 'positional' ? [brief] : renderLaunch(grammar.initial, { brief });
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
  const initial = initialBriefArgs(grammar, brief);
  if (initial.length) return { argv: [bin, ...rest, ...initial], parked: false };
  if (brief && grammar?.initial === 'message') return { argv: [bin, ...rest], parked: false, message: true };
  return { argv: [bin, ...rest], parked: !!brief };
}

export interface HarnessLaunch {
  argv: string[];
  id: string;
  strategy: 'minted' | 'isolated' | 'unbound';
  grammar?: AgentLaunches;
}

/** Read identity using the same grammar that writes it. Never inspect the prompt text. */
function namedSession(argv: readonly string[], template: readonly string[]): string {
  if (!template.includes('{session_id}')) return '';
  for (let start = 1; start <= argv.length - template.length; start++) {
    let id = '';
    const matches = template.every((part, index) => {
      const value = argv[start + index]!;
      if (part === '{session_id}') { id = value; return !!value && !value.startsWith('-'); }
      return part === value;
    });
    if (matches) return id;
  }
  // Accept the conventional --flag=<id> spelling of a declared two-token option.
  if (template.length === 2 && template[0]!.startsWith('--') && template[1] === '{session_id}') {
    const prefix = template[0] + '=';
    const value = argv.slice(1).find(arg => arg.startsWith(prefix))?.slice(prefix.length) ?? '';
    if (value && !value.startsWith('-')) return value;
  }
  return '';
}

export async function newProviderSession(agent: string, argv: readonly string[]): Promise<HarnessLaunch> {
  const grammar = argv.length ? await readAgentLaunches(agent || 'terminal').catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return undefined; throw e;
  }) : undefined;
  const unchanged = { argv: [...argv], id: '', grammar };
  if (!grammar) return { ...unchanged, strategy: 'unbound' };
  const resume = grammar.resume.slice(1);
  const id = namedSession(argv, grammar.newSessionId) || namedSession(argv, resume);
  if (id) return { ...unchanged, id, strategy: 'minted' };
  // A selector without a literal id (interactive resume, --last, etc.) is not a new
  // conversation. Preserve it, but do not assign or claim an invented identity.
  if ([grammar.newSessionId[0], resume[0]].some(flag => flag && argv.slice(1).some(arg => arg === flag || arg.startsWith(flag + '='))))
    return { ...unchanged, strategy: 'unbound' };
  if (!grammar.newSessionId.length) return { ...unchanged, strategy: grammar.isolation ? 'isolated' : 'unbound' };
  const assigned = randomUUID();
  return { argv: [argv[0]!, ...renderLaunch(grammar.newSessionId, { session_id: assigned }), ...argv.slice(1)], id: assigned, strategy: 'minted', grammar };
}

/** The resume argv: the Agent's birth command (its birth receipt's `cmd`: model, permissions
 * mode, as it was born; KAN-661), then the CLI's resume grammar after the executable
 * (`claude … --resume <id>`, `codex … resume <id>`). No birth command: the CLI's Dangerously one,
 * never its plain one (KAN-718); Native comes back only from a birth command that chose it. */
export async function resumeAgentArgv(agent: string, id: string, birthCmd = ''): Promise<string[]> {
  const spec = AGENTS.find((a) => a.id === agent);
  if (!spec) return [];
  const grammar = await readAgentLaunches(spec.id);
  if (!grammar.resume.length) return [];
  const plain = grammar.nativeDangerously.length ? grammar.nativeDangerously.join(' ') : spec.cmd;
  const born = birthCmd.trim().split(/\s+/)[0]?.split('/').pop() === spec.cmd ? birthCmd : plain;
  const launch = await launchArgv(born, '');
  return launch.argv.length ? [...launch.argv, ...renderLaunch(grammar.resume, { session_id: id }).slice(1)] : [];
}

export function agentSpec(id: string): (typeof AGENTS)[number] | undefined {
  return AGENTS.find((agent) => agent.id === id);
}

export function defaultAgentCommand(): string {
  return AGENTS[0].cmd;
}
