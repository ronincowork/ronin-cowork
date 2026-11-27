#!/usr/bin/env node
// npm run tokens -- <checkout>...  — copies public/tokens.css, Ronin's one palette, over every copy
// found in the checkouts named (ronin-site, ronin-shiwake, lounge-ui), each copy keeping its own
// header, and says which files changed. It only writes files: each repo's own team commits them.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'public/tokens.css'), 'utf8').replace(/\n*$/, '\n');
const commit = execFileSync('git', ['-C', root, 'log', '-1', '--format=%h', '--', 'public/tokens.css'], { encoding: 'utf8' }).trim();

/** Replace what lies between `start` (kept) and the next `end` (kept) with `body`. */
const between = (start, end, body) => (text) => {
  const a = text.indexOf(start);
  const b = a < 0 ? -1 : text.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`no ${JSON.stringify(start)} … ${JSON.stringify(end)} in it`);
  return text.slice(0, a + start.length) + body + text.slice(b);
};
const htmlStyle = between('/* copied from ronin-cowork public/tokens.css; change it there. */\n', '\n:root{color-scheme:', source.replace(/\n$/, ''));
const tsCopy = (text) => {
  // The .ts copies sit in a String.raw template: a backtick or ${ in the palette would end it.
  if (/`|\$\{/.test(source)) throw new Error('public/tokens.css has a backtick or ${, which a String.raw copy cannot hold');
  return between('const COPY = String.raw`', '`;', source.replace(/\n$/, ''))(text);
};

// Every copy, by its path inside its checkout, and how it is written.
const COPIES = [
  ['ronin-tokens.css', () => `/* COPY of ronin-cowork public/tokens.css (${commit}). Don't edit here: change it there, then copy it over this file. */\n${source}`],
  ['app/src/http/tokens.ts', tsCopy],
  ['deploy/caddy-errors/restarting.html', htmlStyle],
  ['deploy/oauth2-templates/error.html', htmlStyle],
  ['src/tokens.ts', tsCopy],
];

const checkouts = process.argv.slice(2);
if (!checkouts.length) {
  console.error('usage: npm run tokens -- <checkout>...   (ronin-site, ronin-shiwake, lounge-ui)');
  process.exit(2);
}
let failed = false;
for (const dir of checkouts) {
  let found = 0;
  for (const [rel, write] of COPIES) {
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) continue;
    found++;
    try {
      const was = fs.readFileSync(file, 'utf8');
      const now = write(was);
      if (now === was) console.log(`same     ${file}`);
      else { fs.writeFileSync(file, now); console.log(`changed  ${file}`); }
    } catch (error) {
      failed = true;
      console.log(`FAILED   ${file}: ${error.message}`);
    }
  }
  if (!found) { failed = true; console.log(`NONE     ${dir}: no palette copy in it`); }
}
process.exit(failed ? 1 : 0);
