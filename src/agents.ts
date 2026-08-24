/**
 * AGENT AVAILABILITY — is each supported agent CLI present on this machine.
 *
 * The first-load Setup page asks a different question of each agent depending on this one
 * fact, and that is the whole reason the probe exists:
 *
 *   present  ->  "use it?"      (having is not wanting — it may be declined)
 *   absent   ->  "install it?"
 *
 * So detection is not an abstraction over the launch table. It is what decides which
 * question a row asks. Without it there is no third option, only a list of choices that
 * fail when pressed.
 *
 * WHAT THIS DELIBERATELY DOES NOT ANSWER: whether the CLI is signed in. Authentication is
 * interactive, provider-specific and none of Ronin's business to inspect; the owner's
 * accounts are not ours to read. A row says installed or not installed and stops there
 * (owner's review, 2026-08-17). The first launch proves the rest.
 *
 * ---------------------------------------------------------------------------
 * WHY A LOGIN SHELL, and not `command -v` from this process.
 *
 * Three PATHs disagree on an ordinary box. Measured 2026-08-17, with `claude` installed by
 * its own installer into `~/.local/bin`:
 *
 *   this Node process   ...:~/.local/bin:...            claude FOUND
 *   tmux server env     /usr/local/bin:/usr/bin:/bin    claude ABSENT
 *   a login shell       ...:~/.local/bin:...            claude FOUND
 *
 * A login shell puts `~/.local/bin` on PATH from the user's profile; the tmux server's
 * inherited environment does not have it. And a pane does not run with the server's
 * environment — `new-session` starts the default shell as a LOGIN shell, which rebuilds
 * PATH from profile. So the login shell's answer IS the pane's answer, and it is the only
 * one worth reporting.
 *
 * Probing this process's own PATH is nearly right, and wrong in a way that would be hard
 * to see: the service inherits whatever environment started it, which on a developer's box
 * happens to carry `~/.local/bin` and on a fresh install will not.
 * ------------------------------------------------------------------------- */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);

/** The supported set, in the order the Setup page lists them. The first run is not a
 * provider marketplace: an agent earns a row here when the owner rules it in, and its
 * new-session behaviour is proved before it earns a launch-table column
 * (docs/model-providers.md). Grok joined 2026-08-18 by the owner's word. */
/** THE single source of install commands (owner, 2026-08-20): the mechanical installer,
 *  the setup page and ⚙ all read `get` from here — adjust it here and every surface
 *  follows. Grok's package is verified official (npm maintainer xai-security
 *  <security@x.ai>).
 *
 *  `get` EMPTY MEANS RONIN CANNOT INSTALL IT, and `parked` is the sentence saying why —
 *  written for the person reading the row, because a row that offers an install that
 *  cannot work is worse than a row that admits it. It is the one field the surfaces need
 *  in order to be honest, and it keeps `get` a single clean question: is there a command?
 *
 *  HERMES IS PARKED (owner, 2026-08-20), and it was measured, not assumed: run on a
 *  stock box, Nous's own script asks twice for sudo to add system packages and then fails
 *  its own last step, leaving no `hermes` command behind. It is the only one of the five
 *  that is not a plain npm package. It comes back the day its line is re-verified — one
 *  field on one row, and every surface follows. */
/**
 * WHAT EACH AGENT'S SCREEN LOOKS LIKE — the second thing this file is the one source of.
 *
 * The `get` line proved the shape: per agent, declared once, read by every surface. A
 * vendor's screen wants the same treatment, because the alternative is what we had — the
 * knowledge of which glyph means "listening" living in `src/status.ts`, a second place,
 * drifting from the list of agents it describes.
 *
 * REGEX SOURCES, NOT RegExp, and that is the registry's standing rule showing up here: a
 * value in a table like this is DATA a reader interprets, never a code path. `status.ts`
 * compiles them once at import.
 *
 * Three categories, and the order between them is the contract (busy, then asking, then
 * ready), because the truest thing on a screen is the most specific one:
 *
 *   busy    it is working. Nothing should be typed at it yet.
 *   asking  it has drawn a dialog. A PERSON is the thing being waited for, so waiting is
 *           correct behaviour at any duration.
 *   ready   its prompt row. It is listening.
 *
 * AN EMPTY LIST IS AN HONEST ANSWER, not a gap to fill with a guess. Only Claude Code and
 * Codex have been characterised on a real screen; the rest carry nothing of their own and
 * fall back to the house rows in `status.ts`, which is exactly today's behaviour. A wrong
 * pattern would be worse than no pattern: it would answer "listening" about something that
 * is not.
 */
