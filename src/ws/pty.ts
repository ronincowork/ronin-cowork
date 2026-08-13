/**
 * Bridge one browser tile <-> tmux over a websocket — FAUCET A, the attach mirror.
 *
 * The tile mirrors a grouped-viewer `tmux attach` pty: tmux paints a fixed screen and
 * the scrollback stays server-side (copy-mode is a Faucet A painting, so scrolling
 * round-trips). This is Locked, it works, and RIREKI does not touch it.
 *
 * Unlocked is handled by handleTapeTile instead: it reads the tape and never touches
 * tmux at all. The old `stream` mode that claimed Faucet B for itself is gone — the
 * recorder owns that faucet now, and two claimants would silently evict each other.
 */
import { randomBytes } from 'node:crypto';
import { type WebSocket } from 'ws';
import pty from '@lydell/node-pty';
import {
  capturePane,
  createViewer,
  exactSession,
  isValidName,
  jumpToBottom,
  killSession,
  sessionExists,
} from '../tmux.js';
import { getStreamHandler } from '../sockets.js';

export async function handlePty(ws: WebSocket, url: URL): Promise<void> {
  const session = url.searchParams.get('session') ?? '';
  const tape = url.searchParams.get('mode') === 'stream';
  let cols = clampDim(url.searchParams.get('cols'), 80);
  let rows = clampDim(url.searchParams.get('rows'), 24);

  if (!isValidName(session) || !(await sessionExists(session))) {
    ws.send(JSON.stringify({ t: 'error', m: `No such session: ${session}` }));
    ws.close();
    return;
  }

  if (tape) {
    // The stream (🔓 tape) handler is rireki's, plugged in via the connector. Absent
    // service = the unlocked view is off; say so and let the client fall back to 🔒.
    const h = getStreamHandler();
    if (!h) {
      ws.send(JSON.stringify({ t: 'error', message: 'The unlocked view is off — no record service is installed.' }));
      ws.close();
      return;
    }
    return (h as (w: unknown, u: unknown, s: unknown) => void)(ws, url, session);
  }

  const viewer = await createViewer(session, randomBytes(3).toString('hex'));

  // Don't leak the host tmux context into the child, or `tmux attach` complains
  // about nesting and may misbehave.
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.TMUX;
  delete env.TMUX_PANE;

  const term = pty.spawn('tmux', ['attach', '-t', exactSession(viewer)], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.HOME,
    env,
  });

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    try {
      term.kill();
    } catch {
      /* already dead */
    }
    void killSession(viewer);
  };

  term.onData((d) => {
    if (ws.readyState === ws.OPEN) ws.send(Buffer.from(d, 'utf8'));
  });
  term.onExit(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ t: 'exit' }));
      ws.close();
    }
    cleanup();
  });

  ws.send(JSON.stringify({ t: 'ready', session, viewer }));

  ws.on('message', (raw: Buffer, isBinary: boolean) => {
    if (isBinary) {
      term.write(raw.toString('utf8'));
      return;
    }
    let msg: { t?: string; d?: string; c?: number; r?: number; n?: number };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.t === 'i' && typeof msg.d === 'string') {
      term.write(msg.d);
    } else if (msg.t === 'r') {
      cols = clampDim(msg.c, cols);
      rows = clampDim(msg.r, rows);
      try {
        term.resize(cols, rows);
      } catch {
        /* race on close */
      }
    } else if (msg.t === 'bottom') {
      // Jump to the live bottom by exiting copy mode (deep scrollback defeats wheel bursts).
      void jumpToBottom(viewer);
    } else if (msg.t === 'hist') {
      // Float mode: one-shot scrollback fetch — the browser scrolls the text natively
      // instead of round-tripping wheel events through tmux copy-mode.
      const n = Math.min(10000, Math.max(100, Number(msg.n) || 2000));
      capturePane(viewer, n)
        .then((text) => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'hist', d: text }));
        })
        .catch(() => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'hist', d: '' }));
        });
    }
  });

  ws.on('close', cleanup);
  ws.on('error', cleanup);
}

function clampDim(v: string | number | null | undefined, fallback: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? Math.floor(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(500, Math.max(2, n));
}
