import { createHash } from 'node:crypto';
import path from 'node:path';
import { config } from './machine-settings.js';
import { exactPane, exactSession, killSession } from './tmux.js';
import { TMUX_CONTROL_HOLDER, tmux } from './tmux-client.js';

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

export async function paneInMode(name: string): Promise<boolean> {
  try {
    return (await tmux.run(['display-message', '-p', '-t', exactPane(name), '#{pane_in_mode}'])).trim() === '1';
  } catch {
    return false;
  }
}

export function tileInputAllowed(inMode: boolean, data: string): boolean {
  if (!inMode) return true;
  // Cancel plus navigation remain usable. Printable input is deliberately quiet so a
  // tile cannot invoke the adopted server's copy-mode bindings (which remain untouched).
  if (data === '\x1b') return true;
  return /^(?:\x1b\[(?:A|B|C|D|5~|6~)|\x1b\[<6[45];\d+;\d+[Mm])$/.test(data);
}

let viewerCounter = 0;
export const VIEWER_OPT = '@ronin-viewer';
export const viewerOwner = (env: NodeJS.ProcessEnv = process.env): string =>
  createHash('sha256').update(path.resolve(env.RONIN_USER_ROOT || `${env.HOME || ''}/ronin`)).digest('hex').slice(0, 16);

export async function createViewer(target: string, tag: string): Promise<string> {
  const safe = target.replace(/[^A-Za-z0-9_-]/g, '');
  const viewer = `${config.viewerPrefix}${safe}_${tag}_${++viewerCounter}`;
  await tmux.run(['new-session', '-d', '-s', viewer, '-t', exactSession(target)]);
  await tmux.run(['set-option', '-t', exactSession(viewer), VIEWER_OPT, viewerOwner()]);
  await tmux.run(['set-option', '-t', exactPane(viewer), 'window-size', config.windowSize]).catch(() => {});
  await tmux.run(['set-option', '-t', exactPane(viewer), 'destroy-unattached', 'off']).catch(() => {});
  await tmux.run(['set-option', '-t', exactPane(viewer), 'mouse', config.mouse]).catch(() => {});
  await tmux.run(['set-option', '-t', exactPane(viewer), 'status', 'off']).catch(() => {});
  return viewer;
}

export async function cleanupViewers(): Promise<number> {
  let stdout = '';
  try {
    stdout = await tmux.run(['list-sessions', '-F', `#{session_name}\t#{${VIEWER_OPT}}`]);
  } catch {
    return 0;
  }
  const owner = viewerOwner();
  const stale = stdout.split('\n').map((line) => line.split('\t')).filter(([name, mark]) => isStaleViewerSession(name, mark, owner)).map(([name]) => name);
  for (const n of stale) await killSession(n);
  return stale.length;
}

export const isStaleViewerSession = (name: string, mark = '', owner = viewerOwner()): boolean =>
  name !== TMUX_CONTROL_HOLDER && name.startsWith(config.viewerPrefix) && mark === owner;
