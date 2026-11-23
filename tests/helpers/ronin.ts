/**
 * A real Ronin for a test file: `src/index.ts` booted as a child process on a private tmux
 * server, a free port and scratch roots. Nothing reaches ~/ronin, ~/.ronin or the live tmux.
 *
 *   const ronin = await bootRonin('launch');
 *   const r = await ronin.api('/api/sessions');
 *   const out = await ronin.tool('item', ['create', '--title', 'x']);
 *   test.after(() => ronin.stop());
 *
 * `api` goes over HTTP like the browser; `tool` runs a ronin_bin command the way an Agent
 * does, over the operator socket. `env` is what both use; a test may add to it.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { closeTestServer, openTestServer, type TestServer } from './testserver.js';

export const ROOT = path.resolve(import.meta.dirname, '../..');

export interface Ronin {
  base: string;
  socket: string;
  scratch: string;
  tmux: TestServer;
  env: NodeJS.ProcessEnv;
  log: () => string;
  /** Every stub provider CLI started so far, oldest first: its argv line and its environment. */
  cliRuns: () => Promise<Array<{ argv: string; env: Record<string, string> }>>;
  api: (route: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) => Promise<{ status: number; body: any }>;
  tool: (name: string, args: string[], options?: { input?: string; env?: NodeJS.ProcessEnv }) => Promise<{ status: number; stdout: string; stderr: string }>;
  /** Stop the server and start it again on the same roots, port and tmux server. */
  restart: () => Promise<void>;
  stop: () => Promise<void>;
}

const freePort = (): Promise<number> => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = (server.address() as net.AddressInfo).port;
    server.close(() => resolve(port));
  });
});

export interface BootOptions {
  /** Files to write under the scratch root before boot, path → text. */
  files?: Record<string, string>;
  /** Extra environment for the server and the tools. */
  env?: NodeJS.ProcessEnv;
}

