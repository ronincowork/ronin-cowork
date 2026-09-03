#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { noComments } from './lib/js-parse.mjs';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

const SOCKET_FILES = {
};

const SERVICE_DEPS = {
  openai: {
    why: 'the provider SDK — vendor neutrality is the thesis; the core ships zero',
    only: 'services/koshi/outlet-http.ts',
  },
};

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts')) files.push(p);
  }
})(SRC);

const problems = [];
const touchesServices = new Set(); // core files that DO import services, for the ratchet

const SPEC_RE =
  /(?:^|\n)\s*(?:import|export)\s+[^;]*?from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

for (const file of files) {
  const rel = path.relative(SRC, file).replaceAll(path.sep, '/');
  const inServices = rel.startsWith('services/');
  const src = noComments(fs.readFileSync(file, 'utf8'));
  for (const m of src.matchAll(SPEC_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (!spec) continue;
    if (spec.startsWith('.')) {
      const target = path
        .relative(SRC, path.resolve(path.dirname(file), spec))
        .replaceAll(path.sep, '/');
      if (target.startsWith('services/') && !inServices) {
        touchesServices.add(rel);
        if (!(rel in SOCKET_FILES))
          problems.push(`${rel} imports ${spec} — core reaching into src/services/, and it is not a listed socket file`);
      }
    } else {
      for (const [dep, rule] of Object.entries(SERVICE_DEPS)) {
        if (spec !== dep && !spec.startsWith(`${dep}/`)) continue;
        if (rule.only ? rel !== rule.only : !inServices)
          problems.push(`${rel} imports '${spec}' — ${rule.why}${rule.only ? ` (allowed only in ${rule.only})` : ''}`);
      }
    }
  }
}

for (const entry of Object.keys(SOCKET_FILES)) {
  if (!touchesServices.has(entry))
    problems.push(`SOCKET_FILES lists '${entry}' but it no longer imports from src/services/ — delete the entry (the list only shrinks)`);
}

console.log(`\ncheck-kyokai: ${files.length} file(s) in src/, ${touchesServices.size} socket file(s) in use\n`);
if (problems.length) {
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log(`\nFAILED — ${problems.length} seam problem(s). The rules: header of this file; the seam: docs/kyokai.md.`);
  process.exit(1);
}
console.log('  ok — the core imports no service and no service dependency; every listed socket is real');
