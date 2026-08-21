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
export interface AgentScreen {
  busy: readonly string[];
  asking: readonly string[];
  ready: readonly string[];
}

export const AGENTS = [
  {
    id: 'claude',
    cmd: 'claude',
    label: 'Claude Code',
    from: 'Anthropic',
    get: 'npm install -g @anthropic-ai/claude-code',
    parked: '',
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
    // Codex uses `›` for both its input row and its dialog rows, so a NUMBERED › is a
    // dialog and a bare one is the prompt. The order of the categories is what keeps
    // those apart, and getting it wrong is how a brief answers a trust dialog.
    screen: { busy: ['esc to interrupt'], asking: ['›\\s*\\d+\\.\\s'], ready: ['^\\s*›(?:\\s|$)'] },
  },
  // The three below are NOT characterised — nobody has read their screens against a real
  // session, so they say nothing rather than guess, and the house rows answer for them.
  { id: 'gemini', cmd: 'gemini', label: 'Gemini CLI', from: 'Google', get: 'npm install -g @google/gemini-cli', parked: '', screen: { busy: [], asking: [], ready: [] } },
  { id: 'grok', cmd: 'grok', label: 'Grok CLI', from: 'xAI', get: 'npm install -g @xai-official/grok', parked: '', screen: { busy: [], asking: [], ready: [] } },
  {
    id: 'hermes',
    cmd: 'hermes',
    label: 'Hermes',
    from: 'Nous Research',
    get: '',
    parked: "Ronin cannot install this one yet — Nous's own installer needs system packages it has to ask you for, and does not finish without them. Install it from their site and it appears here.",
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