export async function bootRonin(name: string, options: BootOptions = {}): Promise<Ronin> {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), `ronin-${name}-`));
  const home = path.join(scratch, 'home');
  const stubs = path.join(scratch, 'stubs');
  const runs = path.join(scratch, 'runs');
  const privateTmux = path.join(scratch, 'tmux');
  for (const dir of [home, stubs, runs, privateTmux]) await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  // A provider CLI is never really started: each stub records its argv and env, then waits.
  for (const cli of ['claude', 'codex']) {
    await fs.writeFile(path.join(stubs, cli), `#!/bin/sh\n[ "$1" = --version ] && { echo "9.9.9 (stub)"; exit 0; }\n{ echo "ARGV ${cli} $*"; env; } > ${runs}/$$.tmp && mv ${runs}/$$.tmp ${runs}/$$\necho ready\nexec sleep 600\n`, { mode: 0o755 });
  }
  // systemd is never reached. Ronin stops an Agent pane's scope when the pane ends, and a test
  // tmux server's panes sit in the scope of whatever started the test: an Agent running the
  // suite would be stopped with it (KAN-697, 19 Nov). The stub logs each call and does nothing.
  for (const tool of ['systemctl', 'systemd-run', 'loginctl']) {
    await fs.writeFile(path.join(stubs, tool), `#!/bin/sh\necho "${tool} $*" >> ${runs}/systemd.log\nexit 0\n`, { mode: 0o755 });
  }
  const searchPath = (wrapper: string) => [wrapper, stubs, path.join(ROOT, 'ronin_bin'), process.env.PATH ?? ''].filter(Boolean).join(path.delimiter);
  // The test tmux server runs the pane hooks, so it gets the stubs on its PATH too.
  const tmux = await openTestServer(`${name}-${process.pid}`, { env: { HOME: home, TMUX_TMPDIR: privateTmux, PATH: searchPath('') } });
  const port = await freePort();
  for (const [file, text] of Object.entries(options.files ?? {})) {
    await fs.mkdir(path.dirname(path.join(scratch, file)), { recursive: true });
    await fs.writeFile(path.join(scratch, file), text);
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
    // Always first, whatever a test adds: the test server's wrapper, then the stubs.
    PATH: searchPath(tmux.root),
    HOME: home,
    TMUX_TMPDIR: privateTmux,
    // The entry point binds its operator socket only as production (src/index.ts).
    NODE_ENV: 'production',
    BIND: '127.0.0.1',
    PORT: String(port),
    RONIN_DATA_ROOT: path.join(scratch, 'data'),
    RONIN_USER_ROOT: path.join(scratch, 'user'),
    RONIN_SOCKET: path.join(scratch, 'data', 'run', 'ronin.sock'),
  };
  for (const key of ['TMUX', 'TMUX_PANE', 'RONIN_URL', 'RONIN_CLI_TOKEN', 'RONIN_AUTH', 'RONIN_TEST_RUNNER']) delete env[key];

  let child: ChildProcess;
  let output = '';
  const start = () => new Promise<void>((resolve, reject) => {
    output = '';
    child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => reject(new Error(`Ronin did not start:\n${output}`)), 20_000);
    let up = false;
    const inspect = (chunk: Buffer) => {
      output += chunk.toString();
      if (!up && output.includes('agent tools answer at') && output.includes('[tmux-ronin] listening on')) { up = true; clearTimeout(timer); resolve(); }
    };
    child.stdout!.on('data', inspect);
    child.stderr!.on('data', inspect);
    child.once('exit', (code) => { clearTimeout(timer); if (!up) reject(new Error(`Ronin exited ${code}:\n${output}`)); });
  });
  const halt = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    const hard = setTimeout(() => child.kill('SIGKILL'), 4_000);
    await exited;
    clearTimeout(hard);
  };
  try { await start(); }
  catch (error) {
    // A failed boot leaves nothing behind: its own server (by its pid), its tmux server, its roots.
    child!.kill('SIGKILL');
    await closeTestServer(tmux).catch(() => {});
    await fs.rm(scratch, { recursive: true, force: true });
    throw error;
  }

  const base = `http://127.0.0.1:${port}`;
  const ronin: Ronin = {
    base, socket: env.RONIN_SOCKET!, scratch, tmux, env,
    log: () => output,
    async cliRuns() {
      const files = (await fs.readdir(runs)).filter((f) => /^\d+$/.test(f)).sort((a, b) => Number(a) - Number(b));
      return Promise.all(files.map(async (f) => {
        const lines = (await fs.readFile(path.join(runs, f), 'utf8')).split('\n');
        const vars = Object.fromEntries(lines.slice(1).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
        return { argv: lines[0].replace(/^ARGV /, ''), env: vars };
      }));
    },
    async api(route, init = {}) {
      const response = await fetch(`${base}${route}`, {
        method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
        headers: { ...(init.body === undefined ? {} : { 'content-type': 'application/json' }), ...init.headers },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const text = await response.text();
      let body: any = text;
      try { body = JSON.parse(text); } catch { /* not JSON */ }
      return { status: response.status, body };
    },
    tool(tool, args, opts = {}) {
      return new Promise((resolve) => {
        const run = execFile(path.join(ROOT, 'ronin_bin', tool), args, { encoding: 'utf8', env: { ...ronin.env, ...opts.env } }, (error, stdout, stderr) =>
          resolve({ status: error ? Number((error as { code?: number }).code ?? 1) : 0, stdout, stderr }));
        run.stdin?.end(opts.input ?? '');
      });
    },
    async restart() {
      await halt();
      try { await start(); }
      catch (error) { child.kill('SIGKILL'); throw error; }
    },
    async stop() {
      await halt();
      await closeTestServer(tmux).catch(() => {});
      await fs.rm(scratch, { recursive: true, force: true });
    },
  };
  return ronin;
}

/** Wait until `probe` returns something truthy; the event, never a fixed sleep. */
export async function until<T>(probe: () => Promise<T> | T, what: string, ms = 10_000): Promise<NonNullable<T>> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await probe();
    if (value) return value as NonNullable<T>;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
