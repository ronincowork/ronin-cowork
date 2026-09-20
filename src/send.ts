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
  const line = lines
    .filter((l) => /[❯›]/.test(l))
    .pop();
  if (line === undefined) return cannotTell;
  const bare = line
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/ /g, ' ');
  if (/[❯›]\s*\d+\.\s/.test(bare)) return { found: true, text: null, menu: true };
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
/** Cancel copy mode and submit as one tmux command queue. Enter is a key action, never
 * pasted data; keeping both commands in one request leaves no viewer race between them. */
export const submitCommand = (name: string): string[] => [
  'send-keys', '-t', exactPane(name), '-X', 'cancel',
  ';',
  'send-keys', '-t', exactPane(name), 'Enter',
];
const pressEnter = (name: string) => tmux.run(submitCommand(name));
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

/** Composer sends and the two-minute override use this same text-then-Enter operation.
 * Tmux completes the bracketed paste command before the atomic cancel+Enter command. */
export async function deliverForce(name: string, text: string, io: PaneIO = paneIO(name)): Promise<DeliveryResult> {
  await io.type(text);
  await io.enter();
  return { delivered: true, submitted: true, reason: 'text and Enter sent' };
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
