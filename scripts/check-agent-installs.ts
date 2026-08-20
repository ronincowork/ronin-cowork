/**
 * THE CLEAN-ROOM PROOF — every `get` line yields its command, from nothing.
 *
 *   npx tsx scripts/check-agent-installs.ts
 *
 * THE BAR IS A BARE BOX (owner, 2026-08-20). Ronin's install operation is built for
 * someone who has NOTHING, so our own box's state proves nothing about theirs: "gemini
 * was already installed here" is not evidence that `npm install -g @google/gemini-cli`
 * works on a stranger's machine. Every agent on the list has to install THROUGH the
 * operation from nothing, per agent, rather than be believed because the package name
 * looks right.
 *
 * This is that proof, in the one shape that does not disturb a live box: each agent's
 * `get` line — read from `src/agents.ts`, never retyped, because that is the single
 * source — is run against a THROWAWAY npm prefix, and then the box is asked whether the
 * agent's `cmd` now exists INSIDE that prefix. The probe's PATH is the throwaway bin
 * directory and nothing else, so a copy that was already on this machine can never
 * answer for a line that does not work. Nothing here uninstalls anything, and nothing
 * here writes outside the temporary directory it removes on the way out.
 *
 * A PARKED AGENT PASSES. An empty `get` means Ronin has no command for it, and then
 * `parked` carries the sentence every surface shows instead of an offer. That is a
 * finished, honest state — the failure this gate exists to catch is a line that CLAIMS
 * to install something and does not.
 *
 * NOT IN `npm run verify`, deliberately. It reaches the network and takes tens of
 * seconds per agent, and a gate that needs the internet turns a broken wire into a
 * broken build. It is a RELEASE-TIME check: run it when a `get` line changes, and before
 * cutting a release that carries one.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENTS } from '../src/agents.js';

const run = promisify(execFile);
const root = mkdtempSync(path.join(os.tmpdir(), 'ronin-agent-proof-'));
let failed = 0;

/** One argument, safe in every POSIX shell. */
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

async function proveOne(a: (typeof AGENTS)[number]): Promise<void> {
  if (!a.get) {
    console.log(`  ok    ${a.id} — parked, and the row says why: ${a.parked}`);
    return;
  }
  const prefix = path.join(root, a.id);
  mkdirSync(prefix, { recursive: true });
  // The operation's own preamble (src/agent-install.ts), with the prefix swapped for a
  // throwaway one. Same shape, so what is proven here is what actually runs there.
  const line = `export npm_config_prefix=${q(prefix)}; export PATH="$PATH:${prefix}/bin"; ${a.get}`;
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
    // PATH is the throwaway prefix ALONE. This is the whole point of the gate.
    const { stdout } = await run('bash', ['-c', `PATH=${q(path.join(prefix, 'bin'))} command -v ${a.cmd}`]);
    where = stdout.trim();
  } catch {
    /* absent — reported below */
  }
  if (!where) {
    console.error(`  FAIL  ${a.id} — its get line ran but left no \`${a.cmd}\` command. Park it, or fix the line.`);
    failed++;
    return;
  }
  let says = '';
  try {
    const { stdout } = await run('bash', ['-c', `PATH=${q(path.join(prefix, 'bin'))}:"$PATH" ${a.cmd} --version`], { timeout: 120_000 });
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
