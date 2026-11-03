import { randomUUID } from 'node:crypto';
import { exactPane } from './tmux.js';
import { tmux } from './tmux-client.js';

export interface PromptRead {
  found: boolean;
  text: string | null;
  menu: boolean;
}

export function parsePrompt(raw: string): PromptRead {
  const cannotTell: PromptRead = { found: false, text: null, menu: false };
  const lines = raw.split('\n');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  let at = lines.length - 1;
  while (at >= 0 && !/[❯›]/.test(lines[at])) at--;
  if (at < 0) return cannotTell;
  const line = lines[at];
  const bare = line
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/ /g, ' ');
  if (/[❯›]\s*\d+\.\s/.test(bare)) return { found: true, text: null, menu: true };
  // A dialog without numbers (Claude's trust prompt: "❯ No, exit") is known by the CLI's own
  // footer under it. Read as a draft, its Enter chose "No, exit" and ended the Agent (KAN-215).
  if (lines.slice(at + 1).some((l) => /Esc to cancel/.test(l))) return { found: true, text: null, menu: true };
  if (/\x1b\[2m/.test(line)) return { found: true, text: null, menu: false };
  const text = line
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

export interface PaneIO {
  read(): Promise<string>;
  type(text: string): Promise<void>;
  enter(): Promise<void>;
}

const pasteToPane = async (name: string, text: string, bracketed: boolean) => {
  const buffer = `ronin-message-${randomUUID()}`;
  await tmux.run(['set-buffer', '-b', buffer, '--', text]);
  try {
    await tmux.run(['paste-buffer', '-d', ...(bracketed ? ['-p'] : []), '-r', '-b', buffer, '-t', exactPane(name)]);
  } catch (error) {
    await tmux.run(['delete-buffer', '-b', buffer]).catch(() => {});
    throw error;
  }
};
const typeText = async (name: string, text: string) => {
  await tmux.run(['send-keys', '-t', exactPane(name), '-X', 'cancel']).catch(() => {});
  // Explicit paste boundaries prevent a CLI from treating Enter as pasted text.
  await pasteToPane(name, text, true);
};
/** Leave copy mode when it is active, then unconditionally submit with a real key action.
 * `-X cancel` can fail outside copy mode, so it must never gate the Enter command. */
const pressEnter = async (name: string) => {
  await tmux.run(['send-keys', '-t', exactPane(name), '-X', 'cancel']).catch(() => {});
  await tmux.run(['send-keys', '-t', exactPane(name), 'Enter']);
};
const paneIO = (name: string): PaneIO => ({
  read: () => capturePane(name),
  type: (text) => typeText(name, text).then(() => undefined),
  enter: () => pressEnter(name).then(() => undefined),
});

/** All safety decisions precede typing. Once started, every message ends with Enter. */
export async function deliverSafe(name: string, text: string, onAttempt?: () => void, io: PaneIO = paneIO(name)): Promise<DeliveryResult> {
  const before = parsePrompt(await io.read());
  if (before.menu) return { delivered: false, submitted: false, reason: 'dialog is open' };
  if (before.text) return { delivered: false, submitted: false, reason: 'unsubmitted text is already at the prompt' };
  onAttempt?.();
  return deliverForce(name, text, io);
}

/** Every delivered message gets one more Enter a second after the first (owner's rule,
 * 2026-10-24). Claude Code handles some pastes asynchronously: a long one becomes a
 * [Pasted text #N] chip, an image path an [Image #N] chip, and no rule over the text says
 * which; an Enter arriving before the chip finds an empty box and the message sits
 * unsubmitted. On a box that did submit, the second Enter is a no-op. One timer, no pane
 * read, no loop. */
export const SECOND_ENTER_DELAY_MS = 1_000;

/** Composer sends and the two-minute override use this same text-then-Enter operation.
 * Tmux completes the bracketed paste command before copy-mode cancellation and Enter. */
export async function deliverForce(name: string, text: string, io: PaneIO = paneIO(name)): Promise<DeliveryResult> {
  await io.type(text);
  await io.enter();
  await new Promise((resolve) => setTimeout(resolve, SECOND_ENTER_DELAY_MS));
  await io.enter();
  return { delivered: true, submitted: true, reason: 'text and Enter sent' };
}

/** Type text into the session's input with NO Enter: the owner finishes the line. A draft
 * already there is kept and the text lands after it; an open dialog is never typed into. */
export async function typeAtPrompt(name: string, text: string, io: PaneIO = paneIO(name)): Promise<DeliveryResult> {
  const before = parsePrompt(await io.read());
  if (before.menu) return { delivered: false, submitted: false, reason: 'dialog is open' };
  await io.type(`${before.text ? ' ' : ''}${text} `);
  return { delivered: true, submitted: false, reason: 'text typed, Enter left to the owner' };
}

async function capturePane(name: string): Promise<string> {
  return tmux.run(['capture-pane', '-p', '-e', '-t', exactPane(name)]);
}

export async function sendText(
  name: string,
  text: string,
): Promise<{ resent: boolean; started: boolean }> {
  const result = await deliverSafe(name, text);
  return { resent: result.submitted && !result.delivered, started: result.delivered };
}

export async function runCommand(name: string, cmd: string): Promise<void> {
  await tmux.run(['send-keys', '-t', exactPane(name), '-l', '--', cmd]);
  await tmux.run(['send-keys', '-t', exactPane(name), 'Enter']);
}
