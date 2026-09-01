/**
 * SENDING INTO A PANE — typing at a CLI, and knowing whether it landed.
 *
 * Split out of `tmux.ts` when that file reached its 700-line ceiling, but it is a real
 * seam rather than a place to put the overflow. Everything in `tmux.ts` ASKS tmux about
 * sessions — names, options, dials, directories — and the answers are facts. This file
 * DRIVES a pane, where nothing is a fact until it has been read back, because the thing
 * on the other end is a TUI redrawing on its own clock.
 *
 * It exists because of one class of bug: a brief that never reached the agent while every
 * signal said the session was fine. Two ways that happens, both measured on real boots:
 *
 *   1. THE TEXT NEVER ARRIVES — sent while the CLI is still starting, and swallowed
 *      whole. No trace anywhere in the pane, and an empty prompt is exactly what success
 *      looks like, so nothing downstream can tell the difference.
 *   2. THE ENTER IS LOST — the text sits at the prompt unsubmitted while the pane
 *      repaints enough (status line, spinner, a long paste collapsing to
 *      `[Pasted text #1]`) that a screen-diff check calls it submitted.
 *
 * Neither is fixable by waiting longer, and that is the point of the file: "has painted a
 * prompt" and "is accepting input" are different facts, and no timeout turns one into the
 * other. Read the pane back instead.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { exactPane } from './tmux.js';
import { classifyStatus } from './status.js';

const pexec = promisify(execFile);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PromptRead {
  /** Did we find a prompt line at all? False = a CLI whose prompt we cannot read. */
  found: boolean;
  /** Real unsubmitted text sitting at it, or null when the prompt is empty. */
  text: string | null;
  /**
   * Is the `❯` a SELECTION MENU rather than an input prompt — `❯ 1. Yes, I trust this
   * folder`? Nothing may be typed or submitted into one.
   *
   * This is the bug that ate a brief. A cold CLI in an untrusted directory opens a trust
   * dialog, whose rows are drawn with the same `❯`. Read as a prompt-with-text-in-it, the
   * send skipped to "press Enter" — which ANSWERED THE DIALOG, cleared the screen, and
   * reported success, having thrown the brief away. Pressing Enter into a dialog is
   * choosing on the owner's behalf, and it is the one thing worse than not sending.
   */
  menu: boolean;
}

/**
 * What is sitting UNSUBMITTED at a pane's prompt right now.
 *
 * Three details, all of them load-bearing, and the first two are `ronin_bin/tejun-send`'s
 * — this is the same check in TypeScript, not a second idea about it:
 *
 *   1. ONLY THE LAST FEW NON-BLANK ROWS. Submitted messages also render with a `❯` up in
 *      the scrollback, so searching the whole pane mistakes history for pending input.
 *      Blank padding is stripped FIRST: tmux returns the full pane height, so a prompt
 *      near the top of a tall pane is followed by rows of nothing, and "the last 6 lines"
 *      is then six blanks. Measured — a 20-row pane with the prompt on row 1 reported
 *      "nothing pending" with a draft plainly sitting there.
 *   2. DIM IS THE CLI TALKING, NOT THE OWNER. Claude renders a suggested reply at the
 *      prompt — the kind you press Tab to accept — in dim SGR, and there is almost always
 *      one there. Read as a draft it would block every send forever; read as an empty
 *      prompt it is exactly right, because that is what it is. This needs `capture-pane
 *      -e`: without it the colour is stripped and a suggestion is indistinguishable from
 *      something the owner typed.
 *   3. FOUND AND EMPTY IS NOT THE SAME AS NOT FOUND. Found-and-empty means a send went
 *      missing and may be retried; not-found means we cannot tell and must not act.
 */
