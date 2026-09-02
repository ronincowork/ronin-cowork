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
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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

// eslint-disable-next-line no-control-regex
const SGR = /\x1b\[[0-9;]*m/g;
/** Text with colour and every kind of whitespace removed — what survives a TUI reflowing a draft. */
const squash = (s: string): string => s.replace(SGR, '').replace(/\s+/g, '');
const FINGERPRINT = 48;
/** The tail of a message, squashed: enough to recognise it, short enough to survive a wrap. */
export const fingerprintOf = (text: string): string => squash(text).slice(-FINGERPRINT);

/**
 * IS THIS MESSAGE SITTING UNSUBMITTED AT THE PROMPT — the whole draft, however tall?
 *
 * `parsePrompt` answers "is there a prompt, and what is on its row". A long message
 * wraps into a draft a dozen rows tall; the prompt row is then ABOVE the fifteen-row
 * window and the read comes back "cannot tell". Measured 2026-09-02: a tell into a
 * Codex tile typed the text, read "not visible", returned without Enter, and left the
 * message stranded at the prompt — where every retry then refused it as "unsubmitted
 * text" or "busy", forever, and held the messages behind it. The owner found the text
 * sitting in the composer.
 *
 * So this looks for the draft itself: from the LAST prompt marker row in the pane
 * (wherever it is) to the bottom, does the squashed text contain the message's
 * fingerprint? Above that row is the transcript, where a submitted copy also lives, so
 * the search never starts there. A numbered marker row is a dialog and never a draft.
 */
export function draftAtPrompt(raw: string, text: string): boolean {
  const fp = fingerprintOf(text);
  if (!fp) return false;
  const lines = raw.split('\n');
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const bare = lines[i].replace(SGR, '').replace(/ /g, ' ');
    if (!/[❯›]/.test(bare)) continue;
    if (/[❯›]\s*\d+\.\s/.test(bare)) return false;
    at = i;
    break;
  }
  if (at < 0) return false;
  return squash(lines.slice(at).join('\n')).includes(fp);
}

/** The pane, as this file drives it; a test hands in a fake and the policy runs unchanged. */
export interface PaneIO {
  read(): Promise<string>;
  type(text: string): Promise<void>;
  enter(): Promise<void>;
  wait(ms: number): Promise<void>;
}

const typeText = (name: string, text: string) =>
  pexec('tmux', ['send-keys', '-t', exactPane(name), '-l', '--', text]);
const pressEnter = (name: string) => pexec('tmux', ['send-keys', '-t', exactPane(name), 'Enter']);
const paneIO = (name: string): PaneIO => ({
  read: () => capturePane(name),
  type: (text) => typeText(name, text).then(() => undefined),
  enter: () => pressEnter(name).then(() => undefined),
  wait: sleep,
});

/**
 * Automatic delivery and Try Again: an uncertain prompt is a retained message.
 *
 * Two cases are decided by the draft, not the prompt row. (1) After typing, a message
 * the prompt read cannot see but the pane plainly holds at the prompt IS typed, and gets
 * its Enter — returning here without one is how a message strands. (2) On entry, a draft
 * at the prompt that is THIS message is an earlier attempt's stranded copy: it is not
 * typed again (never a second copy) and not refused (never a permanent stall); it is
 * submitted. Any other draft is somebody's unsubmitted words and is left alone.
 */
export async function deliverSafe(name: string, text: string, onAttempt?: () => void, io: PaneIO = paneIO(name)): Promise<DeliveryResult> {
  let raw = await io.read();
  const before = parsePrompt(raw);
  let typedText: string | null;
  if (draftAtPrompt(raw, text)) {
    typedText = before.text;
  } else {
    if (!before.found) return { delivered: false, submitted: false, reason: 'busy or prompt not recognized' };
    if (before.menu) return { delivered: false, submitted: false, reason: 'dialog is open' };
    if (before.text) return { delivered: false, submitted: false, reason: 'unsubmitted text is already at the prompt' };
    onAttempt?.();
    await io.type(text);
    await io.wait(350);
    raw = await io.read();
    const typed = parsePrompt(raw);
    if (typed.menu) return { delivered: false, submitted: false, reason: 'dialog opened before submit' };
    if (!typed.text && !draftAtPrompt(raw, text)) return { delivered: false, submitted: false, reason: 'text did not become visible at the prompt' };
    typedText = typed.text;
  }
  await io.enter();
  for (let i = 0; i < 3; i++) {
    await io.wait(700);
    raw = await io.read();
    const now = parsePrompt(raw);
    if (now.menu) return { delivered: false, submitted: true, reason: 'dialog opened while submitting' };
    const pending = draftAtPrompt(raw, text) || (typedText !== null && now.text === typedText);
    if (!pending) {
      if (!now.found || now.text === null) return { delivered: true, submitted: true, reason: 'delivered' };
      return { delivered: false, submitted: true, reason: 'The prompt changed before delivery could be confirmed. Automatic retries stopped to avoid sending a duplicate.' };
    }
    await io.enter();
  }
  return { delivered: false, submitted: true, reason: 'text remains at the prompt after Enter retries' };
}

/** Owner-only Force: type once, then submit/check for one bounded ten-second attempt. */
export async function deliverForce(name: string, text: string, timeoutMs = 10_000, io: PaneIO = paneIO(name)): Promise<DeliveryResult> {
  await io.type(text);
  await io.wait(300);
  const deadline = Date.now() + timeoutMs;
  do {
    await io.enter();
    await io.wait(800);
    const raw = await io.read();
    const now = parsePrompt(raw);
    if (!draftAtPrompt(raw, text) && (!now.found || (!now.menu && now.text === null))) return { delivered: true, submitted: true, reason: 'delivered by Force' };
  } while (Date.now() < deadline);
  return { delivered: false, submitted: true, reason: 'Force could not observe delivery within 10 seconds' };
}

async function capturePane(name: string): Promise<string> {
  const { stdout } = await pexec('tmux', ['capture-pane', '-p', '-e', '-t', exactPane(name)], {
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout;
}

export async function readPrompt(name: string): Promise<PromptRead> {
  try {
    return parsePrompt(await capturePane(name));
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
