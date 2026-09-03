import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENTS } from '../src/agents.js';

const run = promisify(execFile);
const root = mkdtempSync(path.join(os.tmpdir(), 'ronin-agent-proof-'));
let failed = 0;

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

async function proveOne(a: (typeof AGENTS)[number]): Promise<void> {
  if (!a.operations.install) {
    console.log(`  ok    ${a.id} — parked, and the row says why: ${a.parked}`);
    return;
  }
  const prefix = path.join(root, a.id);
  mkdirSync(prefix, { recursive: true });
  const line = `export npm_config_prefix=${q(prefix)}; export PATH="$PATH:${prefix}/bin"; ${a.operations.install}`;
  const began = Date.now();
  try {
    await run('bash', ['-lc', line], { timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    console.error(`  FAIL  ${a.id} — its get line did not complete: ${String((e as Error).message).split('\n')[0]}`);
    failed++;
    return;
  }
  let where = '';
  try {
    const { stdout } = await run('bash', ['-c', `PATH=${q(path.join(prefix, 'bin'))} command -v ${a.cmd}`]);
    where = stdout.trim();
  } catch {
  }
  if (!where) {
    console.error(`  FAIL  ${a.id} — its get line ran but left no \`${a.cmd}\` command. Park it, or fix the line.`);
    failed++;
    return;
  }
  let says = '';
  try {
    const version = a.operations.version.map(q).join(' ');
    const { stdout } = await run('bash', ['-c', `PATH=${q(path.join(prefix, 'bin'))}:"$PATH" ${a.cmd} ${version}`], { timeout: 120_000 });
    says = stdout.trim().split('\n')[0].slice(0, 40);
  } catch {
    says = 'installed, but --version did not answer';
  }
  console.log(`  ok    ${a.id} — ${Math.round((Date.now() - began) / 1000)}s, ${says}`);
}

console.log(`check-agent-installs: ${AGENTS.length} agent(s), each into a throwaway prefix`);
try {
  for (const a of AGENTS) await proveOne(a);
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (failed) {
  console.error(`\nFAILED — ${failed} get line(s) do not yield their command. A bare box would be stuck.`);
  process.exit(1);
}
console.log('\ncheck-agent-installs: every line yields its command, or is parked and says so.');
