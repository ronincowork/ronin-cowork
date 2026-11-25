#!/usr/bin/env node
// Tamper check (docs/development/verification.md): the marks a booby-trapped commit leaves
// on the tracked files. Written after 25 Nov 2026, when an outside collaborator's infected
// machine rewrote dev's newest commit: every file re-saved with Windows line endings, a
// downloader hidden after a long run of spaces, and a committed .env.
// It reads files; it runs none of them. Pass a directory to check another checkout.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).stdout.split('\0').filter(Boolean);
const found = [];

if (tracked.some((f) => path.basename(f) === '.env')) found.push('.env is committed: it holds secrets and is never tracked');
const ignore = fs.existsSync(path.join(ROOT, '.gitignore')) ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/) : [];
if (!ignore.includes('.env')) found.push('.gitignore no longer ignores .env');

let crlf = 0;
for (const file of tracked) {
  let buf;
  try { buf = fs.readFileSync(path.join(ROOT, file)); } catch { continue; }
  if (buf.includes(0)) continue; // binary
  const text = buf.toString('utf8');
  if (text.includes('\r\n')) { crlf++; if (crlf <= 5) found.push(`${file}: Windows line endings`); }
  const hidden = text.split('\n').findIndex((line) => /\S {200,}\S/.test(line));
  if (hidden !== -1) found.push(`${file}:${hidden + 1}: code after a run of 200 or more spaces, pushed off-screen`);
}
if (crlf > 5) found.push(`…and ${crlf - 5} more files with Windows line endings`);

if (found.length) {
  console.error(`FAILED — tamper check: ${found.length} mark${found.length === 1 ? '' : 's'} of a rewritten commit.`);
  for (const line of found) console.error(`  ${line}`);
  console.error('  Do not build or start this checkout. Compare it with the commit this machine pushed.');
  process.exit(1);
}
console.log(`tamper check: ${tracked.length} tracked files clean`);
