#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TOOL = path.join(REPO, 'bin', 'ronin-store');

let failed = 0;
const fail = (msg) => { console.error(`  FAIL  ${msg}`); failed++; };
const ok = (msg) => console.log(`  ok    ${msg}`);

const { STORES, resolveStore, envName } = await tsImport('../src/stores.ts', import.meta.url);

const ALL_KNOBS = [
  'RONIN_USER_ROOT',
  'RONIN_DATA_ROOT',
  ...STORES.map((s) => envName(s.id)),
];

function bashAll(env) {
  const out = execFileSync(TOOL, ['--all'], { encoding: 'utf8', env });
  const rows = {};
  for (const line of out.trim().split('\n').slice(1)) {
    const [id, root, source, , dir] = line.trim().split(/\s+/);
    rows[id] = { root, source, dir };
  }
  return rows;
}

function tsAll(env) {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, env);
  try {
    return Object.fromEntries(STORES.map((s) => [s.id, resolveStore(s.id)]));
  } finally {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

const base = () => {
  const e = { ...process.env };
  for (const k of ALL_KNOBS) delete e[k];
  return e;
};

const FRESH = '/tmp/ronin-check-stores-fresh';   // a home directory with nothing in it

const CASES = [
  ['this box, as it is', base()],
  ['a fresh box — nothing on disk', { ...base(), HOME: FRESH }],
  ['both roots moved', { ...base(), HOME: FRESH, RONIN_USER_ROOT: '/srv/u', RONIN_DATA_ROOT: '/srv/d' }],
  ...STORES.map((s) => [
    `canonical override ${envName(s.id)}`,
    { ...base(), HOME: FRESH, [envName(s.id)]: `/srv/canonical-${s.id}` },
  ]),
];

for (const [label, env] of CASES) {
  const bash = bashAll(env);
  const ts = tsAll(env);
  const bad = [];
  for (const s of STORES) {
    const b = bash[s.id];
    const t = ts[s.id];
    if (!b) { bad.push(`${s.id}: bin/ronin-store does not know it`); continue; }
    if (b.dir !== t.dir) bad.push(`${s.id}: bash '${b.dir}' vs ts '${t.dir}'`);
    else if (b.source !== t.source) bad.push(`${s.id}: source bash '${b.source}' vs ts '${t.source}'`);
  }
  if (bad.length) fail(`${label}\n         ` + bad.join('\n         '));
  else ok(`${label} — ${STORES.length} stores agree`);
}

const known = Object.keys(bashAll({ ...base(), HOME: FRESH }));
const extra = known.filter((id) => !STORES.some((s) => s.id === id));
if (extra.length) fail(`bin/ronin-store has rows src/stores.ts does not: ${extra.join(', ')}`);
else ok('both tables carry the same rows');

for (const s of STORES) {
  if (!/^[a-z][a-z0-9_]*$/.test(s.id)) fail(`store id '${s.id}' is not a lowercase slug (letters, digits, underscore)`);
  if (envName(s.id) !== `RONIN_${s.id.toUpperCase()}_DIR`) fail(`${s.id}: override is not RONIN_<ID>_DIR`);
  if (!['user', 'data'].includes(s.root)) fail(`${s.id}: root '${s.root}' is neither user nor data`);
}
if (new Set(STORES.map((s) => s.id)).size !== STORES.length) fail('duplicate store id');
if (!failed) ok('ids are slugs, roots are user|data, overrides are RONIN_<ID>_DIR');

console.log('');
if (failed) {
  console.error(`check-stores: ${failed} failure(s) — the two bindings of the store table disagree.\n`);
  process.exit(1);
}
console.log('check-stores: the store table resolves identically in TypeScript and bash.\n');
