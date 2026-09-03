#!/usr/bin/env node
/**
 * Copy the client into the staging slot so it can be LOOKED AT before it is live.
 *
 *   npm run stage                                  # public/ -> public-staging/
 *   npm run stage -- ../some-worktree/public       # any other tree -> public-staging/
 *
 * Then: https://<host>:8443/staging/  (and `npm run verify:staging` to gate it)
 *
 * Why this exists: on 2026-08-08 a client change went straight to live twice. The
 * second time, the UI it broke was the only way to look at anything. Staging is the
 * place to look. The server mounts it read-only at /staging/ and never forks the
 * backend — a staged client drives the same tmux sessions over the same sockets.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(ROOT, process.argv[2] || path.join(ROOT, 'public'));
const dest = process.env.RONIN_STAGING_DIR || path.join(ROOT, 'public-staging');

if (!fs.existsSync(src)) {
  console.error(`stage: source does not exist: ${src}`);
  process.exit(1);
}
if (path.resolve(src) === path.resolve(dest)) {
  console.error('stage: source and destination are the same directory');
  process.exit(1);
}

// Replace wholesale rather than merging: a staging dir holding a mix of two vintages is
// precisely the "client of one vintage against a server of another" problem, indoors.
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });

const files = fs.readdirSync(dest, { recursive: true }).filter((f) => !fs.statSync(path.join(dest, f)).isDirectory());
console.log(`staged ${files.length} file(s)`);
console.log(`  from  ${src}`);
console.log(`  to    ${dest}`);
// No hardcoded host: prefer the tailnet HTTPS name (`tailscale serve` puts the grid on
// :8443 — see setup.sh "Next steps"), fall back to where the server actually binds.
let lookAt = '';
try {
  const st = JSON.parse(execFileSync('tailscale', ['status', '--json'], { encoding: 'utf8' }));
  const fqdn = (st.Self?.DNSName || '').replace(/\.$/, '');
  if (fqdn) lookAt = `https://${fqdn}:8443/staging/`;
} catch { /* tailscale not installed / not up */ }
if (!lookAt) {
  try {
    const ip = execFileSync('tailscale', ['ip', '-4'], { encoding: 'utf8' }).trim().split('\n')[0];
    if (ip) lookAt = `http://${ip}:${process.env.PORT || 3006}/staging/`;
  } catch { /* still nothing — the placeholder stands */ }
}
lookAt ||= '<your Ronin URL>/staging/';
console.log('');
console.log(`  look at it:  ${lookAt}`);
console.log('  gate it:     npm run verify:staging');
