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

/** Copy mode is pane state shared with the target session (a viewer is a grouped session),
 *  and key tables are server-wide. The tile therefore drives copy mode with explicit commands
 *  aimed at its pane and never through the root or copy-mode key tables, so an adopted
 *  server's bindings stay untouched and unused. */
export interface PaneMouseState {
  inMode: boolean;
  appWantsMouse: boolean;
}

export async function paneMouseState(name: string): Promise<PaneMouseState> {
  try {
    const out = await tmux.run(['display-message', '-p', '-t', exactPane(name), '#{pane_in_mode} #{alternate_on} #{mouse_any_flag}']);
    const [inMode, alternate, mouse] = out.trim().split(' ');
    return { inMode: inMode === '1', appWantsMouse: alternate === '1' || mouse === '1' };
  } catch {
    return { inMode: false, appWantsMouse: false };
  }
}

export type TileInputAction = 'write' | 'drop' | 'enter-scroll-up' | 'scroll-up' | 'scroll-down' | 'cancel';

const WHEEL = /^\x1b\[<(6[45]);\d+;\d+M$/;
const NAVIGATION = /^\x1b\[(?:A|B|C|D|5~|6~)$/;

/** What the tile does with one input message, given the shared pane's state. Pure. */
export function tileInputAction(state: PaneMouseState, data: string): TileInputAction {
  const wheel = WHEEL.exec(data);
  if (wheel) {
    const up = wheel[1] === '64';
    if (state.inMode) return up ? 'scroll-up' : 'scroll-down';
    if (state.appWantsMouse) return 'write'; // the program asked for the mouse: it scrolls itself
    return up ? 'enter-scroll-up' : 'write';
  }
  if (!state.inMode) return 'write';
  // Scrolled up: Escape leaves, the navigation keys move, and everything else is quiet so
  // a tile cannot invoke the server owner's copy-mode bindings (jump, search, goto…).
  if (data === '\x1b') return 'cancel';
  return NAVIGATION.test(data) ? 'write' : 'drop';
}

let hideIndicator = true; // copy-mode -H: absent on servers older than the floor; learned once
export async function enterCopyMode(name: string): Promise<void> {
  const pane = exactPane(name);
  if (hideIndicator) {
    try {
      await tmux.run(['copy-mode', '-eH', '-t', pane]);
      return;
    } catch {
      hideIndicator = false;
    }
  }
  await tmux.run(['copy-mode', '-e', '-t', pane]);
}

export const WHEEL_LINES = 5; // what tmux's own WheelUpPane binding scrolls per notch
export async function scrollCopyMode(name: string, direction: 'up' | 'down'): Promise<void> {
  await tmux.run(['send-keys', '-t', exactPane(name), '-X', '-N', String(WHEEL_LINES), `scroll-${direction}`]);
}

export async function applyTileInput(name: string, action: TileInputAction, write: (data: string) => void, data: string): Promise<void> {
  switch (action) {
    case 'write': write(data); return;
    case 'drop': return;
    case 'cancel': await jumpToBottom(name); return;
    case 'enter-scroll-up': await enterCopyMode(name); await scrollCopyMode(name, 'up'); return;
    case 'scroll-up': await scrollCopyMode(name, 'up'); return;
    case 'scroll-down': await scrollCopyMode(name, 'down'); return;
  }
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
  const rows = stdout.split('\n').filter(Boolean).map((line) => line.split('\t') as [string, string?]);
  const stale = rows.filter(([name, mark]) => isStaleViewerSession(name, mark, owner)).map(([name]) => name);
  // A viewer-looking name without this installation's mark is not ours to kill: a stranger's
  // session, another install's viewer, or a viewer from a release that predates the mark.
  // Those last ones never leave on their own (destroy-unattached off), so say they are there.
  const kept = rows.filter(([name, mark]) => name !== TMUX_CONTROL_HOLDER && name.startsWith(config.viewerPrefix) && !isStaleViewerSession(name, mark, owner)).map(([name]) => name);
  if (kept.length) console.log(`[tmux-ronin] left ${kept.length} unowned ${config.viewerPrefix}* session(s) alone: ${kept.join(' ')}`);
  for (const n of stale) await killSession(n);
  return stale.length;
}

export const isStaleViewerSession = (name: string, mark = '', owner = viewerOwner()): boolean =>
  name !== TMUX_CONTROL_HOLDER && name.startsWith(config.viewerPrefix) && mark === owner;
