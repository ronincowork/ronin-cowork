#!/usr/bin/env node
/**
 * Screen-recorder prototype (terminal view ONLY — no claude internals, ever).
 * A camera on the pane: samples `capture-pane -p` on an interval and extracts the
 * lines that scroll through, building an append-only recording ("the tape").
 *
 * Extraction: for each frame, find the vertical shift k (content moving UP by k
 * rows) that best aligns the previous frame with the current one; the bottom k rows
 * are new content → append to the tape. k=0 means in-place repaint only (spinner,
 * input-box typing) → nothing appended, which is precisely what scrubs the
 * input box and status chrome out of the recording.
 *
 * Measures against a deterministic workload (claude counting 1..80): how many of
 * the expected lines land on the tape, in order, and how much junk rides along.
 *
 * Usage: node scripts/proto-recorder.mjs [--keep]
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SES = 'recproto';
const COLS = 100;
const ROWS = 30;
const INTERVAL = 400; // ms between samples
const KEEP = process.argv.includes('--keep');

const tmux = (...a) => pexec('tmux', a, { maxBuffer: 32 * 1024 * 1024 });

async function frame() {
  const { stdout } = await tmux('capture-pane', '-p', '-t', SES);
  const lines = stdout.replace(/\n$/, '').split('\n').map((l) => l.replace(/\s+$/, ''));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

/** Best upward shift k aligning prev -> cur (cur[i] == prev[i+k]); -1 if no fit. */
function bestShift(prev, cur) {
  let best = -1;
  let bestScore = 0;
  const max = Math.min(prev.length, ROWS);
  for (let k = 0; k <= max; k++) {
    let match = 0;
    let total = 0;
    for (let i = 0; i + k < prev.length && i < cur.length; i++) {
      total++;
      if (cur[i] === prev[i + k]) match++;
    }
    if (!total) continue;
    const score = match / total;
    // prefer the smallest k that explains the frame well
    if (score > 0.6 && score > bestScore + 0.001) {
      best = k;
      bestScore = score;
    }
    if (bestScore > 0.95 && best >= 0) break;
  }
  return best;
}

async function ensureClaude() {
  try {
    await tmux('kill-session', '-t', SES);
  } catch {}
  await tmux('new-session', '-d', '-s', SES, '-x', String(COLS), '-y', String(ROWS), '-c', process.env.HOME + '/tmux-ronin');
  await tmux('send-keys', '-t', SES, '-l', 'claude');
  await tmux('send-keys', '-t', SES, 'Enter');
  for (let i = 0; i < 50; i++) {
    await sleep(500);
    const f = await frame();
    if (f.join('\n').length > 200 && /[╭╰>❯]/.test(f.join('\n'))) break;
  }
  await sleep(2000);
}

async function main() {
  console.log(`recorder prototype: sampling every ${INTERVAL}ms, terminal surface only`);
  await ensureClaude();

  const tape = [];
  let prev = await frame();
  let samples = 0;
  let repaintOnly = 0;
  let noFit = 0;

  // kick off the deterministic workload
  await tmux('send-keys', '-t', SES, '-l', '--', 'Count from 1 to 80, one number per line, no other text.');
  await sleep(200);
  await tmux('send-keys', '-t', SES, 'Enter');

  const END = Date.now() + 45000;
  while (Date.now() < END) {
    await sleep(INTERVAL);
    const cur = await frame();
    samples++;
    const k = bestShift(prev, cur);
    if (k < 0) {
      noFit++; // full repaint we couldn't align — v0 drops it (measure how often)
    } else if (k === 0) {
      repaintOnly++; // spinner / input-box typing — nothing scrolled, nothing taped
    } else {
      // content scrolled up by k: the top k rows of PREV left the aligned window —
      // those are settled history. Tape them.
      for (let i = 0; i < k && i < prev.length; i++) tape.push(prev[i]);
    }
    prev = cur;
  }

  // measure against expectation
  const tapeText = tape.join('\n');
  let inOrder = 0;
  let pos = 0;
  for (let n = 1; n <= 80; n++) {
    const re = new RegExp(`(^|\\D)${n}(\\D|$)`);
    const idx = tape.slice(pos).findIndex((l) => re.test(l));
    if (idx >= 0) {
      inOrder++;
      pos += idx;
    }
  }
  const boxJunk = tape.filter((l) => /[╭╰│]|bypass permissions|esc to interrupt/.test(l)).length;

  console.log(`\nsamples: ${samples} (repaint-only: ${repaintOnly}, unaligned: ${noFit})`);
  console.log(`tape length: ${tape.length} lines`);
  console.log(`expected numbers found in order: ${inOrder}/80`);
  console.log(`input-box/chrome junk lines on tape: ${boxJunk}`);
  console.log('\n--- tape tail (last 30 lines) ---');
  console.log(tape.slice(-30).join('\n'));

  if (!KEEP) await tmux('kill-session', '-t', SES).catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
