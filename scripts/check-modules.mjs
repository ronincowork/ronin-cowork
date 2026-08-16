#!/usr/bin/env node
/**
 * Structural check on public/js/ — keeps the split from rotting back into a tangle.
 *
 *   node scripts/check-modules.mjs
 *
 * This is deliberately NOT a general-purpose linter. `no-unused-vars` would not have
 * caught the 2026-08-08 outage (a property used before assignment inside a
 * constructor), and neither would TypeScript's strictPropertyInitialization. Adding
 * either and calling the problem solved would be theatre. These four rules are the
 * ones that protect the structure the split created:
 *
 *   1. no import cycles
 *   2. every import resolves to a file that exists and exports that name
 *   3. no module is orphaned (unreachable from main.js)
 *   4. no imported binding is referenced at module top level (load-order fragility —
 *      the exact class of bug this refactor exists to prevent)
 *
 * Rule "shared mutable state lives on S" needs no check: an ES module's imported
 * binding is read-only, so assigning one is already a hard error. The language
 * enforces it, which is why the state was consolidated that way.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { noComments, codeOnly, parseImports, parseExports } from './lib/js-parse.mjs';

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'js');
const files = fs.readdirSync(JS).filter((f) => f.endsWith('.js'));
const problems = [];
const mod = {};

for (const f of files) {
  const name = f.replace(/\.js$/, '');
  const raw = fs.readFileSync(path.join(JS, f), 'utf8');
  const code = codeOnly(raw);
  const src = noComments(raw); // strings intact: './api.js' must survive
  const imports = parseImports(src);
  const exports = parseExports(src);
  mod[name] = { code, imports, exports, raw };
}

// --- rules 1 & 2 ---
for (const [name, m] of Object.entries(mod)) {
  for (const imp of m.imports) {
    const target = mod[imp.from];
    if (!target) { problems.push(`${name}.js imports './${imp.from}.js', which does not exist`); continue; }
    for (const n of imp.names) {
      if (!target.exports.includes(n)) problems.push(`${name}.js imports { ${n} } from ${imp.from}.js, which does not export it`);
    }
  }
}

// --- rule 1, the whole graph: DFS colouring finds ANY cycle, not only a reciprocal
// pair. a->b->c->a used to pass the old two-node test and is exactly as fatal. ---
{
  const state = {}; // undefined = white, 1 = on the stack, 2 = done
  const stack = [];
  const dfs = (n) => {
    if (!mod[n] || state[n] === 2) return;
    if (state[n] === 1) {
      const cyc = stack.slice(stack.indexOf(n)).concat(n).join(' -> ');
      if (!problems.some((p) => p.includes('import cycle'))) problems.push(`import cycle: ${cyc}`);
      return;
    }
    state[n] = 1;
    stack.push(n);
    for (const i of mod[n].imports) dfs(i.from);
    stack.pop();
    state[n] = 2;
  };
  for (const name of Object.keys(mod)) dfs(name);
}

// --- rule 5: the ~700-line ceiling, MECHANICAL now. The README stated the rule and
// commons.js crossed it anyway (781 on 2026-08-16) — a written convention with no
// gate is a suggestion. Same number as the server's check-src ceiling. ---
const CEILING = 700;
for (const [name, m] of Object.entries(mod)) {
  const lines = m.raw.split('\n').length;
  if (lines > CEILING) problems.push(`${name}.js is ${lines} lines (ceiling ${CEILING}) — split it; see js/README.md`);
}

// --- rule 3: reachability from main.js ---
const seen = new Set();
(function walk(n) {
  if (seen.has(n) || !mod[n]) return;
  seen.add(n);
  for (const i of mod[n].imports) walk(i.from);
})('main');
for (const name of Object.keys(mod)) {
  if (!seen.has(name)) problems.push(`${name}.js is orphaned — nothing reachable from main.js imports it`);
}

// --- rule 4: an imported binding referenced at top level (brace depth 0) ---
for (const [name, m] of Object.entries(mod)) {
  // main.js is the ENTRY module: booting at top level is its entire job, and as the
  // root of an acyclic graph its imports are fully evaluated by the time it runs.
  // Every other module must confine cross-module use to function bodies.
  if (name === 'main') continue;
  const imported = new Set(m.imports.flatMap((i) => i.names));
  if (!imported.size) continue;
  let depth = 0;
  const lines = m.code.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    if (depth === 0 && !/^\s*(import|export)\b/.test(line)) {
      for (const id of imported) {
        // a bare reference, not a declaration of the same name, at top level
        if (new RegExp(`(?<![.\\w$])${id}\\s*\\(`).test(line) || new RegExp(`=\\s*${id}\\b`).test(line)) {
          problems.push(`${name}.js:${li + 1} uses imported '${id}' at module top level — load-order fragility`);
        }
      }
    }
    depth += opens - closes;
    if (depth < 0) depth = 0;
  }
}

console.log(`checked ${files.length} module(s) in public/js/`);
if (problems.length) {
  console.log('');
  for (const p of problems) console.log('  ✗ ' + p);
  console.log(`\nFAILED — ${problems.length} structural problem(s). See public/js/README.md.`);
  process.exit(1);
}
console.log('  ok — no cycles (full graph), all imports resolve, nothing orphaned, no top-level use of an import, every module under 700 lines');
