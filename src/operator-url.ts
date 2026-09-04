import { tmux } from './tmux-client.js';
export const OPERATOR_CONNECTION_OPT = '@ronin-operator';

export interface OperatorConnection {
  version: 1;
  url: string;
  token: string;
  instance: string;
}

/** What this process last put on the bus, so it can be put back verbatim. */
let published: string | undefined;

async function write(encoded: string): Promise<void> {
  await tmux.run(['set-option', '-s', OPERATOR_CONNECTION_OPT, encoded]);
  const stdout = await tmux.run(['show-option', '-s', '-qv', OPERATOR_CONNECTION_OPT]);
  if (stdout.replace(/\n$/, '') !== encoded) {
    throw new Error(`tmux ${OPERATOR_CONNECTION_OPT} read-back mismatch`);
  }
}

export async function publishRoninUrl(url: string, cliToken?: string): Promise<void> {
  const connection: OperatorConnection = {
    version: 1,
    url,
    token: cliToken ?? '',
    instance: `${process.pid}:${Date.now()}`,
  };
  const encoded = JSON.stringify(connection);
  await write(encoded);
  published = encoded;
}

/** Put the last published address back, unchanged.
 *
 *  A server option is memory of the tmux server that held it. When that server dies
 *  under a running operator and the client reconnects onto its replacement
 *  (src/tmux-client.ts, `onReconnect`), the option is simply absent there — while this
 *  process is still listening at the same url. Every agent tool then refuses with
 *  "Ronin may not be running" against an HTTP 200 (2026-09-04, 13:56). Same url, token
 *  and instance: nothing about the operator changed, only the bus. A no-op before the
 *  first publish and after `clearRoninUrl`. */
export async function republishRoninUrl(): Promise<void> {
  if (published === undefined) return;
  await write(published);
}

/** Take the address down on the way out.
 *
 *  The option lives on the TMUX SERVER, which is a separate unit that deliberately
 *  outlives this process (deploy/tmux-server.service). Left behind, it keeps telling every
 *  agent tool that Ronin is at an address nothing is listening on — and they get a
 *  connection refused instead of the plain "Ronin may not be running" that ronin-url
 *  already knows how to say. */
export async function clearRoninUrl(): Promise<void> {
  published = undefined;
  await tmux.run(['set-option', '-s', '-u', OPERATOR_CONNECTION_OPT]);
}

/** Whether the operator that published this connection is still running.
 *
 *  `instance` is `<pid>:<started>`. A pid on this box can be checked for free, which is
 *  the point: no network call, nothing that can hang. Unknown beats wrong — an instance
 *  we cannot parse (an older operator published it) is reported alive rather than
 *  refused, and a recycled pid is the one false positive, which leaves the caller no
 *  worse off than before this check existed. */
export function instanceIsAlive(instance: string): boolean {
  const pid = Number(/^(\d+):/.exec(instance ?? '')?.[1]);
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
