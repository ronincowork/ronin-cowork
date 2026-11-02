/* FILES (owner, KAN-146): copyparty, the machine's file explorer, from the user's home folder.
 * It runs only where python3 is on PATH when Ronin starts; nowhere else, and nothing is said.
 * It listens on a 0700 unix socket (owner, 2026-11-02: not a loopback port, so no other user on
 * the box can open it and no port is taken), as the user, a child of Ronin. Ronin serves it at
 * /files behind its own sign-in; --rp-loc makes copyparty draw every link as /files/<path>, which
 * means $HOME/<path> — the Workspace page takes such a dropped link and adds that folder.
 * No index, no scan, no thumbnails: idle it costs nothing but its memory. */
import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type express from 'express';
import { rootDir } from './resources.js';

const HOME = os.homedir();
const DATA = rootDir('data');
export const FILES_SOCKET = path.join(DATA, 'files.sock');

/** python3 on PATH, read once: the whole of the "where Python is found" rule. */
export function findPython(searchPath = process.env.PATH ?? ''): string | null {
  for (const dir of searchPath.split(path.delimiter).filter(Boolean)) {
    const file = path.join(dir, 'python3');
    try { fs.accessSync(file, fs.constants.X_OK); return file; } catch { /* not in this folder */ }
  }
  return null;
}

export const PYTHON = findPython();

/** copyparty's command line: $HOME read and write at /files/, its own chrome hidden, Ronin's look on top
 * (files.css, and files.js, which follows Ronin's light or dark and its colours). */
export function filesArgs(root: string, home = HOME, data = DATA): string[] {
  return [
    path.join(root, 'libexec', 'copyparty', 'copyparty-sfx.py'), '-q',
    '-i', `unix:700:${path.join(data, 'files.sock')}`, '--rp-loc', '/files',
    '-v', `${home}::rwmd.,*`, '--hist', path.join(data, 'copyparty'),
    '--http-only', '--no-robots', '--no-thumb',
    '--ui-nombar', '--ui-noacci', '--ui-nosrvi', '--ui-nocpla', '--ui-norepl',
    '--theme', '2', '--css-browser', '/files.css', '--js-browser', '/files.js',
  ];
}

let child: ChildProcess | null = null;

export function startFiles(root: string): void {
  if (!PYTHON) return;
  fs.rmSync(FILES_SOCKET, { force: true }); // the last run's socket; copyparty will not bind over it
  child = spawn(PYTHON, filesArgs(root), { stdio: ['ignore', 'ignore', 'inherit'] });
}

export function stopFiles(): void {
  child?.kill();
  child = null;
}

/** /files/* straight through to the socket, bodies streamed untouched (uploads, up2k's JSON). Mounted
 * behind Ronin's sign-in and before its body parsers. Ronin's Basic credentials stay here. */
export function filesProxy(socketPath = FILES_SOCKET): express.RequestHandler {
  return (req, res) => {
    const { authorization: _ronin, ...headers } = req.headers;
    const upstream = request({ socketPath, path: req.originalUrl, method: req.method, headers }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.status(502).send('Files is not running.'); else res.end(); });
    req.pipe(upstream);
  };
}
