#!/usr/bin/env node
/**
 * KYOKAI (境界) — the cowork/services seam, held.
 *
 *   node scripts/check-kyokai.mjs
 *
 * The seam was drawn in place (`docs/kyokai.md`): service code lives under
 * `src/services/<service>/`, the free core is everything else in `src/`. A boundary
 * with no gate regrows — that is how index.ts reached 1,886 lines and how telemetry
 * threaded itself through the session routes. Two rules:
 *
 *   1. CORE NEVER IMPORTS A SERVICE — a file under src/ but outside src/services/
 *      may not import from src/services/, except the socket files listed below.
 *      Services importing core is legal (they leave with their side at the split);
 *      services importing each other is their own business until then.
 *
 *   2. A SERVICE DEPENDENCY NEVER LEAVES THE SERVICES SIDE — the packages in
 *      SERVICE_DEPS may be imported only under src/services/. package.json cannot
 *      split while the tree is unified, so this list IS the split-day dependency
 *      map: the deps that leave are exactly the ones named here.
 *
 * THE EXCEPTION LIST FOLLOWS THE FILE DOWN (the check-src ratchet pattern): an entry
 * whose file no longer imports from src/services/ fails the gate until the entry is
 * deleted, so the list can only shrink honestly. Adding an entry is a cowork change
 * somebody has to argue for — same bar as a fifth socket (RONIN_SERVICES.md §1).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { noComments } from './lib/js-parse.mjs';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

/**
 * Rule-1 exceptions: the socket files — core files that reach into services today
 * because the connector does not exist yet. Each names its future socket
 * (RONIN_SERVICES.md §1); the whole list dies with the split.
 */
const SOCKET_FILES = {
  // THE CONNECTOR LANDED (docs/connector-contract.md): every former entry here now
  // reaches its service through src/sockets.ts. What remains is the assembler — the
  // one static import block that becomes runtime discovery on split day. This list
  // only shrinks; when discovery lands it is empty, and a second entry is a thing
  // somebody has to argue for.
  'index.ts': 'the assembler — imports each service register.ts and calls register(sockets)',
};

/**
 * Rule 2: packages that belong to a service, never to the core. `only` pins a dep to
 * one leaf — the provider SDK is importable by exactly the file whose job is the wire,
 * so "the interface names no endpoint" is enforced, not asserted.
 */
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

// Static and dynamic import specifiers, comments stripped so examples in docblocks
// are not read as claims. Strings survive noComments, which is what we parse.
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

// The ratchet: a listed socket file that no longer touches services is a stale
// exception and must be deleted, so the list only ever shrinks.
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
