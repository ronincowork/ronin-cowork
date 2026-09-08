import { randomBytes } from 'node:crypto';
import { type WebSocket } from 'ws';
import pty from '@lydell/node-pty';
import {
  capturePane,
  createViewer,
  deliverParcel,
  exactSession,
  isValidName,
  applyTileInput,
  jumpToBottom,
  killSession,
  paneMouseState,
  sessionExists,
  tileInputAction,
} from '../tmux.js';
import { getStreamHandler } from '../sockets.js';
import { DeviceAttributesResponder } from '../terminal-protocol.js';

const HEARTBEAT_MS = 30_000;

export const isTerminalReply = (msg: { t?: string; d?: string }): msg is { t: 'p'; d: string } =>
  msg.t === 'p' && typeof msg.d === 'string';

/** A composer parcel: a whole message with its Enter, sent by a person from the tile's own
 *  box. It rides the same authenticated socket as a keystroke and is answered by id. */
export const isParcel = (msg: { t?: string; d?: string; id?: string }): msg is { t: 'm'; d: string; id: string } =>
  msg.t === 'm' && typeof msg.d === 'string' && typeof msg.id === 'string' && msg.id.length > 0 && msg.id.length <= 64;

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
    const h = getStreamHandler();
    if (!h) {
      ws.send(JSON.stringify({ t: 'error', m: 'The unlocked view is off — no record service is installed.' }));
      ws.close();
      return;
    }
    return (h as (w: unknown, u: unknown, s: unknown) => void)(ws, url, session);
  }

  const viewer = await createViewer(session, randomBytes(3).toString('hex'));

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
  let inputQueue = Promise.resolve();
  let beat: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (beat) clearInterval(beat);
    try {
      term.kill();
    } catch {
    }
    void killSession(viewer);
  };

  const deviceAttributes = new DeviceAttributesResponder((reply) => term.write(reply));
  term.onData((d) => {
    deviceAttributes.feed(d);
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
    let msg: { t?: string; d?: string; id?: string; c?: number; r?: number; n?: number };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (isTerminalReply(msg)) {
      // xterm generated this for its PTY peer (DA/DSR/window reports). It must answer
      // the attached terminal directly, never wait behind or enter person-input routing.
      term.write(msg.d);
    } else if (isParcel(msg)) {
      // A composer message. Same ordered queue as typing, so it lands after the keys that
      // preceded it; unlike a keystroke it leaves a scrolled-back view first, because the
      // box under the tile is Ronin's own dialog and on a phone the only way to type. The
      // answer is what the composer clears on: ok after the bytes reached the terminal, or
      // the reason they did not. No hold is added here — the owner's send rulings stand.
      const { id, d } = msg;
      const answer = (outcome: { ok: boolean; why?: string }) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'm', id, ...outcome }));
      };
      inputQueue = inputQueue.then(async () => {
        if (closed) { answer({ ok: false, why: 'the terminal is gone' }); return; }
        answer(await deliverParcel(viewer, d, (data) => term.write(data)));
      }).catch((e) => answer({ ok: false, why: String((e as Error)?.message ?? e) }));
    } else if (msg.t === 'i' && typeof msg.d === 'string') {
      const data = msg.d;
      // One tmux round trip per message, in order: the shared pane's mode decides whether
      // this is typing, a scroll the tile drives itself, or noise to keep out of copy mode.
      inputQueue = inputQueue.then(async () => {
        const action = tileInputAction(await paneMouseState(viewer), data);
        await applyTileInput(viewer, action, (d) => term.write(d), data);
      }).catch(() => {});
    } else if (msg.t === 'r') {
      cols = clampDim(msg.c, cols);
      rows = clampDim(msg.r, rows);
      try {
        term.resize(cols, rows);
      } catch {
      }
    } else if (msg.t === 'bottom') {
      void jumpToBottom(viewer);
    } else if (msg.t === 'hist') {
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

  let alive = true;
  ws.on('pong', () => {
    alive = true;
  });
  beat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      cleanup();
      return;
    }
    alive = false;
    try {
      ws.ping();
    } catch {
    }
  }, HEARTBEAT_MS);
}

function clampDim(v: string | number | null | undefined, fallback: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? Math.floor(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(500, Math.max(2, n));
}
