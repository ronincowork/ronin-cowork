#!/usr/bin/env node
/**
 * check-css — one palette, spelled once, and a cascade that cannot be patched.
 *
 *   node scripts/check-css.mjs                    # gate public/style.css
 *   node scripts/check-css.mjs public-staging     # gate a staged client instead
 *
 * The 2026-08-15 census found 154 raw-colour occurrences (87 distinct) beside a
 * 15-token layer — a palette that could only drift, because nothing held it. The
 * 2026-08-16 migration took the count to zero; this gate is what keeps it there.
 * The allowlist is EMPTY and stays empty: there is no legal place for a raw colour
 * outside a token definition, so a new one is a build failure, not a review note.
 *
 * Three checks, all high-precision:
 *
 *   1. RAW COLOUR ONLY IN A TOKEN DEFINITION. A hex, rgb()/rgba()/hsl() or named
 *      CSS colour may appear only on a custom-property line (`--name: …`). Every
 *      other declaration must reach colour through var() or color-mix() over one.
 *      (`transparent`, `currentColor` and `inherit` are not colours here — they are
 *      the cascade's own words.)
 *   2. THE LAYER ORDER IS DECLARED, ONCE, FIRST — `@layer vendor, foundations, ui,
 *      app;` before any rule. The order is the enforcement (a feature rule cannot
 *      out-cascade a primitive), so its absence is the failure.
 *   3. THE TERMINAL TOKENS EXIST — js/theme.js reads --term-* by name into xterm;
 *      a deleted token would silently become an empty string in a live terminal
 *      theme, which no browser reports. The reader and the stylesheet are held
 *      to the same list here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.resolve(ROOT, process.argv[2] || 'public');
const cssPath = path.join(PUB, 'style.css');
const css = fs.readFileSync(cssPath, 'utf8');
const problems = [];

// strip comments; keep line structure so reports carry real line numbers
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

// --- 1. raw colours outside token definitions ---
const NAMED =
  /\b(?:aliceblue|antiquewhite|aqua|black|blue|brown|coral|crimson|cyan|darkgray|darkgrey|dimgray|dimgrey|fuchsia|gainsboro|gold|gray|grey|green|indigo|ivory|khaki|lavender|lime|linen|magenta|maroon|navy|olive|orange|orchid|pink|plum|purple|red|salmon|silver|snow|tan|teal|tomato|violet|wheat|white|yellow)\b/;
const lines = noComments.split('\n');
lines.forEach((line, i) => {
  if (/^\s*--[\w-]+\s*:/.test(line)) return; // a token definition — the one legal home
  const inValue = line.includes(':') ? line.slice(line.indexOf(':')) : '';
  if (!inValue) return;
  if (/#[0-9a-fA-F]{3,8}\b/.test(inValue) || /\brgba?\(|\bhsla?\(/.test(inValue)) {
    problems.push(`style.css:${i + 1} raw colour outside a token definition: ${line.trim()}`);
    return;
  }
  // named colours only in colour-carrying properties, to avoid false hits on idents
  if (/(?:^|;)\s*(?:color|background|background-color|border[^:]*|outline[^:]*|fill|stroke|box-shadow|text-shadow|caret-color|scrollbar-color)\s*:[^;]*$/.test(line.slice(0, line.indexOf(':') + 1) + inValue)) {
    const v = inValue.replace(/var\([^)]*\)/g, '').replace(/color-mix\([^)]*\)/g, '');
    if (NAMED.test(v) && !/transparent|currentColor|inherit|none/.test(v)) {
      problems.push(`style.css:${i + 1} named colour outside a token definition: ${line.trim()}`);
    }
  }
});

// --- 2. the layer order, declared before any rule ---
const firstRule = noComments.search(/^[^@\s/][^\n]*\{|^@media|^@layer\s+\w+\s*\{/m);
const decl = noComments.indexOf('@layer vendor, foundations, ui, app;');
if (decl === -1) problems.push('style.css does not declare `@layer vendor, foundations, ui, app;`');
else if (firstRule !== -1 && decl > firstRule) problems.push('the @layer order declaration must come before any rule');

// --- 3. the terminal tokens js/theme.js reads must exist ---
const themeJs = fs.readFileSync(path.join(PUB, 'js', 'theme.js'), 'utf8');
for (const m of themeJs.matchAll(/v\('(--term-[\w-]+)'\)/g)) {
  if (!css.includes(`${m[1]}:`)) problems.push(`js/theme.js reads ${m[1]}, which style.css never defines`);
}

console.log(`check-css: ${path.relative(ROOT, cssPath)}, ${lines.length} lines`);
if (problems.length) {
  for (const p of problems) console.log('  ✗ ' + p);
  console.log(`\nFAILED — ${problems.length} problem(s). Colour lives in tokens; rules reach it with var().`);
  process.exit(1);
}
console.log('  ok — no raw colour outside token definitions, layer order declared, terminal tokens complete');
