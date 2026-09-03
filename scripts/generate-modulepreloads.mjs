#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'public');
const found = new Set();
const imports = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
function visit(file) {
  const relative = path.relative(base, file).replaceAll(path.sep, '/');
  if (found.has(relative)) return;
  found.add(relative);
  for (const match of fs.readFileSync(file, 'utf8').matchAll(imports)) {
    if (match[1].startsWith('.')) visit(path.resolve(path.dirname(file), match[1]));
  }
}
visit(path.join(base, 'js/main.js'));
const file = path.join(base, 'index.html');
const html = fs.readFileSync(file, 'utf8');
const start = '    <!-- modulepreloads:start -->';
const finish = '    <!-- modulepreloads:end -->';
const links = [...found].sort().map((name) => `    <link rel="modulepreload" href="/__RONIN_ASSET_VERSION__/${name}" />`).join('\n');
const block = `${start}\n${links}\n${finish}`;
fs.writeFileSync(file, html.includes(start) ? html.replace(new RegExp(`${start}[\\s\\S]*?${finish}`), block) : html.replace('  </head>', `${block}\n  </head>`));
console.log(`wrote ${found.size} modulepreloads`);
