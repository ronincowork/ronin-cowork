#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.resolve(ROOT, process.argv[2] || 'public');
const cssPath = path.join(PUB, 'style.css');
const css = fs.readFileSync(cssPath, 'utf8');
const problems = [];
const featureDir = path.join(PUB, 'css');
const featurePaths = fs.existsSync(featureDir)
  ? fs.readdirSync(featureDir).filter((file) => file.endsWith('.css')).sort().map((file) => path.join(featureDir, file))
  : [];
const shippedPaths = [cssPath, path.join(PUB, 'workspace-kit.css'), ...featurePaths];

const noComments = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const lines = noComments.split('\n');

function block(source, marker) {
  const at = source.indexOf(marker);
  if (at === -1) return '';
  let i = source.indexOf('{', at);
  let depth = 1;
  const start = ++i;
  while (depth && i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    i++;
  }
  return source.slice(start, i - 1);
}

const index = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const linkedStyles = [...index.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g)].map((match) => match[1]);
const rootFeatureSheets = fs.readdirSync(PUB).filter((file) => file.endsWith('.css') && !['style.css', 'workspace-kit.css'].includes(file));
for (const file of rootFeatureSheets) problems.push(`${file} is a feature stylesheet outside public/css/`);
for (const file of featurePaths) {
  const href = `css/${path.basename(file)}`;
  const count = linkedStyles.filter((linked) => linked === href).length;
  if (count !== 1) problems.push(`${href} must be linked exactly once from index.html (found ${count})`);
}
for (const href of linkedStyles.filter((linked) => linked.startsWith('css/'))) {
  if (!featurePaths.some((file) => `css/${path.basename(file)}` === href)) problems.push(`${href} is linked but is not a canonical public/css feature sheet`);
}
const clientModules = fs.readdirSync(path.join(PUB, 'js')).filter((file) => file.endsWith('.js'))
  .map((file) => fs.readFileSync(path.join(PUB, 'js', file), 'utf8')).join('\n');
for (const file of featurePaths) {
  if (clientModules.includes(`css/${path.basename(file)}`)) problems.push(`${path.basename(file)} must be statically linked, not loaded by client JavaScript`);
}

for (const file of shippedPaths) {
  if (!fs.existsSync(file)) { problems.push(`missing shipped stylesheet ${path.relative(ROOT, file)}`); continue; }
  const source = fs.readFileSync(file, 'utf8');
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [i, line] of clean.split('\n').entries()) {
    if (/^\s*--[\w-]+\s*:/.test(line)) continue;
    if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(line)) {
      problems.push(`${path.relative(ROOT, file)}:${i + 1} raw colour outside the token sheet: ${line.trim()}`);
    }
  }
}

for (const file of featurePaths) {
  const source = fs.readFileSync(file, 'utf8');
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const body = block(clean, '@layer app');
  const completeLayer = clean.startsWith('@layer app') && body && clean.slice(clean.indexOf(body) + body.length).trim() === '}';
  if (!completeLayer) problems.push(`${path.relative(ROOT, file)} must contain only one @layer app block`);
  for (const [i, line] of clean.split('\n').entries()) {
    if (/^\s*--[\w-]+\s*:/.test(line)) continue;
    if (/(?<![\w.-])\d+(?:\.\d+)?(?:px|rem|em)\b|var\([^)]*,/.test(line)) {
      problems.push(`${path.relative(ROOT, file)}:${i + 1} raw visual measurement — use an existing design token: ${line.trim()}`);
    }
    const declaration = line.match(/^\s*([\w-]+)\s*:\s*([^;]+);/);
    if (!declaration) continue;
    const [, property, value] = declaration;
    const tokenVisual = /^(?:border-radius|font|font-family|font-size|padding|margin|gap|row-gap|column-gap|color|background|background-color|border-color)$/;
    const tokenlessValue = value.replace(/var\([^)]*\)/g, '').replace(/\b(?:transparent|currentColor|inherit|initial|unset|none|normal|auto)\b/g, '').replace(/[\s0/.-]/g, '');
    if (tokenVisual.test(property) && tokenlessValue) {
      problems.push(`${path.relative(ROOT, file)}:${i + 1} ${property} carries a literal visual role — use an existing design token: ${line.trim()}`);
    }
  }
  if (/(?:data-(?:skin|theme)|skin-[\w-]+|#skin\b)/i.test(body)) {
    problems.push(`${path.relative(ROOT, file)} must not contain feature-specific skin or theme selectors; skins are token sets only`);
  }
  for (const match of body.matchAll(/(^|[}{;])([^{}]*?)\{/g)) {
    const selector = match[2].trim();
    if (selector && !selector.startsWith('@') && /\.wk-[\w-]+/.test(selector)) {
      problems.push(`${path.relative(ROOT, file)} feature selector reaches into Workspace Kit (${selector.slice(0, 80)})`);
    }
  }
}

const NAMED =
  /\b(?:aliceblue|antiquewhite|aqua|black|blue|brown|coral|crimson|cyan|darkgray|darkgrey|dimgray|dimgrey|fuchsia|gainsboro|gold|gray|grey|green|indigo|ivory|khaki|lavender|lime|linen|magenta|maroon|navy|olive|orange|orchid|pink|plum|purple|red|salmon|silver|snow|tan|teal|tomato|violet|wheat|white|yellow)\b/;
lines.forEach((line, i) => {
  if (/^\s*--[\w-]+\s*:/.test(line)) return; // a token definition — the one legal home
  const inValue = line.includes(':') ? line.slice(line.indexOf(':')) : '';
  if (!inValue) return;
  if (/#[0-9a-fA-F]{3,8}\b/.test(inValue) || /\brgba?\(|\bhsla?\(/.test(inValue)) {
    problems.push(`style.css:${i + 1} raw colour outside a token definition: ${line.trim()}`);
    return;
  }
  if (/(?:^|;)\s*(?:color|background|background-color|border[^:]*|outline[^:]*|fill|stroke|box-shadow|text-shadow|caret-color|scrollbar-color)\s*:[^;]*$/.test(line.slice(0, line.indexOf(':') + 1) + inValue)) {
    const v = inValue.replace(/var\([^)]*\)/g, '').replace(/color-mix\([^)]*\)/g, '');
    if (NAMED.test(v) && !/transparent|currentColor|inherit|none/.test(v)) {
      problems.push(`style.css:${i + 1} named colour outside a token definition: ${line.trim()}`);
    }
  }
});

