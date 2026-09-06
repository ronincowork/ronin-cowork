/** The operator's own door: a Unix socket in the data root.
 *
 *  Agent tools find the running Ronin the way every shell finds its tmux server and every
 *  client finds its ssh-agent — at an agreed path, held by the kernel. The path is the
 *  address; a connection is the liveness check (refused when nobody listens); the file
 *  mode is the credential (whoever can open it is the user); and only one process can
 *  bind it, so a second Ronin is refused instead of allowed to overwrite. Nothing here
 *  depends on tmux, survives a tmux server replacement by construction, and is readable
 *  by a tool with no session at all.
 *
 *  Before this the address rode on a tmux server option (`@ronin-operator`, retired
 *  2026-09-05 — wip/buildouts/RONIN_ADDRESS.md in ronin-lab): memory of a server that
 *  could be replaced under the operator, written by any process of this user, and erased
 *  on exit by every process that ever ran the entry point, dev runs included. Five
 *  outages wore one sentence. The socket has none of those seams.
 */
import fs from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { rootDir } from './resources.js';

/** The environment word a newborn carries: where the operator that launched it answers. */
export const OPERATOR_SOCKET_ENV = 'RONIN_SOCKET';

/** Where the live operator's socket is. `RONIN_SOCKET` (set at birth) wins; otherwise
 *  `<data root>/run/ronin.sock`, found by the same rule as every other Ronin store, so a
 *  cron job, a launchd job and a bare SSH shell all name one place. */
export function operatorSocketPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[OPERATOR_SOCKET_ENV]?.trim();
  if (override) return override;
  return path.join(rootDir('data', env), 'run', 'ronin.sock');
}

export type SocketProbe = 'absent' | 'stale' | 'live';

/** What is at the path: nothing, a file nobody listens on, or a listening operator. */
export function probeOperatorSocket(socketPath: string): Promise<SocketProbe> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath);
    socket.once('connect', () => { socket.destroy(); resolve('live'); });
    socket.once('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return resolve('absent');
      if (e.code === 'ECONNREFUSED' || e.code === 'ENOTSOCK') return resolve('stale');
      reject(e);
    });
  });
}

/** The two refusals a reader can give, one sentence each, so "never started" and
 *  "stopped" stop wearing the same words. Shared by the TypeScript client; `ronin-url`
 *  says the same two things in shell. */
export function socketRefusal(code: string | undefined, socketPath: string): string {
  if (code === 'ENOENT') {
    return `no Ronin has started on this box (no socket at ${socketPath}).\nStart Ronin, or set RONIN_URL for a development/test target.`;
  }
  return `Ronin is not running (socket at ${socketPath}, nobody listening).\njournalctl --user -u ronin.service -n 50 says why; start it with: systemctl --user start ronin`;
}

/** Thrown by `bindOperatorSocket` when a listening Ronin already owns the path. */
export class SiblingAlive extends Error {
  constructor(readonly socketPath: string, readonly identity: string) {
    super(`another Ronin is already answering at ${socketPath} (${identity})`);
    this.name = 'SiblingAlive';
  }
}

async function identityOver(socketPath: string): Promise<string> {
  return new Promise((resolve) => {
    const req = http.request({ socketPath, path: '/api/version', method: 'GET', timeout: 2_000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const v = JSON.parse(body) as { commit?: string; startedAt?: string; release?: string | null };
          resolve(`commit ${v.commit ?? '?'}${v.release ? `, release ${v.release}` : ''}, started ${v.startedAt ?? '?'}`);
        } catch { resolve('identity unreadable'); }
      });
    });
    req.on('error', () => resolve('identity unreadable'));
    req.on('timeout', () => { req.destroy(); resolve('identity unreadable'); });
    req.end();
  });
}

const peers = new WeakSet<IncomingMessage>();
/** Whether this request arrived over the operator socket. A peer on a 0600 socket in a
 *  0700 directory is the user, so no bearer is asked of it. HTTP callers keep theirs. */
export const isOperatorPeer = (req: IncomingMessage): boolean => peers.has(req);

export interface BoundOperatorSocket {
  path: string;
  /** Remove the socket this process bound — only ever its own. */
  close(): Promise<void>;
}

let bound: string | undefined;
/** The path this process is answering on, or undefined when it bound none — a dev run,
 *  a test runner. The launch route hands it to newborns; a process that did not bind
 *  tells them nothing, and their tools use the default path. */
export const boundOperatorSocket = (): string | undefined => bound;

/** Bind the operator socket for `handler`, connect-before-unlink:
 *  - nothing at the path → bind;
 *  - a file nobody listens on → unlink it, then bind;
 *  - a listening Ronin → `SiblingAlive`, naming what it is. The live socket is untouched.
 *  The directory is 0700 and the socket 0600: the mode is the credential. */
export async function bindOperatorSocket(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  socketPath: string = operatorSocketPath(),
): Promise<BoundOperatorSocket> {
  await fs.mkdir(path.dirname(socketPath), { recursive: true, mode: 0o700 });
  const probe = await probeOperatorSocket(socketPath);
  if (probe === 'live') throw new SiblingAlive(socketPath, await identityOver(socketPath));
  if (probe === 'stale') await fs.unlink(socketPath);
  const server = http.createServer((req, res) => { peers.add(req); handler(req, res); });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => { server.off('error', reject); resolve(); });
  });
  await fs.chmod(socketPath, 0o600);
  bound = socketPath;
  return {
    path: socketPath,
    close: async () => {
      if (bound !== socketPath) return;
      bound = undefined;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await fs.unlink(socketPath).catch(() => {});
    },
  };
}