export function parsePrompt(raw: string): PromptRead {
  const cannotTell: PromptRead = { found: false, text: null, menu: false };
  if (classifyStatus(raw) === 'thinking') return cannotTell;
  const lines = raw.split('\n');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const line = lines
    // Claude currently paints six footer rows BELOW its input. Six physical rows therefore
    // excluded the prompt itself and made an idle Agent read as unavailable. Use the same
    // measured visible-tail boundary as status.ts; busy cues above already win.
    .slice(-15)
    .filter((l) => /[❯›]/.test(l))
    .pop();
  if (line === undefined) return cannotTell;
  // A numbered row is a menu, not a prompt. Same test the status classifier uses
  // (STATUS_PATTERNS, `awaiting-input`) — one idea about what a dialog looks like.
  const bare = line
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/ /g, ' ');
  if (/[❯›]\s*\d+\.\s/.test(bare)) return { found: true, text: null, menu: true };
  // eslint-disable-next-line no-control-regex
  if (/\x1b\[2m/.test(line)) return { found: true, text: null, menu: false };
  const text = line
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/ /g, ' ')
    .replace(/^.*[❯›] */, '')
    .trim();
  return { found: true, text: text || null, menu: false };
}

export interface DeliveryResult {
  delivered: boolean;
  reason: string;
  submitted: boolean;
}

const typeText = (name: string, text: string) =>
  pexec('tmux', ['send-keys', '-t', exactPane(name), '-l', '--', text]);
const pressEnter = (name: string) => pexec('tmux', ['send-keys', '-t', exactPane(name), 'Enter']);

/** Automatic delivery and Try Again: an uncertain prompt is a retained message. */
export async function deliverSafe(name: string, text: string, onAttempt?: () => void): Promise<DeliveryResult> {
  const before = await readPrompt(name);
  if (!before.found) return { delivered: false, submitted: false, reason: 'busy or prompt not recognized' };
  if (before.menu) return { delivered: false, submitted: false, reason: 'dialog is open' };
  if (before.text) return { delivered: false, submitted: false, reason: 'unsubmitted text is already at the prompt' };

  onAttempt?.();
  await typeText(name, text);
  await sleep(350);
  const typed = await readPrompt(name);
  if (!typed.found || typed.menu || !typed.text) {
    return { delivered: false, submitted: false, reason: typed.menu ? 'dialog opened before submit' : 'text did not become visible at the prompt' };
  }
  await pressEnter(name);
  for (let i = 0; i < 3; i++) {
    await sleep(700);
    const now = await readPrompt(name);
    if (!now.found || (!now.menu && now.text === null)) return { delivered: true, submitted: true, reason: 'delivered' };
    if (now.menu) return { delivered: false, submitted: true, reason: 'dialog opened while submitting' };
    if (now.text !== typed.text) return { delivered: false, submitted: true, reason: 'The prompt changed before delivery could be confirmed. Automatic retries stopped to avoid sending a duplicate.' };
    await pressEnter(name);
  }
  return { delivered: false, submitted: true, reason: 'text remains at the prompt after Enter retries' };
}

/** Owner-only Force: type once, then submit/check for one bounded ten-second attempt. */
export async function deliverForce(name: string, text: string, timeoutMs = 10_000): Promise<DeliveryResult> {
  await typeText(name, text);
  await sleep(300);
  const deadline = Date.now() + timeoutMs;
  do {
    await pressEnter(name);
    await sleep(800);
    const now = await readPrompt(name);
    if (!now.found || (!now.menu && now.text === null)) return { delivered: true, submitted: true, reason: 'delivered by Force' };
  } while (Date.now() < deadline);
  return { delivered: false, submitted: true, reason: 'Force could not observe delivery within 10 seconds' };
}

export async function readPrompt(name: string): Promise<PromptRead> {
  try {
    const { stdout } = await pexec('tmux', ['capture-pane', '-p', '-e', '-t', exactPane(name)], {
      maxBuffer: 4 * 1024 * 1024,
    });
    return parsePrompt(stdout);
  } catch {
    return { found: false, text: null, menu: false }; // pane gone mid-send; not this function's business why
  }
}


/** Legacy callers share automatic delivery's safe policy. Force exists only explicitly. */
export async function sendText(
  name: string,
  text: string,
): Promise<{ resent: boolean; started: boolean }> {
  const result = await deliverSafe(name, text);
  return { resent: result.submitted && !result.delivered, started: result.delivered };
}

/** Run a shell command in a session's active pane (the launcher's boot step). */
export async function runCommand(name: string, cmd: string): Promise<void> {
  await pexec('tmux', ['send-keys', '-t', exactPane(name), '-l', '--', cmd]);
  await pexec('tmux', ['send-keys', '-t', exactPane(name), 'Enter']);
}
