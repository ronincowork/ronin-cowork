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
    if (/^(?:ba|z|k|da|fi)?sh$/.test(proc)) {
      fail(`${id} — the tile's process is \`${proc}\`. A shell in the tile is something a machine can type at.`);
    } else if (parked) {
      ok(`${id} — running \`${proc}\`, brief parked on the shelf (this vendor takes no initial prompt)`);
    } else if (!start.includes('RONIN-ACCEPTANCE')) {
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