const LOOK = [
  [/^\s*border-radius\s*:/, /(?<![\w.-])\d+(?:\.\d+)?px\b/, 'radius', '--radius-*'],
  [/^\s*font-size\s*:/, /(?<![\w.-])\d+(?:\.\d+)?px\b/, 'font-size', '--text-*'],
  [/^\s*(?:padding|margin|gap|row-gap|column-gap)(?:-[\w-]+)?\s*:/, /(?<![\w.-])\d+(?:\.\d+)?px\b/, 'spacing', '--space-*'],
  [/^\s*border(?:-(?:top|right|bottom|left|block|inline)(?:-\w+)?)?(?:-width)?\s*:/, /(?<![\w.-])\d+(?:\.\d+)?px\b/, 'border width', '--edge / --edge-2'],
  [/^\s*(?:transition|animation)(?:-duration)?\s*:/, /(?<![\w.-])[\d.]+m?s\b/, 'motion', '--motion-*'],
  [/^\s*font(?:-family)?\s*:/, /\b(?:Menlo|Consolas|Roboto|ui-monospace|system-ui|-apple-system|BlinkMacSystemFont|"Segoe UI"|'Segoe UI'|DejaVu)\b/, 'font stack', '--font-ui / --font-mono / --font-term'],
];
lines.forEach((line, i) => {
  if (/^\s*--[\w-]+\s*:/.test(line)) return; // a token definition — the one legal home
  for (const [prop, raw, what, use] of LOOK) {
    if (!prop.test(line)) continue;
    const value = line.slice(line.indexOf(':') + 1);
    if (raw.test(value)) {
      problems.push(`style.css:${i + 1} raw ${what} outside a token definition — use ${use}: ${line.trim()}`);
    }
    break;
  }
});

const firstRule = noComments.search(/^[^@\s/][^\n]*\{|^@media|^@layer\s+\w+\s*\{/m);
const decl = noComments.indexOf('@layer vendor, foundations, ui, app;');
if (decl === -1) problems.push('style.css does not declare `@layer vendor, foundations, ui, app;`');
else if (firstRule !== -1 && decl > firstRule) problems.push('the @layer order declaration must come before any rule');

const themeJs = fs.readFileSync(path.join(PUB, 'js', 'theme.js'), 'utf8');
for (const m of themeJs.matchAll(/v\('(--term-[\w-]+)'\)/g)) {
  if (!css.includes(`${m[1]}:`)) problems.push(`js/theme.js reads ${m[1]}, which style.css never defines`);
}

const appBody = block(noComments, '@layer app');
const foundationsBody = block(noComments, '@layer foundations');
if (!appBody || !foundationsBody) {
  problems.push('could not find the @layer app / @layer foundations blocks');
} else {
  const appOffset = noComments.indexOf(appBody);
  const lineOf = (idx) => noComments.slice(0, appOffset + idx).split('\n').length;
  for (const m of appBody.matchAll(/(^|[}{;])([^{}]*?)\{/g)) {
    const sel = m[2].trim();
    if (!sel || sel.startsWith('@')) continue;
    if (/\.ui-[\w-]+|#toast\b|\.helpbox\b/.test(sel)) {
      problems.push(`style.css:${lineOf(m.index)} app-layer rule selects a primitive (${sel.slice(0, 60)}) — extend your own class instead`);
    }
  }
  const foundationTokens = new Set([...foundationsBody.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const m of appBody.matchAll(/(--[\w-]+)\s*:/g)) {
    if (foundationTokens.has(m[1])) {
      problems.push(`style.css:${lineOf(m.index)} app-layer rule redefines foundation token ${m[1]}`);
    }
  }
}

const definedTokens = new Set();
const strippedSheets = new Map();
for (const file of shippedPaths) {
  const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  strippedSheets.set(file, text);
  for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) definedTokens.add(m[1]);
}
for (const [file, text] of strippedSheets) {
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
      if (!definedTokens.has(m[1])) problems.push(`${path.relative(ROOT, file)}:${i + 1} reads ${m[1]}, which nothing defines`);
    }
  });
}

