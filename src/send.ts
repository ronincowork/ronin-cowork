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

const pexec = promisify(execFile);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Visible pane text only (no history) — the fallback probe when there is no prompt. */
async function paneScreen(name: string): Promise<string> {
  const { stdout } = await pexec('tmux', ['capture-pane', '-p', '-t', exactPane(name)], {
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout;
}

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
export async function readPrompt(name: string): Promise<PromptRead> {
  const cannotTell: PromptRead = { found: false, text: null, menu: false };
  let raw: string;
  try {
    const { stdout } = await pexec('tmux', ['capture-pane', '-p', '-e', '-t', exactPane(name)], {
      maxBuffer: 4 * 1024 * 1024,
    });
    raw = stdout;
  } catch {
    return cannotTell; // pane gone mid-send; not this function's business why
  }
  const lines = raw.split('\n');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const line = lines
    .slice(-6)
    .filter((l) => l.includes('❯'))
    .pop();
  if (line === undefined) return cannotTell;
  // A numbered row is a menu, not a prompt. Same test the status classifier uses
  // (STATUS_PATTERNS, `awaiting-input`) — one idea about what a dialog looks like.
  const bare = line
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/ /g, ' ');
  if (/❯\s*\d+\.\s/.test(bare)) return { found: true, text: null, menu: true };
  // eslint-disable-next-line no-control-regex
  if (/\x1b\[2m/.test(line)) return { found: true, text: null, menu: false };
  const text = line
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/ /g, ' ')
    .replace(/^.*❯ */, '')
    .trim();
  return { found: true, text: text || null, menu: false };
}


/**
 * Type `text` into a pane and submit it — literal text and Enter as SEPARATE send-keys
 * calls, which is what makes a TUI treat the Enter as a real submit rather than pasted
 * input. Then verify, in two phases, because both halves have been seen to fail.
 *
 * Pre-send policy for a prompt that already holds text is append-and-submit (deliberate:
 * two messages deliver as one). The refusal-on-draft policy lives in `tejun-send`, which
 * is what agents use; this is the house's own path.
 */
export async function sendText(
  name: string,
  text: string,
): Promise<{ resent: boolean; started: boolean }> {
  const type = () => pexec('tmux', ['send-keys', '-t', exactPane(name), '-l', '--', text]);
  const enter = () => pexec('tmux', ['send-keys', '-t', exactPane(name), 'Enter']);

  // CHECK BEFORE TYPING, not after. A dialog is open: do not type, do not press Enter,
  // do not "try once" — the owner is being asked something, keystrokes are menu choices,
  // and an Enter here answers it for them.
  if ((await readPrompt(name)).menu) return { resent: false, started: false };

  await type();
  await sleep(200);
  const beforeEnter = await paneScreen(name);
  let seen = await readPrompt(name);

  // No prompt we can read: nothing below is checkable, so do the one honest thing — press
  // Enter once and report whether the pane reacted at all. Weaker, and it must never be
  // the confident answer.
  if (!seen.found) {
    await enter();
    await sleep(600);
    return { resent: false, started: (await paneScreen(name)) !== beforeEnter };
  }

  // PHASE ONE — DID THE TEXT ARRIVE? Re-type until it is visibly there. This needs no
  // guess about when the CLI started accepting input, which is the whole reason it beats
  // tuning a timeout.
  for (let i = 0; i < 3 && seen.text === null && !seen.menu; i++) {
    await type();
    await sleep(500);
    seen = await readPrompt(name);
  }
  if (seen.menu) return { resent: false, started: false };
  // Still nothing after re-typing: something is eating input (a dialog, a CLI mid-start).
  // Do NOT press Enter into that — report the failure and let the caller say so.
  if (seen.found && seen.text === null) return { resent: true, started: false };

  // PHASE TWO — DID IT SUBMIT? By the prompt, never by a screen diff.
  await enter();
  await sleep(600);
  let resent = false;
  for (let i = 0; i < 2; i++) {
    const now = await readPrompt(name);
    if (now.menu) break; // a dialog opened under us — stop, never Enter into one
    if (!now.found || now.text === null) return { resent, started: true };
    // Text CHANGED means someone else owns the prompt now — a dialog opened, or the owner
    // started typing — and pressing Enter into that answers somebody else's question for
    // them. Only the same text still sitting there means our Enter was lost.
    if (now.text !== seen.text) break;
    await enter();
    resent = true;
    await sleep(900);
  }
  const final = await readPrompt(name);
  return { resent, started: !final.menu && (!final.found || final.text === null) };
}

/** Run a shell command in a session's active pane (the launcher's boot step). */
export async function runCommand(name: string, cmd: string): Promise<void> {
  await pexec('tmux', ['send-keys', '-t', exactPane(name), '-l', '--', cmd]);
  await pexec('tmux', ['send-keys', '-t', exactPane(name), 'Enter']);
}
