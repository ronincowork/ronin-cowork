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
  // until the readiness wait timed out. Match the prompt row itself, hint or no hint.
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
 * Wait for a CLI that is about to be handed its first message — and WAIT LONGER WHEN A
 * PERSON IS THE THING BEING WAITED FOR.
 *
 * A freshly-launched CLI in an unfamiliar directory opens a dialog: *do you trust this
 * folder?* It will sit there forever, because it is waiting for a human. Two states that
 * look the same to a stopwatch, and want opposite patience:
 *
 *   - not ready, nothing asked   a slow start. Give it ~90s, then something is wrong.
 *   - not ready, DIALOG open     a person has to answer. Waiting is the correct
 *                                behaviour, and it is not a fault at any duration.
 *
 * So the deadline is chosen by WHAT is blocking, not by how long it has taken. Once a
 * dialog has been seen the window opens to a quarter of an hour, because "launch a
 * session, get distracted, come back and answer it" is completely ordinary — and under
 * the old flat 90s the brief was silently dropped in exactly that case, leaving a session
 * that looked alive and had been told nothing.
 *
 * `held` reports whether a dialog was ever seen, so the caller can say so rather than
 * leaving the delay unexplained.
 */
export async function waitReadyForBrief(
  session: string,
  { quietMs = 90000, heldMs = 900000 } = {},
): Promise<{ ready: boolean; held: boolean }> {
  const start = Date.now();
  let held = false;
  for (;;) {
    const status = await probeStatus(session);
    if (status === 'ready') return { ready: true, held };
    // A dialog is on screen. Note it once; from here the long window applies.
    if (status === 'awaiting-input') held = true;
    if (Date.now() - start > (held ? heldMs : quietMs)) return { ready: false, held };
    // Deliberately unhurried: this one may run for a quarter of an hour,
    // and nobody is watching the first second of it.
    await new Promise((r) => setTimeout(r, 500));
  }
}
