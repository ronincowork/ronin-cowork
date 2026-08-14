#!/usr/bin/env node
/**
 * stores-map — DAIKUSAN's map of Ronin's own directories, generated from the store table.
 *
 *   node scripts/stores-map.mjs          # check: is the map current? (runs in `npm run verify`)
 *   node scripts/stores-map.mjs --write  # regenerate it
 *
 * WHY. DAIKUSAN.md held the store list in THREE hand-maintained places — the `~/` map, the
 * "Ronin's own data" tree, and the created-by table — and all three had gone stale within
 * hours of a store being added: the `config` store landed and appeared in none of them,
 * while the map's own opening line promised "everywhere it puts a file". A document
 * restating a table from memory diverges; that is not carelessness, it is what copies do.
 *
 * So `src/stores.ts` owns it and this writes it out. Everything rendered here comes from
 * the table: the ids, the roots, `what`, `createdBy` and `when`.
 *
 * THE PATHS ARE THE DEFAULTS, NEVER THIS MACHINE'S. A doc that renders differently per box
 * is exactly what JUSHO exists to stop, so the roots come from `ROOT_REL`, not `rootDir()`.
 * That is also why this script contains no path literal of its own — `check-place` scans it
 * like anything else in `scripts/`.
 *
 * The blocks are delimited by HTML comments in DAIKUSAN.md. Prose outside them is written
 * by hand and never touched: the generator owns the list, a person owns the argument.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DOC = path.join(REPO, 'DAIKUSAN.md');
const WRITE = process.argv.includes('--write');

const { STORES, ROOT_REL } = await tsImport('../src/stores.ts', import.meta.url);

const of = (root) => STORES.filter((s) => s.root === root);
const home = (root) => `~/${ROOT_REL[root]}`;
/** Last entry gets the corner, everything else a tee. */
const branch = (i, n) => (i === n - 1 ? '└──' : '├──');

/** Wrap `what` under a fixed left margin so a long one does not run off the block. */
function wrapped(text, indent, width = 96) {
  const out = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && (indent + line.length + 1 + word.length) > width) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/** BLOCK 1 — the compact subtree inside the `~/` map. Directories only: the descriptions
 *  live in block 2, and saying it twice is the habit this whole script replaces. */
function treeBlock() {
  const lines = [];
  for (const [root, label] of [
    ['user', 'ronin_user_root — THEIRS. Uninstall LEAVES it.'],
    ['data', 'ronin_data_root — OURS. Uninstall DELETES it.'],
  ]) {
    const mine = of(root);
    lines.push(`├── ${(ROOT_REL[root] + '/').padEnd(17)}${label}`);
    mine.forEach((s, i) => lines.push(`│   ${branch(i, mine.length)} ${s.rel}/`));
    lines.push('│');
  }
  return lines.join('\n');
}

/** BLOCK 2 — the annotated tree: every store, what it holds. */
function dataBlock() {
  const out = [];
  for (const [root, label] of [
    ['user', 'THEIRS — uninstall leaves it'],
    ['data', 'OURS — uninstall deletes it, and nothing of theirs goes with it'],
  ]) {
    const mine = of(root);
    out.push(`${(root === 'user' ? 'ronin_user_root' : 'ronin_data_root').padEnd(17)}${home(root).padEnd(12)}${label}`);
    mine.forEach((s, i) => {
      const head = `${branch(i, mine.length)} ${s.rel}/`.padEnd(29);
      const [first, ...rest] = wrapped(s.what, 29);
      out.push(head + first);
      for (const r of rest) out.push(' '.repeat(29) + r);
    });
    out.push('');
  }
  return out.join('\n').trimEnd();
}

/** BLOCK 3 — the created-by table's rows. A repo holds code, never data: each store is
 *  made by the code that needs it, the first time it needs it. */
function createdBlock() {
  return STORES.map((s) => `| \`${s.id}\` store | ${s.createdBy} | ${s.when} |`).join('\n');
}

const BLOCKS = {
  'stores:tree': treeBlock,
  'stores:data': dataBlock,
  'stores:created': createdBlock,
};

// DAIKUSAN.md is the document this generates INTO, and it has not been screened into
// the free build yet (MIGRATION_MANIFEST §12, the docs/ row). No document, nothing to
// generate or check — SKIP with the reason, never a crash and never a silent pass.
if (!existsSync(DOC)) {
  console.log('stores-map: SKIP — DAIKUSAN.md is not in this tree (the map has no page here yet).');
  process.exit(0);
}

let doc = readFileSync(DOC, 'utf8');
const stale = [];

for (const [name, render] of Object.entries(BLOCKS)) {
  const re = new RegExp(`(<!-- ${name} start -->\\n)([\\s\\S]*?)(<!-- ${name} end -->)`);
  const m = re.exec(doc);
  if (!m) {
    console.error(`  FAIL  DAIKUSAN.md has no <!-- ${name} start/end --> markers`);
    process.exit(1);
  }
  const want = render() + '\n';
  if (m[2] !== want) {
    stale.push(name);
    doc = doc.replace(re, `$1${want}$3`);
  }
}

if (WRITE) {
  writeFileSync(DOC, doc);
  console.log(stale.length ? `stores-map: regenerated ${stale.join(', ')}` : 'stores-map: already current');
  process.exit(0);
}

if (stale.length) {
  console.error(
    `\n  FAIL  DAIKUSAN.md is out of date with the store table: ${stale.join(', ')}\n` +
      `        The table in src/stores.ts is the source. Run:  node scripts/stores-map.mjs --write\n`,
  );
  process.exit(1);
}
console.log(`  ok    DAIKUSAN's map matches the store table (${STORES.length} stores)`);
