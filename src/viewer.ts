/**
 * VIEWER — the grouped tmux sessions backing tiles, and the pane I/O beside them.
 *
 * A browser tile never attaches to the owner's session directly: it attaches to a
 * grouped VIEWER (`grid_*`) that shares the target's windows but has its own current
 * window and size policy, so a tile cannot hijack the window selection of another
 * client on the same session. KOTOBA: "viewer session — hidden grouped tmux session
 * backing a tile; killed on disconnect."
 *
 * Split from src/tmux.ts on 2026-08-25 when that file crossed the 700-line ceiling —
 * along the seam that was already conceptually separate: everything here serves the
 * tile transport, nothing here is about sessions as the roster knows them. tmux.ts
 * re-exports these names so the service-side importers (see its note) never notice.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';
import { exactPane, exactSession, killSession } from './tmux.js';

const pexec = promisify(execFile);

/**
 * Snap a viewer's pane to the live bottom. Wheel-scroll bursts only page partway when
 * scrollback is deep; exiting copy mode always returns the pane to the live output.
 * Harmless no-op (errors swallowed) if the pane isn't in copy mode.
 */
export async function jumpToBottom(name: string): Promise<void> {
  await pexec('tmux', ['send-keys', '-t', exactPane(name), '-X', 'cancel']).catch(() => {});
}

/**
 * Grab a pane's visible screen plus up to `lines` of scrollback. `esc` keeps
 * colors/attributes (-e) — used for stream-mode seeds; plain text serves the
 * legacy {t:'hist'} RPC and the smoke test.
 */
export async function capturePane(name: string, lines: number, esc = false): Promise<string> {
  const args = ['capture-pane', '-p', '-t', exactPane(name), '-S', String(-Math.abs(lines))];
  if (esc) args.push('-e');
  const { stdout } = await pexec('tmux', args, { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

/**
 * @service — RIREKI's stream handler types through this; nothing in cowork calls it.
 *
 * Type raw bytes into a session's active pane — the input path for a tape-fed tile.
 *
 * A tape-fed tile holds NO tmux connection: it renders from the tape and types through
 * here, so tmux never learns the viewer exists. `-l` sends the string literally, so
 * control characters and escape sequences (Enter, ^C, arrow keys) arrive as themselves.
 */
export async function sendRawKeys(session: string, data: string): Promise<void> {
  if (!data) return;
  await pexec('tmux', ['send-keys', '-t', exactPane(session), '-l', '--', data]);
}


let viewerCounter = 0;

/**
 * Create a grouped "viewer" session that shares the target's windows but has its
 * own current-window pointer and size policy. This is what a browser tile attaches
 * to, so the tile doesn't hijack the window selection of another client viewing
 * the same session. Returns the viewer session name.
 */
export async function createViewer(target: string, tag: string): Promise<string> {
  const safe = target.replace(/[^A-Za-z0-9_-]/g, '');
  const viewer = `${config.viewerPrefix}${safe}_${tag}_${++viewerCounter}`;
  // Grouped (-t target), detached (-d): shares windows with target.
  await pexec('tmux', ['new-session', '-d', '-s', viewer, '-t', exactSession(target)]);
  // Size policy + don't let tmux auto-destroy it in the brief detached window.
  await pexec('tmux', ['set-option', '-t', exactPane(viewer), 'window-size', config.windowSize]).catch(() => {});
  await pexec('tmux', ['set-option', '-t', exactPane(viewer), 'destroy-unattached', 'off']).catch(() => {});
  // Mouse on => the browser's trackpad/wheel scrolls tmux scrollback instead of
  // being translated into Up/Down arrows (history recall). Scoped to this viewer.
  await pexec('tmux', ['set-option', '-t', exactPane(viewer), 'mouse', config.mouse]).catch(() => {});
  // NO STATUS LINE IN A TILE. tmux draws one by default — a coloured bar carrying the
  // session name and a clock — and in a tile it is worse than redundant: the name it
  // shows is THIS VIEWER's (`grid_<session>_<tag>_<n>`), a throwaway of ours, not the
  // session the owner is looking at. So the one row it costs is spent telling them a
  // name that means nothing, next to a clock their OS already has, while Ronin's own
  // header carries the real name, the dial, the gauge and the ladder.
  //
  // Scoped to the viewer, which is the whole reason this is safe: `status` is a SESSION
  // option and a viewer is its own session (grouped sessions share windows, not
  // options). The owner's real session keeps its bar for anyone attaching from a
  // terminal, and their ~/.tmux.conf is not touched. The tile gains the row.
  await pexec('tmux', ['set-option', '-t', exactPane(viewer), 'status', 'off']).catch(() => {});
  return viewer;
}

/** Kill any leftover viewer sessions (e.g. from a previous crash). */
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