/**
 * HOW A BRIEF REACHES THIS AGENT — measured off each vendor's own `--help` on 2026-08-20,
 * grok in a throwaway prefix because it is not installed here (the clean-room discipline
 * `scripts/check-agent-installs.ts` uses).
 *
 *   'positional'  it takes an initial prompt as a plain argument AND stays interactive.
 *   'none'        it does not. The brief is parked on the session shelf instead and the
 *                 tile is told where — never typed at.
 *
 * Nothing carries 'none' today: all four installable vendors take a positional prompt.
 * The value exists so that a vendor which does not is a row in this table rather than a
 * rewrite, and it is said out loud that nothing exercises the other branch yet.
 */
export type InitialPrompt = 'positional' | 'none';

export interface AgentScreen {
  busy: readonly string[];
  asking: readonly string[];
  ready: readonly string[];
}

export interface AgentLifecycle {
  /** Optional flag accepted on a new interactive launch before its initial prompt. */
  sessionIdFlag: string;
  /** Arguments placed between the executable and provider conversation UUID. */
  resume: readonly string[];
}

export const AGENTS = [
  {
    id: 'claude',
    cmd: 'claude',
    label: 'Claude Code',
    from: 'Anthropic',
    get: 'npm install -g @anthropic-ai/claude-code',
    parked: '',
    lifecycle: { sessionIdFlag: '--session-id', resume: ['--resume'] } as AgentLifecycle,
    // `Usage: claude [options] [command] [prompt]` — `prompt  Your prompt`.
    initial: 'positional' as InitialPrompt,
    // Claude draws `❯ ` and then fills the rest of the line with its own placeholder hint
    // (`❯ Try "create a util…"`), so an "empty to end of line" test never fires and a
    // fresh session looked unready until the readiness wait timed out. Match the row.
    screen: { busy: ['esc to interrupt'], asking: ['❯\\s*\\d+\\.\\s'], ready: ['^\\s*[│┃]?\\s*❯'] },
  },
  {
    id: 'codex',
    cmd: 'codex',
    label: 'Codex',
    from: 'OpenAI',
    get: 'npm install -g @openai/codex',
    parked: '',
    lifecycle: { sessionIdFlag: '', resume: ['resume'] } as AgentLifecycle,
    // `Usage: codex [OPTIONS] [PROMPT]` — "Optional user prompt to start the session".
    initial: 'positional' as InitialPrompt,
    // Codex uses `›` for both its input row and its dialog rows, so a NUMBERED › is a
    // dialog and a bare one is the prompt. The order of the categories is what keeps
    // those apart, and getting it wrong is how a brief answers a trust dialog.
    screen: { busy: ['esc to interrupt'], asking: ['›\\s*\\d+\\.\\s'], ready: ['^\\s*›(?:\\s|$)'] },
  },
  {
    id: 'gemini',
    cmd: 'gemini',
    label: 'Gemini CLI',
    from: 'Google',
    get: 'npm install -g @google/gemini-cli',
    parked: '',
    lifecycle: { sessionIdFlag: '', resume: [] } as AgentLifecycle,
    // Positional `query`: "Initial prompt. Runs in interactive mode by default." NEVER
    // `-p`, which is its HEADLESS mode — that would answer and exit, not open a tile.
    initial: 'positional' as InitialPrompt,
    // Measured 2026-08-20 by launching it into a directory it had never seen. Gemini marks
    // the selected row of its trust dialog with a BULLET — not Claude's `❯`, not Codex's
    // `›` — and asks "Do you trust the files in this folder?", which the house `do you
    // want` row does not catch, so the whole screen used to read as unrecognised.
    //
    // ONLY `asking` IS FILLED, because only the dialog has been seen: it never got past
    // that screen, so nobody has read its prompt row. An empty category falls back to
    // every agent's rows (src/status.ts), which is what keeps that honest instead of
    // making it a silent regression.
    screen: { busy: [], asking: ['●\\s*\\d+\\.\\s'], ready: [] },
  },
  // Grok and Hermes are NOT characterised — nobody has read their screens against a real
  // session, so they say nothing rather than guess, and the house rows answer for them.
  { id: 'grok', cmd: 'grok', label: 'Grok CLI', from: 'xAI', get: 'npm install -g @xai-official/grok', parked: '', lifecycle: { sessionIdFlag: '', resume: [] } as AgentLifecycle, initial: 'positional' as InitialPrompt, screen: { busy: [], asking: [], ready: [] } },
  {
    id: 'hermes',
    cmd: 'hermes',
    label: 'Hermes',
    from: 'Nous Research',
    get: '',
    // Parked, so nothing ever launches it and its argv shape has never been read.
    initial: 'none' as InitialPrompt,
    parked: "Ronin cannot install this one yet — Nous's own installer needs system packages it has to ask you for, and does not finish without them. Install it from their site and it appears here.",
    lifecycle: { sessionIdFlag: '', resume: [] } as AgentLifecycle,
    screen: { busy: [], asking: [], ready: [] },
  },
] as const;

