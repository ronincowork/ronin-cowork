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

/**
 * How often a tile socket must prove its peer is still there. One missed interval ends
 * it — see the heartbeat at the foot of handlePty for why that is the safe direction.
 */
const HEARTBEAT_MS = 30_000;

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
      ws.send(JSON.stringify({ t: 'error', m: 'The unlocked view is off — no record service is installed.' }));
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
  // Declared before cleanup and armed after the handlers: the two refer to each other.
  let beat: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (beat) clearInterval(beat);
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

  /**
   * THE HEARTBEAT — the only thing that tells a live tile socket from a dead one.
   *
   * `cleanup` is what reaps this socket's viewer, and 'close' is what drives it. A rude
   * disconnect never sends one: a closed lid, a backgrounded phone, a walk out of wifi
   * range or a NAT table quietly forgetting the flow all leave the server holding a
   * half-open socket with no error and no close event. The BROWSER notices every one of
   * those and reconnects two seconds later (public/js/tilewire.js) — and a reconnect is a
   * new socket, so it gets a new viewer. Without a heartbeat the pane collects one more
   * `grid_*` name per rude disconnect, and nothing sweeps them until Ronin restarts:
   * cleanupViewers() runs at boot and at shutdown and never in between. On a phone, which
   * is mid-reconnect all the time, that is the normal case rather than the exception.
   *
   * Terminating a connection that was merely slow costs nothing, which is why one missed
   * interval is enough: the client reconnects on its own, and a tile that reconnects is
   * the ordinary case this file is already written around. Leaving a dead one costs a
   * viewer that outlives every browser that could have closed it.
   */
  let alive = true;
  ws.on('pong', () => {
    alive = true;
  });
  beat = setInterval(() => {
    if (!alive) {
      // No 'close' is coming from a peer that is not there; make one, then reap directly
      // in case terminate's own close is not delivered. cleanup is idempotent.
      ws.terminate();
      cleanup();
      return;
    }
    alive = false;
    try {
      ws.ping();
    } catch {
      /* closing under us — the next tick terminates */
    }
  }, HEARTBEAT_MS);
}

function clampDim(v: string | number | null | undefined, fallback: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? Math.floor(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(500, Math.max(2, n));
}