function tokensOf(body) {
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const rootBody = block(foundationsBody, ':root');
const lightBody = block(foundationsBody, ":root[data-theme='light']");
const darkTokens = tokensOf(rootBody);
const lightTokens = { ...darkTokens, ...tokensOf(lightBody) };
function rgbOf(value, toks, depth = 0) {
  if (!value || depth > 4) return null;
  value = value.trim();
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  if (ref) return rgbOf(toks[ref[1]] ?? '', toks, depth + 1);
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%,\s*([^,]+?)\)$/.exec(value);
  if (mix) {
    const a = rgbOf(mix[1], toks, depth + 1);
    const b = rgbOf(mix[3], toks, depth + 1);
    if (!a || !b) return null;
    const p = Number(mix[2]) / 100;
    return a.map((c, i) => c * p + b[i] * (1 - p));
  }
  return null;
}
function luminance(value, toks) {
  const rgb = rgbOf(value, toks);
  if (!rgb) return null;
  const lin = (c) => ((c /= 255), c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = rgb.map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(fg, bg, toks) {
  const a = luminance(toks[fg] ?? '', toks);
  const b = luminance(toks[bg] ?? '', toks);
  if (a === null || b === null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
const FLOOR = [
  ['--fg', '--bg', 7], ['--fg', '--bg-2', 7], ['--fg', '--panel', 7], ['--fg', '--raise', 7], ['--fg', '--well', 7],
  ['--fg-strong', '--panel', 7], ['--fg-strong', '--raise', 7], ['--fg-strong', '--well', 7],
  ['--muted', '--bg', 3.5], ['--muted', '--panel', 3.5], ['--muted-2', '--panel', 4.5],
  ['--accent', '--bg', 3], ['--warn', '--bg', 3], ['--bad', '--bg', 3], ['--bad-soft', '--bg', 3],
  ['--info', '--bg', 3], ['--ok', '--bg', 3],
  ['--on-accent', '--accent', 4.5], ['--on-strong', '--action', 4.5],
  ['--on-strong', '--kaki', 3], // the メ fill — 21px bold, large-text tier
  ['--bad-fg', '--bad-ground', 7], ['--affirm-fg', '--affirm-bg', 7],
  ['--cowork-head-fg', '--cowork-head-bg', 7], ['--cowork-head-muted', '--cowork-head-bg', 4.5],
  ['--cowork-head-attention', '--cowork-head-bg', 4.5],
  ['--term-fg', '--term-bg', 7], ['--term-tape-fg', '--term-tape-bg', 7], ['--term-input-fg', '--term-well', 7],
];
for (const [name, toks] of [['dark', darkTokens], ['light', lightTokens]]) {
  for (const [fg, bg, floor] of FLOOR) {
    const r = ratio(fg, bg, toks);
    if (r === null) problems.push(`${name}: cannot compute ${fg} on ${bg} — token missing or not a hex`);
    else if (r < floor) problems.push(`${name}: ${fg} on ${bg} is ${r.toFixed(2)}:1, floor ${floor}:1`);
  }
}

console.log(`check-css: ${shippedPaths.map((file) => path.relative(ROOT, file)).join(', ')}, ${FLOOR.length * 2} contrast pairs`);
if (problems.length) {
  for (const p of problems) console.log('  ✗ ' + p);
  console.log(`\nFAILED — ${problems.length} problem(s). Colour lives in tokens; primitives and tokens are the gate's to guard.`);
  process.exit(1);
}
console.log('  ok — colours in tokens only, layer order declared, app patches nothing it must not, terminal tokens complete, contrast floor holds in both themes');
