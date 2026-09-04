import 'dotenv/config';
import { tmux } from './tmux-client.js';

export interface CliReply { stdout: string; stderr: string; exit: number }

async function option(name: string): Promise<string> {
  try { return (await tmux.run(['show-option', '-s', '-qv', name])).trim(); }
  catch { return ''; }
}

async function address(): Promise<string> {
  const url = process.env.RONIN_URL?.trim() || await option('@ronin-url');
  if (!url) throw new Error("Ronin's address could not be resolved. Ronin may not be running.\nStart Ronin, or set RONIN_URL to its address and try again.");
  return url.endsWith('/') ? url : `${url}/`;
}

export async function cliRequest(tool: string, args = process.argv.slice(2), input?: string): Promise<CliReply> {
  const token = process.env.RONIN_CLI_TOKEN?.trim() || await option('@ronin-cli-token');
  const basic = process.env.GRID_USER && process.env.GRID_PASS
    ? `Basic ${Buffer.from(`${process.env.GRID_USER}:${process.env.GRID_PASS}`).toString('base64')}` : '';
  const res = await fetch(new URL(`api/cli/${tool}`, await address()), {
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