export interface AgentAvailability {
  id: string;
  label: string;
  from: string;
  /** The one line that installs it — empty when Ronin has no command for it, and then
   *  `parked` says why in the words a person reads. Naming a missing thing without
   *  saying how to get it is the same as not helping (USERS_JOURNEY). */
  get: string;
  /** Why Ronin cannot install it, when it cannot. Empty for every agent it can. */
  parked: string;
  cmd: string;
  /** Present on this machine. Says nothing about whether it is signed in. */
  installed: boolean;
  /** Where the login shell resolved it, for the owner to recognise. Empty when absent. */
  path: string;
}

/** The login shell this user's panes get. `$SHELL` when the service has one, else bash,
 * else the shell every Unix has. `-l` is the load-bearing flag. */
function loginShell(): string {
  const s = process.env.SHELL;
  return s && s.trim() ? s : '/bin/bash';
}

/**
 * One shell, one round trip, all four answers. `command -v` is the portable ask; `|| true`
 * keeps a missing command from ending the loop, so an absent agent is an empty field rather
 * than a failed probe.
 */
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
    // A shell that will not run is not evidence that nothing is installed. Report every
    // agent as absent-and-unknown rather than inventing a state: the page's honest
    // fallback is to offer the install, which is safe, over claiming a thing is missing.
  }

  return AGENTS.map((a) => {
    const where = found.get(a.cmd) ?? '';
    return { id: a.id, label: a.label, from: a.from, get: a.get, parked: a.parked, cmd: a.cmd, installed: !!where, path: where };
  });
}

/** What a launch should actually run, and what to do with the brief. */
export interface LaunchArgv {
  /** argv for the tile's process: absolute binary first. Empty when nothing can run. */
  argv: string[];
  /** True when the brief could not ride argv and must be parked on the shelf instead. */
  parked: boolean;
}

/**
 * THE COMMAND A TILE BECOMES — argv, never a string for a shell to parse.
 *
 * ABSOLUTE PATH, FROM THE PROBE. A bare name would need a shell to resolve it, and a shell
 * in the tile is the thing being removed: it is what the machine used to type at, and what
 * a dying CLI used to fall back to. `listAgentAvailability()` already resolves the path a
 * login shell would find, so it is the one answer worth trusting here too.
 *
 * THE BRIEF RIDES AS A PLAIN ARGUMENT when the vendor takes one, appended last so it lands
 * on the positional every one of them uses. tmux execs argv literally — measured — so the
 * brief may contain anything at all without quoting or escaping entering the picture.
 *
 * If the binary cannot be resolved, this returns nothing rather than guessing: a launch
 * that cannot name its own program should fail where someone can see it, not become a
 * shell that looks like it worked.
 */
export async function launchArgv(cmd: string, brief: string): Promise<LaunchArgv> {
  const parts = cmd.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { argv: [], parked: false };
  const [head, ...rest] = parts;
  const bare = head.split('/').pop() ?? head;
  const spec = AGENTS.find((a) => a.cmd === bare);
  const probed = (await listAgentAvailability()).find((a) => a.cmd === bare);
  const bin = probed?.path || (head.includes('/') ? head : '');
  if (!bin) return { argv: [], parked: false };
  // An agent we do not carry a row for is treated as taking no initial prompt: parking is
  // the safe half of the guess, because the cost is a brief on the shelf rather than an
  // argument a vendor might read as a file, a flag, or a subcommand.
  if (spec?.initial === 'positional' && brief) return { argv: [bin, ...rest, brief], parked: false };
  return { argv: [bin, ...rest], parked: !!brief };
}

/** Apply provider-owned new-conversation syntax without teaching the launch route flags. */
export function withProviderSessionId(agent: string, argv: readonly string[], id: string): string[] {
  const spec = AGENTS.find((a) => a.id === agent);
  if (!spec?.lifecycle.sessionIdFlag) return [...argv];
  return [argv[0], spec.lifecycle.sessionIdFlag, id, ...argv.slice(1)];
}

/** Resolve the installed binary and provider-owned resume syntax from the same registry. */
export async function resumeAgentArgv(agent: string, id: string): Promise<string[]> {
  const spec = AGENTS.find((a) => a.id === agent);
  if (!spec?.lifecycle.resume.length) return [];
  const launch = await launchArgv(spec.cmd, '');
  return launch.argv.length ? [launch.argv[0], ...spec.lifecycle.resume, id] : [];
}
