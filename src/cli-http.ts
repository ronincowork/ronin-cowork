import 'dotenv/config';
import http from 'node:http';
import { operatorSocketPath, socketRefusal } from './operator-socket.js';

export interface CliReply { stdout: string; stderr: string; exit: number }

/** Where a command goes. `RONIN_URL` is the explicit development/test target over HTTP,
 *  with `RONIN_CLI_TOKEN` as its credential; otherwise the operator's own socket, whose
 *  file mode is the credential and whose path a newborn was told at birth. */
export type OperatorTarget =
  | { kind: 'url'; url: string; token: string }
  | { kind: 'socket'; path: string };

export function operatorTarget(env: NodeJS.ProcessEnv = process.env): OperatorTarget {
  const override = env.RONIN_URL?.trim();
  if (override) return { kind: 'url', url: override.endsWith('/') ? override : `${override}/`, token: env.RONIN_CLI_TOKEN?.trim() ?? '' };
  return { kind: 'socket', path: operatorSocketPath(env) };
}

type Raw = { status: number; body: string };

function overSocket(socketPath: string, route: string, payload: string): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path: route, method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', (e: NodeJS.ErrnoException) => reject(new Error(socketRefusal(e.code, socketPath))));
    req.end(payload);
  });
}

async function overHttp(target: { url: string; token: string }, route: string, payload: string): Promise<Raw> {
  const basic = process.env.GRID_USER && process.env.GRID_PASS
    ? `Basic ${Buffer.from(`${process.env.GRID_USER}:${process.env.GRID_PASS}`).toString('base64')}` : '';
  const res = await fetch(new URL(route.replace(/^\//, ''), target.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(target.token ? { authorization: `Bearer ${target.token}` } : basic ? { authorization: basic } : {}) },
    body: payload,
  });
  return { status: res.status, body: await res.text() };
}

export async function cliRequest(tool: string, args = process.argv.slice(2), input?: string): Promise<CliReply> {
  const target = operatorTarget();
  const payload = JSON.stringify({ args, input, session: process.env.RONIN_SESSION ?? '', pane: process.env.TMUX_PANE ?? '' });
  const route = `/api/cli/${tool}`;
  const raw = target.kind === 'socket' ? await overSocket(target.path, route, payload) : await overHttp(target, route, payload);
  let body: CliReply & { error?: string };
  try { body = JSON.parse(raw.body) as CliReply & { error?: string }; } catch { body = { stdout: '', stderr: '', exit: 1, error: `HTTP ${raw.status}` }; }
  if (raw.status < 200 || raw.status >= 300) throw new Error(body.error || `HTTP ${raw.status}`);
  return body;
}

export async function runCli(tool: string, args = process.argv.slice(2), input?: string): Promise<void> {
  try {
    const reply = await cliRequest(tool, args, input);
    if (reply.stdout) process.stdout.write(reply.stdout);
    if (reply.stderr) process.stderr.write(reply.stderr);
    process.exitCode = reply.exit;
  } catch (e) {
    console.error(`REFUSED: ${(e as Error).message}`);
    process.exitCode = 4;
  }
}
