/**
 * A tmux server that is not the live one, for any test that needs a real pane.
 *
 * Need one? `openTestServer(name)`, run every tmux command through the `run` it returns
 * (or the `tmux` wrapper path it names), `closeTestServer(name)` when done. Nothing else.
 *
 * This calls `ronin-testserver`, the Ronin Host Routine's builder tool
 * (plans/TMUX_SCRATCH_RIGS.md §3f in ronin-lab; records/TMUX_KILL_20260904.md is why).
 * The tool writes `<root>/tmux`, a wrapper that unsets TMUX and TMUX_PANE and names the
 * socket with `-L <name>`, so a pane's own `$TMUX` cannot redirect a command at the live
 * server — the mechanism that killed it three times. Isolation is written there once;
 * no test carries its own `delete env.TMUX` prose any more.
 *
 * `onPath` puts that wrapper first on PATH for the duration, so product code that runs
 * `tmux` (the control client, the message queue) reaches the test server too.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../../src/resources.js';

const exec = promisify(execFile);

export interface TestServer {
  name: string;
  root: string;
  /** The wrapper: use it instead of `tmux` for every command, including kill-server. */
  tmux: string;
  socket: string;
  pid: number;
  /** Run one tmux command on this server; resolves to trimmed stdout. */
  run: (...args: string[]) => Promise<string>;
}

export interface OpenOptions {
  /** A start-only config for the server, instead of the tool's one-line exit-empty off. */
  conf?: string;
  /** Put the wrapper first on PATH (and clear TMUX/TMUX_PANE) until close. */
  onPath?: boolean;
  /** Environment for the server's start (e.g. a HOME with no ~/.tmux.conf). */
  env?: NodeJS.ProcessEnv;
}

const restore = new Map<string, { PATH?: string; TMUX?: string; TMUX_PANE?: string }>();

async function toolPath(): Promise<string> {
  const named = process.env.RONIN_TESTSERVER?.trim();
  if (named) return named;
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, 'ronin-testserver');
    if (await fs.access(candidate).then(() => true, () => false)) return candidate;
  }
  const stored = path.join(storeDir('tools'), 'ronin-testserver');
  if (await fs.access(stored).then(() => true, () => false)) return stored;
  throw new Error(
    'ronin-testserver is not on this box. It is the Ronin Host Routine\'s tool (ronin_catalogs/routines/ronin_host.md, tools:), '
    + `projected onto a session's PATH at birth or kept in the tools store (${storeDir('tools')}). `
    + 'Set RONIN_TESTSERVER to its path to run the tmux-touching tests here.',
  );
}

export async function openTestServer(name: string, options: OpenOptions = {}): Promise<TestServer> {
  const tool = await toolPath();
  const args = ['open', name];
  if (options.conf) args.push('--conf', options.conf);
  const { stdout } = await exec(tool, args, { env: { ...process.env, ...options.env } });
  const field = (key: string): string => new RegExp(`^\\s+${key}\\s+(\\S+)`, 'm').exec(stdout)?.[1] ?? '';
  const tmux = field('tmux');
  const pid = Number(field('pid'));
  if (!tmux || !Number.isInteger(pid)) throw new Error(`ronin-testserver open ${name} said:\n${stdout}`);
  const root = path.dirname(tmux);
  if (options.onPath) {
    restore.set(name, { PATH: process.env.PATH, TMUX: process.env.TMUX, TMUX_PANE: process.env.TMUX_PANE });
    process.env.PATH = `${root}${path.delimiter}${process.env.PATH ?? ''}`;
    delete process.env.TMUX;
    delete process.env.TMUX_PANE;
  }
  return {
    name, root, tmux, pid, socket: field('socket'),
    run: (...cmd: string[]) => exec(tmux, cmd, { env: { ...process.env, ...options.env } }).then((r) => r.stdout.trim()),
  };
}

export async function closeTestServer(server: string | TestServer): Promise<void> {
  const name = typeof server === 'string' ? server : server.name;
  const was = restore.get(name);
  if (was) {
    restore.delete(name);
    for (const [key, value] of Object.entries(was)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  await exec(await toolPath(), ['close', name]);
}
