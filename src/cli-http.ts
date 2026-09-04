import 'dotenv/config';
import { tmux } from './tmux-client.js';
import { OPERATOR_CONNECTION_OPT, type OperatorConnection } from './operator-url.js';

export interface CliReply { stdout: string; stderr: string; exit: number }

async function option(name: string): Promise<string> {
  try { return (await tmux.run(['show-option', '-s', '-qv', name])).trim(); }
  catch { return ''; }
}

export async function operatorConnection(): Promise<OperatorConnection> {
  const override = process.env.RONIN_URL?.trim();
  if (override) return { version: 1, url: override, token: process.env.RONIN_CLI_TOKEN?.trim() ?? '', instance: 'environment' };
  const raw = await option(OPERATOR_CONNECTION_OPT);
  let connection: Partial<OperatorConnection> = {};
  try { connection = JSON.parse(raw) as Partial<OperatorConnection>; } catch { /* refusal below */ }
  if (connection.version !== 1 || typeof connection.url !== 'string' || !connection.url.trim()) {
    throw new Error("Ronin's live operator connection could not be resolved. Ronin may not be running.\nStart Ronin, or set RONIN_URL for a development/test target.");
  }
  return { version: 1, url: connection.url.trim(), token: typeof connection.token === 'string' ? connection.token : '', instance: String(connection.instance ?? '') };
}

async function address(connection: OperatorConnection): Promise<string> {
  const url = connection.url;
  if (!url) throw new Error("Ronin's address could not be resolved. Ronin may not be running.\nStart Ronin, or set RONIN_URL to its address and try again.");
  return url.endsWith('/') ? url : `${url}/`;
}

export async function cliRequest(tool: string, args = process.argv.slice(2), input?: string): Promise<CliReply> {
  const connection = await operatorConnection();
  const token = process.env.RONIN_CLI_TOKEN?.trim() || connection.token;
  const basic = process.env.GRID_USER && process.env.GRID_PASS
    ? `Basic ${Buffer.from(`${process.env.GRID_USER}:${process.env.GRID_PASS}`).toString('base64')}` : '';
  const res = await fetch(new URL(`api/cli/${tool}`, await address(connection)), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : basic ? { authorization: basic } : {}) },
    body: JSON.stringify({ args, input, session: process.env.RONIN_SESSION ?? '', pane: process.env.TMUX_PANE ?? '' }),
  });
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as CliReply & { error?: string };
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
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
