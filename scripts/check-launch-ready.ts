/**
 * THE ACCEPTANCE TEST — a launch reaches a ready agent, or fails loudly. Never a brief
 * typed at a shell prompt.
 *
 *   npx tsx scripts/check-launch-ready.ts
 *
 * The defect this asserts against was measured, not imagined: a seat launched into a
 * directory codex had never seen, codex raised its trust dialog and then died, bash came
 * back, the readiness gate read that shell prompt as "ready", and the brief was typed into
 * the shell. The session looked completely alive and had been told nothing
 * (wip/buildouts/LAUNCH_READY.md).
 *
 * TWO PARTS, and the first is the one that must never regress:
 *
 *   1. THE PIN. A session running a command that exits at once leaves nothing but a shell
 *      prompt. `waitReadyForBrief` must answer `gone` — immediately, not after a timeout —
 *      and must never answer `ready`. Deterministic, seconds, no agent involved.
 *   2. THE WALK. Every INSTALLED agent, launched into a directory it has never seen, which
 *      is what provokes a vendor's trust dialog. Each one must end at its own prompt
 *      (`ready`), at a dialog (`asking` — a person is being waited for, which is correct
 *      behaviour at any duration), or `gone`. What it may NEVER do is answer `ready` while
 *      the pane is showing a shell prompt, and that cross-check is the assertion.
 *
 * NOT IN `npm run verify`. It needs a live tmux server and it launches real agent CLIs, so
 * it is release-time, the same standing as `scripts/check-agent-installs.ts`. Run it when
 * status.ts, launch.ts or an agent's `screen` rows change.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENTS, listAgentAvailability } from '../src/agents.js';
import { agentPresence, waitReadyForBrief } from '../src/status.js';
import { runCommand } from '../src/send.js';
import { capturePane, createSession, killSessionTree, sessionExists } from '../src/tmux.js';

let failed = 0;
const fail = (m: string) => { console.error(`  FAIL  ${m}`); failed++; };
const ok = (m: string) => console.log(`  ok    ${m}`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A session in a directory nothing has ever run in — what provokes a trust dialog. */
async function inFreshDir(name: string, cmd: string, quietMs: number) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ronin-launchready-'));
  if (await sessionExists(name)) await killSessionTree(name);
  await createSession(name, dir, { agent: false });
  await runCommand(name, cmd);
  const seen = await waitReadyForBrief(name, cmd.split(/\s+/)[0], { quietMs, heldMs: quietMs });
  const pane = await capturePane(name, 0).catch(() => '');
  await killSessionTree(name);
  rmSync(dir, { recursive: true, force: true });
  return { ...seen, pane };
}

console.log('check-launch-ready: the brief is never typed at a shell prompt');

/* 1 · the pin */
{
  const r = await inFreshDir('launchready_pin', 'true', 20_000);
  if (r.ready) fail('a command that exits at once was reported READY — the brief would go into bash');
  else if (!r.gone) fail(`a command that exits at once was not reported gone (held=${r.held})`);
  else ok('a dead command is `gone`, not `ready` — the measured defect cannot recur');
}

/* 2 · the walk */
const installed = (await listAgentAvailability()).filter((a) => a.installed);
if (!installed.length) console.log('  --    no agent installed on this box; the walk has nothing to do');
for (const a of installed) {
  const spec = AGENTS.find((x) => x.id === a.id)!;
  const r = await inFreshDir(`launchready_${a.id}`, spec.cmd, 45_000);
  // THE ONE ASSERTION, and it is the whole defect class: readiness may never be a shell
  // prompt. Everything else is REPORTED, because "a loud failure" is a pass by definition
  // — the acceptance is that a brief is never typed at something that is not listening,
  // not that every vendor comes up on every box.
  if (r.ready && agentPresence(r.pane) === 'gone') {
    fail(`${a.id} — reported READY while the tile was showing a shell prompt. This is the bug.`);
  } else if (r.ready) {
    ok(`${a.id} — reached its own prompt`);
  } else if (r.gone) {
    ok(`${a.id} — gone, and said so: a shell prompt where the agent should be`);
  } else if (r.held) {
    ok(`${a.id} — asking, and the tile says so. A person is being waited for, which is correct at any duration`);
  } else {
    // Not ready, not gone, no dialog recognised — so its screen is one nobody has read.
    // The gate still held the brief and still wrote a rung, which is the contract; what is
    // missing is only the better sentence. `AGENTS[].screen` is where that would go.
    ok(`${a.id} — screen not recognised, so the brief was held and a gate written. Its rows in AGENTS[].screen are empty; reading its screen would upgrade this to "asking"`);
  }
  await wait(500);
}

if (failed) {
  console.error(`\nFAILED — ${failed} check(s). A brief could be typed at something that is not listening.`);
  process.exit(1);
}
console.log('\ncheck-launch-ready: every launch ended at an agent, a dialog, or a loud failure.');
