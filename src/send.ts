import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { exactPane } from './tmux.js';
import { classifyStatus } from './status.js';

const pexec = promisify(execFile);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface PromptRead {
  found: boolean;
  text: string | null;
  menu: boolean;
}

export function parsePrompt(raw: string): PromptRead {
  const cannotTell: PromptRead = { found: false, text: null, menu: false };
  if (classifyStatus(raw) === 'thinking') return cannotTell;
  const lines = raw.split('\n');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const line = lines
    .slice(-15)
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

const SGR = /\x1b\[[0-9;]*m/g;
const squash = (s: string): string => s.replace(SGR, '').replace(/\s+/g, '');
const FINGERPRINT = 48;
export const fingerprintOf = (text: string): string => squash(text).slice(-FINGERPRINT);

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

export async function deliverSafe(name: string, text: string, onAttempt?: () => void, io: PaneIO = paneIO(name)): Promise<DeliveryResult> {
  let raw = await io.read();
  const before = parsePrompt(raw);
  let typedText: string | null;
  let unseen = false;
  if (draftAtPrompt(raw, text)) {
    typedText = before.text;
  } else {
    if (before.menu) return { delivered: false, submitted: false, reason: 'dialog is open' };
    if (before.text) return { delivered: false, submitted: false, reason: 'unsubmitted text is already at the prompt' };
    onAttempt?.();
    await io.type(text);
    await io.wait(350);
    raw = await io.read();
    const typed = parsePrompt(raw);
    if (typed.menu) return { delivered: false, submitted: false, reason: 'dialog opened before submit' };
    typedText = typed.text;
    unseen = !typed.text && !squash(raw).includes(fingerprintOf(text));
  }
  await io.enter();
  for (let i = 0; i < 3; i++) {
    await io.wait(700);
    raw = await io.read();
    const now = parsePrompt(raw);
    if (now.menu) return { delivered: false, submitted: true, reason: 'dialog opened while submitting' };
    const pending = draftAtPrompt(raw, text) || (typedText !== null && now.text === typedText);
    if (!pending) {
      if (unseen && !squash(raw).includes(fingerprintOf(text))) return { delivered: false, submitted: true, reason: 'the text never appeared in the pane' };
      if (!now.found || now.text === null) return { delivered: true, submitted: true, reason: 'delivered' };
      return { delivered: false, submitted: true, reason: 'The prompt changed before delivery could be confirmed. Automatic retries stopped to avoid sending a duplicate.' };
    }
    await io.enter();
  }
  return { delivered: false, submitted: true, reason: 'text remains at the prompt after Enter retries' };
}

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

export async function sendText(
  name: string,
  text: string,
): Promise<{ resent: boolean; started: boolean }> {
  const result = await deliverSafe(name, text);
  return { resent: result.submitted && !result.delivered, started: result.delivered };
}

export async function runCommand(name: string, cmd: string): Promise<void> {
  await pexec('tmux', ['send-keys', '-t', exactPane(name), '-l', '--', cmd]);
  await pexec('tmux', ['send-keys', '-t', exactPane(name), 'Enter']);
}
