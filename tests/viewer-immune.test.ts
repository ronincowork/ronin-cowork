import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pty from '@lydell/node-pty';

/* A TILE CAN NEVER PUT THE SHARED PANE INTO COPY-MODE. tmux's root key table binds
 * WheelUpPane (and drag, scrollbar, double-click) to copy-mode, and those fire on a mouse
 * escape the client delivers whether or not the `mouse` option is on — measured
 * 2026-09-02 on the live box: mouse off, no app tracking, one SGR wheel-up through a tile,
 * pane in copy-mode with the [n/m] counter the owner kept landing in. A viewer gets an
 * empty key table and no prefix, so every byte goes to the pane. Isolated tmux server,
 * a real pty client, exactly the path a tile's bytes take. */

const exec = promisify(execFile);
const TMUX = '/usr/bin/tmux';
// A SHORT socket root: tmux caps the socket path, and the scratch TMPDIR on this box is long.
const root = await fs.mkdtemp('/tmp/rv-');
const saved = { TMUX: process.env.TMUX, TMUX_PANE: process.env.TMUX_PANE, TMUX_TMPDIR: process.env.TMUX_TMPDIR, PATH: process.env.PATH };
delete process.env.TMUX; delete process.env.TMUX_PANE; process.env.TMUX_TMPDIR = root;
// The viewer code calls `tmux` by name; the guard shim projected onto an agent's PATH is
// for agents, not for this isolated server, so the real binary goes first.
process.env.PATH = `/usr/bin:${process.env.PATH ?? ''}`;
const env = { ...process.env };
const tmux = (...args: string[]) => exec(TMUX, args, { env }).then((r) => r.stdout.trim());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const inMode = () => tmux('display', '-p', '-t', 'target', '#{pane_in_mode}');

await tmux('new-session', '-d', '-s', 'target', '-x', '100', '-y', '30');
const { createViewer } = await import('../src/viewer.js');

/** Attach a client to `session` on a pty, deliver `bytes` through tmux's key parser, detach. */
async function throughClient(session: string, bytes: string): Promise<void> {
  const client = pty.spawn(TMUX, ['attach', '-t', session], { name: 'xterm-256color', cols: 100, rows: 30, cwd: os.homedir(), env: env as Record<string, string> });
  // Write only once tmux lists the client: bytes sent before the attach completes are
  // read by nobody's key parser.
  for (let i = 0; i < 40; i++) {
    const attached = await tmux('list-clients', '-t', session, '-F', '#{client_name}').catch(() => '');
    if (attached.trim()) break;
    await sleep(100);
  }
  await sleep(1000);
  client.write(bytes);
  await sleep(300);
  client.write(bytes.startsWith('\x1b[<') ? bytes : '');
  await sleep(800);
  await tmux('detach-client', '-s', session).catch(() => {});
  client.kill();
  await sleep(200);
}

/* The contrast case — a stock session entering copy-mode on the same escape — was measured
 * on the live server (2026-09-02, mouse off, no tracking: in_mode=1 after one SGR
 * wheel-up) but does not reproduce reliably against a fresh isolated server from a
 * just-attached pty client, so it is recorded here rather than asserted. */

test('a Ronin viewer carries an empty key table and no prefix', async () => {
  const viewer = await createViewer('target', 'abc');
  assert.equal(await tmux('show-options', '-v', '-t', viewer, 'key-table'), 'ronin-viewer');
  assert.equal(await tmux('show-options', '-v', '-t', viewer, 'prefix'), 'None');
  assert.equal(await tmux('show-options', '-v', '-t', viewer, 'prefix2'), 'None');
});

test('through a viewer, a wheel escape, a prefix chord and a double-click never enter copy-mode, and typing still lands', async () => {
  const viewer = await createViewer('target', 'def');
  await throughClient(viewer, '\x1b[<64;10;10M');
  assert.equal(await inMode(), '0', 'wheel escape');
  await throughClient(viewer, '\x02[');
  assert.equal(await inMode(), '0', 'C-b [');
  await throughClient(viewer, '\x1b[<0;10;10M\x1b[<0;10;10m\x1b[<0;10;10M\x1b[<0;10;10m');
  assert.equal(await inMode(), '0', 'double click');
  // ^U clears whatever the probes above left on the line (the `[` of the chord went to
  // the pane as a byte — that is the point); a short marker so the 100-column shell
  // line cannot wrap it.
  await throughClient(viewer, '\x15echo LANDED-OK\r');
  await sleep(400);
  const pane = await tmux('capture-pane', '-p', '-t', 'target');
  assert.match(pane, /^LANDED-OK$/m, pane);
});

test.after(async () => {
  await tmux('kill-server').catch(() => {});
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await fs.rm(root, { recursive: true, force: true });
});
