/**
 * THE ACCEPTANCE TEST — the machine typed nothing.
 *
 *   npx tsx scripts/check-launch-ready.ts
 *
 * Every installed vendor is launched into a directory it has never seen — which is what
 * provokes a first-run trust dialog, the screen that started all of this — and three
 * things are asserted about the session that comes back:
 *
 *   1. THE PROCESS IS THE VENDOR, not a shell. If a shell is in the tile then a machine
 *      can type at it, and everything else here is decoration.
 *   2. THE BRIEF IS ON ITS ARGV, so the agent was born already holding it. Nothing was
 *      sent, because there was nothing to send it to.
 *   3. A DEAD CLI STAYS READABLE. `remain-on-exit` means its last screen is frozen under
 *      the session's own name instead of a live shell wearing it.
 *
 * It would have failed on the build that typed briefs: there, the pane's process was the
 * login shell by construction and the brief arrived as keystrokes.
 *
 * NOT IN `npm run verify` — it needs a live tmux server and launches real agent CLIs, the
 * same standing as `scripts/check-agent-installs.ts`. Run it when tmux.ts, launch.ts or a
 * vendor's `initial` changes.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENTS, launchArgv, listAgentAvailability } from '../src/agents.js';
import { createSession, exactPane, killSessionTree, sessionExists } from '../src/tmux.js';

const pexec = promisify(execFile);
let failed = 0;
const fail = (m: string) => { console.error(`  FAIL  ${m}`); failed++; };
const ok = (m: string) => console.log(`  ok    ${m}`);
const tmux = async (...a: string[]) => (await pexec('tmux', a)).stdout.trim();

const BRIEF = 'RONIN-ACCEPTANCE do not act on this; the run is over. $(echo hi) `date` "q" & ;';

async function walk(id: string, cmd: string) {
  const name = `launchready_${id}`;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ronin-launchready-'));
  if (await sessionExists(name)) await killSessionTree(name);
  const { argv, parked } = await launchArgv(cmd, BRIEF);
  if (!argv.length) return fail(`${id} — could not resolve a binary to run; a launch would have failed`);
  await createSession(name, dir, { agent: true, exempt: true, argv });
  try {
    const proc = await tmux('display-message', '-p', '-t', exactPane(name), '#{pane_current_command}');
    const start = await tmux('display-message', '-p', '-t', exactPane(name), '#{pane_start_command}');
    // 1 · no shell in the tile
    if (/^(?:ba|z|k|da|fi)?sh$/.test(proc)) {
      fail(`${id} — the tile's process is \`${proc}\`. A shell in the tile is something a machine can type at.`);
    } else if (parked) {
      ok(`${id} — running \`${proc}\`, brief parked on the shelf (this vendor takes no initial prompt)`);
    } else if (!start.includes('RONIN-ACCEPTANCE')) {
      // 2 · the brief rode argv
      fail(`${id} — the brief is not on the process's argv, so it was never handed over`);
    } else {
      ok(`${id} — the tile IS \`${proc}\`, and its brief was on the command line at birth`);
    }
  } finally {
    await killSessionTree(name);
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('check-launch-ready: the machine typed nothing');

/* 3 · a dead CLI stays readable, and takes nothing with it */
{
  const name = 'launchready_dead';
  if (await sessionExists(name)) await killSessionTree(name);
  await createSession(name, undefined, { agent: true, exempt: true, argv: ['/bin/false'] });
  await new Promise((r) => setTimeout(r, 800));
  if (!(await sessionExists(name))) fail('a CLI that dies at once took its session with it — its story is unreadable');
  else {
    const dead = await tmux('display-message', '-p', '-t', exactPane(name), '#{pane_dead}');
    if (dead === '1') ok('a CLI that dies at once leaves its screen frozen and readable, not a live shell');
    else fail(`a dead CLI's pane reports pane_dead=${dead}; something is still running in the tile`);
    await killSessionTree(name);
  }
}

const installed = (await listAgentAvailability()).filter((a) => a.installed);
if (!installed.length) console.log('  --    no agent installed on this box; the walk has nothing to do');
for (const a of installed) await walk(a.id, AGENTS.find((x) => x.id === a.id)!.cmd);

if (failed) {
  console.error(`\nFAILED — ${failed} check(s). Something in a tile could still be typed at.`);
  process.exit(1);
}
console.log('\ncheck-launch-ready: every tile was the vendor itself, holding its brief. Nothing was typed.');
