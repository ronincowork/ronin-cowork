import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './machine-settings.js';
import { exactPane, exactSession, killSession } from './tmux.js';

const pexec = promisify(execFile);

export async function jumpToBottom(name: string): Promise<void> {
  await pexec('tmux', ['send-keys', '-t', exactPane(name), '-X', 'cancel']).catch(() => {});
}

export async function capturePane(name: string, lines: number, esc = false): Promise<string> {
  const args = ['capture-pane', '-p', '-t', exactPane(name), '-S', String(-Math.abs(lines))];
  if (esc) args.push('-e');
  const { stdout } = await pexec('tmux', args, { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

export async function sendRawKeys(session: string, data: string): Promise<void> {
  if (!data) return;
  await pexec('tmux', ['send-keys', '-t', exactPane(session), '-l', '--', data]);
}

let viewerCounter = 0;

export async function createViewer(target: string, tag: string): Promise<string> {
  const safe = target.replace(/[^A-Za-z0-9_-]/g, '');
  const viewer = `${config.viewerPrefix}${safe}_${tag}_${++viewerCounter}`;
  await pexec('tmux', ['new-session', '-d', '-s', viewer, '-t', exactSession(target)]);
  await pexec('tmux', ['set-option', '-t', exactPane(viewer), 'window-size', config.windowSize]).catch(() => {});
  await pexec('tmux', ['set-option', '-t', exactPane(viewer), 'destroy-unattached', 'off']).catch(() => {});
  await pexec('tmux', ['set-option', '-t', exactPane(viewer), 'mouse', config.mouse]).catch(() => {});
  await pexec('tmux', ['set-option', '-t', exactPane(viewer), 'status', 'off']).catch(() => {});
  return viewer;
}

export async function cleanupViewers(): Promise<number> {
  let stdout = '';
  try {
    ({ stdout } = await pexec('tmux', ['list-sessions', '-F', '#{session_name}']));
  } catch {
    return 0;
  }
  const stale = stdout.split('\n').filter((n) => n.startsWith(config.viewerPrefix));
  for (const n of stale) await killSession(n);
  return stale.length;
}
