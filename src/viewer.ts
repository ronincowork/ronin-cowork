import { config } from './machine-settings.js';
import { exactPane, exactSession, killSession } from './tmux.js';
import { tmux } from './tmux-client.js';

export async function jumpToBottom(name: string): Promise<void> {
  await tmux.run(['send-keys', '-t', exactPane(name), '-X', 'cancel']).catch(() => {});
}

export async function capturePane(name: string, lines: number, esc = false): Promise<string> {
  const args = ['capture-pane', '-p', '-t', exactPane(name), '-S', String(-Math.abs(lines))];
  if (esc) args.push('-e');
  const stdout = await tmux.run(args);
  return stdout;
}

export async function sendRawKeys(session: string, data: string): Promise<void> {
  if (!data) return;
  await tmux.run(['send-keys', '-t', exactPane(session), '-l', '--', data]);
}

let viewerCounter = 0;

export async function createViewer(target: string, tag: string): Promise<string> {
  const safe = target.replace(/[^A-Za-z0-9_-]/g, '');
  const viewer = `${config.viewerPrefix}${safe}_${tag}_${++viewerCounter}`;
  await tmux.run(['new-session', '-d', '-s', viewer, '-t', exactSession(target)]);
  await tmux.run(['set-option', '-t', exactPane(viewer), 'window-size', config.windowSize]).catch(() => {});
  await tmux.run(['set-option', '-t', exactPane(viewer), 'destroy-unattached', 'off']).catch(() => {});
  await tmux.run(['set-option', '-t', exactPane(viewer), 'mouse', config.mouse]).catch(() => {});
  await tmux.run(['set-option', '-t', exactPane(viewer), 'status', 'off']).catch(() => {});
  return viewer;
}

export async function cleanupViewers(): Promise<number> {
  let stdout = '';
  try {
    stdout = await tmux.run(['list-sessions', '-F', '#{session_name}']);
  } catch {
    return 0;
  }
  const stale = stdout.split('\n').filter((n) => n.startsWith(config.viewerPrefix));
  for (const n of stale) await killSession(n);
  return stale.length;
}
