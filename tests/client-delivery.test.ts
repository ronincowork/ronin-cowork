import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
const base = path.resolve('public');
const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
const preloads = new Set([...html.matchAll(/rel="modulepreload" href="\/__RONIN_ASSET_VERSION__\/([^"?]+)"/g)].map((m) => m[1]));
const imports = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
test('the complete main module graph is preloaded', () => {
  const seen = new Set<string>();
  const visit = (relative: string) => {
    if (seen.has(relative)) return;
    seen.add(relative);
    assert.ok(preloads.has(relative), `${relative} is imported but not modulepreloaded`);
    for (const match of fs.readFileSync(path.join(base, relative), 'utf8').matchAll(imports)) {
      if (match[1].startsWith('.')) visit(path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1])));
    }
  };
  visit('js/main.js');
  assert.equal(preloads.size, seen.size, 'index.html has stale modulepreloads');
});
