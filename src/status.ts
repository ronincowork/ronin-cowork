import { capturePane } from './tmux.js';

/**
 * Status probe (terminal view only): classify a session's state from its visible
 * pane text — the same patterns the status-probe action (ronin_catalogs/ACTIONS.md) reads
 * by eye. Never agent internals — pane text is the whole truth.
 *
 * The pattern list is THE extension point (same contract as ctx.ts): tried in
 * order, first match wins — so busy patterns come before pending-input patterns,
 * which come before ready patterns.
 */
export type SessionStatus = 'ready' | 'thinking' | 'awaiting-input';

export const STATUS_PATTERNS: { status: SessionStatus; re: RegExp }[] = [
  // Busy: Claude Code and Codex both print "(esc to interrupt)" while working.
  { status: 'thinking', re: /esc to interrupt/i },
  // Busy: a spinner glyph opening a line ("✻ Cerebrating…").
  { status: 'thinking', re: /^\s*[✻✳✢✶✽·∗]\s+\S+…/m },
  // Pending dialog: a selection list with a pointer ("❯ 1. Yes").
  { status: 'awaiting-input', re: /❯\s*\d+\.\s/ },
  // Pending question: an explicit ask or y/n.
  { status: 'awaiting-input', re: /\(y\/n\)|\[y\/n\]|do you want/i },
  // Ready: an agent prompt row. Claude Code draws "❯ " and then fills the rest of
  // the line with its own placeholder hint (`❯ Try "create a util…"`), so an
  // "empty to end of line" test never fires and a fresh session looked unready
  // until waitReady timed out. Match the prompt row itself, hint or no hint.
  { status: 'ready', re: /^\s*[│┃]?\s*❯/m },
  // Ready: the boxed "│ > " prompt row some CLIs draw instead of ❯.
  { status: 'ready', re: /^\s*[│┃]\s*>\s/m },
  // Ready: a plain shell prompt as the last thing on a line.
  { status: 'ready', re: /[$%#]\s*$/m },
];

/** Status cues live at the pane bottom — only the visible tail is worth scanning. */
const SCAN_LINES = 15;

/** Classify captured pane text (null = no recognizable cue, e.g. mid-output). */
export function classifyStatus(text: string): SessionStatus | null {
  const tail = text.replace(/\n+$/, '').split('\n').slice(-SCAN_LINES).join('\n');
  for (const p of STATUS_PATTERNS) if (p.re.test(tail)) return p.status;
  return null;
}

/** Probe a live session (null on capture failure — e.g. it just died). */
export async function probeStatus(session: string): Promise<SessionStatus | null> {
  try {
    return classifyStatus(await capturePane(session, 0));
  } catch {
    return null;
  }
}

/**
 * Wait for a freshly-launched CLI to reach its ready prompt (used by the home-panel
 * launcher before delivering the first prompt). Resolves false on timeout — the
 * caller sends anyway and the pane shows what happened.
 */
export async function waitReady(session: string, timeoutMs = 20000): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await probeStatus(session)) === 'ready') return true;
    // Tight poll: a CLI reaches its prompt in ~1s and the first prompt should land
    // the moment it does — this interval IS the perceived lag of a new session.
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}
