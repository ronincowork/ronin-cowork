#!/usr/bin/env node

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

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });

const files = fs.readdirSync(dest, { recursive: true }).filter((f) => !fs.statSync(path.join(dest, f)).isDirectory());
console.log(`staged ${files.length} file(s)`);
console.log(`  from  ${src}`);
console.log(`  to    ${dest}`);
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
