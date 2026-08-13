#!/usr/bin/env node
/**
 * SCROLL V2 prototype harness (wip/handoffs/SCROLL_V2.md) — burn down the transport
 * question headlessly: can xterm.js own the scrollback if we seed it with
 * capture-pane and then feed it the pane's raw output stream?
 *
 * For each candidate transport:
 *   A. tmux pipe-pane -o  → FIFO → bytes
 *   B. tmux -C attach (control mode) → %output events → bytes
 * we: seed a headless xterm (@xterm/headless) with `capture-pane -e` + cursor
 * position, attach the stream, poke the REAL claude session (primary workload:
 * constant input-box repaints), then diff xterm's rendered viewport against
 * `capture-pane -p` ground truth. Fidelity = the streamed bytes reproduce the
 * same screen tmux itself renders. Also reports scrollback accumulation (the
 * whole point) and whether control-mode attach disturbs the window size.
 *
 * Usage: node scripts/proto-v2.mjs [--keep]   (--keep leaves the session running)
 */
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import headless from '@xterm/headless';

const { Terminal } = headless;
const pexec = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SES = 'v2proto';
const COLS = 100;
const ROWS = 30;
const KEEP = process.argv.includes('--keep');

const tmux = (...args) => pexec('tmux', args, { maxBuffer: 32 * 1024 * 1024 });

async function paneText(esc = false) {
  const args = ['capture-pane', '-p', '-t', SES];
  if (esc) args.push('-e');
  const { stdout } = await tmux(...args);
  return stdout.replace(/\n$/, '');
}

async function cursorPos() {
  const { stdout } = await tmux('display-message', '-p', '-t', SES, '#{cursor_x} #{cursor_y}');
  const [x, y] = stdout.trim().split(' ').map(Number);
  return { x: x || 0, y: y || 0 };
}

async function paneSize() {
  const { stdout } = await tmux('display-message', '-p', '-t', SES, '#{pane_width}x#{pane_height}');
  return stdout.trim();
}

function newTerm() {
  return new Terminal({ cols: COLS, rows: ROWS, scrollback: 10000, allowProposedApi: true });
}

const write = (term, data) => new Promise((r) => term.write(data, r));

/** Seed = clear + captured screen (with colors) + real cursor position. */
async function seedTerm(term) {
  const screen = await paneText(true);
  const { x, y } = await cursorPos();
  await write(term, '\x1b[2J\x1b[H' + screen.split('\n').join('\r\n') + `\x1b[${y + 1};${x + 1}H`);
}

/** xterm's current viewport as trimmed lines. */
function viewportLines(term) {
  const buf = term.buffer.active;
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    const line = buf.getLine(buf.baseY + r);
    out.push(line ? line.translateToString(true).replace(/\s+$/, '') : '');
  }
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

function normalize(text) {
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

function compare(label, term, truth) {
  const got = viewportLines(term);
  const want = normalize(truth);
  const n = Math.max(got.length, want.length);
  let same = 0;
  const diffs = [];
  for (let i = 0; i < n; i++) {
    if ((got[i] ?? '') === (want[i] ?? '')) same++;
    else diffs.push(i);
  }
  const pct = n ? Math.round((100 * same) / n) : 100;
  console.log(`\n[${label}] fidelity: ${same}/${n} viewport lines match (${pct}%)`);
  for (const i of diffs.slice(0, 6)) {
    console.log(`  line ${i}:\n    tmux : ${JSON.stringify((want[i] ?? '').slice(0, 90))}\n    xterm: ${JSON.stringify((got[i] ?? '').slice(0, 90))}`);
  }
  const buf = term.buffer.active;
  console.log(`[${label}] scrollback accumulated: baseY=${buf.baseY} lines (buffer len ${buf.length})`);
  return pct;
}

/** Poke the live claude UI so it repaints: type text, wait, Enter, wait. */
async function poke(text) {
  await tmux('send-keys', '-t', SES, '-l', '--', text);
  await sleep(400);
  await tmux('send-keys', '-t', SES, 'Enter');
}

async function ensureSession() {
  try {
    await tmux('has-session', '-t', `=${SES}`);
    console.log(`reusing existing ${SES} session`);
    return;
  } catch {
    /* create */
  }
  await tmux('new-session', '-d', '-s', SES, '-x', String(COLS), '-y', String(ROWS), '-c', process.env.HOME + '/tmux-ronin');
  await tmux('send-keys', '-t', SES, '-l', 'claude');
  await tmux('send-keys', '-t', SES, 'Enter');
  // wait for the claude TUI to paint (input-box border chars) — up to 25s
  for (let i = 0; i < 50; i++) {
    await sleep(500);
    const t = await paneText();
    if (/[╭╰>❯]/.test(t) && t.length > 200) {
      await sleep(2000); // let the UI settle
      return;
    }
  }
  throw new Error('claude UI did not appear in v2proto');
}

/* ---------- A: pipe-pane ---------- */
async function testPipePane() {
  console.log('\n=== A: pipe-pane -o → FIFO ===');
  const dir = mkdtempSync(path.join(tmpdir(), 'v2proto-'));
  const fifo = path.join(dir, 'stream');
  await pexec('mkfifo', [fifo]);

  const term = newTerm();
  let bytes = 0;
  // open the reader BEFORE pipe-pane so cat doesn't block/drop
  const rs = createReadStream(fifo);
  const fed = new Promise((resolve) => {
    rs.on('data', (d) => {
      bytes += d.length;
      term.write(d);
    });
    rs.on('end', resolve);
    rs.on('error', resolve);
  });
  await tmux('pipe-pane', '-t', SES, '-o', `cat > ${fifo}`);
  await seedTerm(term);

  await poke('Reply with exactly the word PONG42 and nothing else.');
  await sleep(15000); // let claude think + answer + repaint

  await tmux('pipe-pane', '-t', SES); // toggle off (closes cat → stream end)
  await sleep(500);
  rs.destroy();
  await Promise.race([fed, sleep(1000)]);
  await sleep(300);
  // drain anything queued into xterm
  await write(term, '');

  const truth = await paneText();
  console.log(`[pipe-pane] streamed ${bytes} bytes`);
  const pct = compare('pipe-pane', term, truth);
  rmSync(dir, { recursive: true, force: true });
  term.dispose();
  return { pct, bytes };
}

/* ---------- B: control mode ---------- */
async function testControlMode() {
  console.log('\n=== B: control mode (tmux -C attach) ===');
  const sizeBefore = await paneSize();
  const { stdout: pidOut } = await tmux('display-message', '-p', '-t', SES, '#{pane_id}');
  const paneId = pidOut.trim();

  const term = newTerm();
  let bytes = 0;
  const cc = spawn('tmux', ['-C', 'attach-session', '-t', SES], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TMUX: undefined, TMUX_PANE: undefined },
  });
  let carry = '';
  const writes = [];
  cc.stdout.on('data', (d) => {
    carry += d.toString('utf8');
    const lines = carry.split('\n');
    carry = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('%output ')) continue;
      const sp = line.indexOf(' ', 8);
      const pane = line.slice(8, sp);
      if (pane !== paneId) continue;
      const data = line
        .slice(sp + 1)
        .replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
      bytes += data.length;
      writes.push(new Promise((r) => term.write(data, r)));
    }
  });
  // give the control client its own size so it can't shrink the window,
  // and confirm whether plain attach disturbed sizing at all
  cc.stdin.write(`refresh-client -C ${COLS}x${ROWS}\n`);
  await sleep(1000);
  await seedTerm(term);

  await poke('Reply with exactly the word PONG43 and nothing else.');
  await sleep(15000);

  const sizeAfter = await paneSize();
  const truth = await paneText();
  cc.stdin.write('detach-client\n');
  await sleep(300);
  cc.kill();
  await Promise.race([Promise.all(writes), sleep(2000)]);

  console.log(`[control] streamed ${bytes} bytes (decoded)`);
  console.log(`[control] pane size before=${sizeBefore} after=${sizeAfter} ${sizeBefore === sizeAfter ? '(undisturbed)' : '(CHANGED — sizing risk!)'}`);
  const pct = compare('control', term, truth);
  term.dispose();
  return { pct, bytes };
}

/* ---------- C: gap repair (mirror with memory) ----------
 * A mirror only remembers what it witnessed: while disconnected the stream flows
 * on without it. Reconnect = backfill the missed span from tmux history
 * (#{history_size} delta → capture-pane that span + current screen), splice into
 * xterm, THEN resume the live stream. Asserts output produced DURING the outage
 * lands in xterm scrollback, and the viewport re-converges with the pane. */
async function histSize() {
  const { stdout } = await tmux('display-message', '-p', '-t', SES, '#{history_size}');
  return Number(stdout.trim()) || 0;
}

function bufferHas(term, needle) {
  const buf = term.buffer.active;
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i);
    if (line && line.translateToString(true).includes(needle)) return true;
  }
  return false;
}

async function testGapRepair() {
  console.log('\n=== C: gap repair over pipe-pane (disconnect → backfill → resume) ===');
  const dir = mkdtempSync(path.join(tmpdir(), 'v2gap-'));
  const term = newTerm();
  let bytes = 0;

  const streamOn = async (tag) => {
    const fifo = path.join(dir, tag);
    await pexec('mkfifo', [fifo]);
    const rs = createReadStream(fifo);
    rs.on('data', (d) => {
      bytes += d.length;
      term.write(d);
    });
    await tmux('pipe-pane', '-t', SES, '-o', `cat > ${fifo}`);
    return rs;
  };
  const streamOff = async (rs) => {
    await tmux('pipe-pane', '-t', SES); // toggle off
    await sleep(400);
    rs.destroy();
  };

  // connected phase
  let rs = await streamOn('s1');
  await seedTerm(term);
  await sleep(1000);

  // --- outage: stream detached; claude keeps producing ---
  await streamOff(rs);
  const histBefore = await histSize();
  await poke('Reply with exactly the word GAPMARKER77 and nothing else.');
  await sleep(12000);
  const histAfter = await histSize();

  // --- reconnect: backfill the missed span, then resume the stream ---
  const missed = histAfter - histBefore;
  const span = Math.min(10000, missed + ROWS); // missed scrollback + current screen
  const { stdout: fill } = await tmux('capture-pane', '-p', '-e', '-t', SES, '-S', String(-span));
  const { x, y } = await cursorPos();
  await write(
    term,
    '\r\n' + fill.replace(/\n$/, '').split('\n').join('\r\n') + `\x1b[${y + 1};${x + 1}H`,
  );
  rs = await streamOn('s2');
  await poke('Reply with exactly the word RESUME88 and nothing else.');
  await sleep(12000);
  await streamOff(rs);
  await write(term, '');

  const truth = await paneText();
  console.log(`[gap] history grew ${missed} lines during outage; backfilled ${span} lines; ${bytes}b streamed total`);
  const gapSeen = bufferHas(term, 'GAPMARKER77');
  const resumeSeen = bufferHas(term, 'RESUME88');
  console.log(`[gap] outage output in scrollback: ${gapSeen ? 'YES' : 'NO — FAIL'}`);
  console.log(`[gap] post-resume output streamed live: ${resumeSeen ? 'YES' : 'NO — FAIL'}`);
  const pct = compare('gap-repair', term, truth);
  rmSync(dir, { recursive: true, force: true });
  term.dispose();
  return { pct, gapSeen, resumeSeen };
}

async function main() {
  console.log(`proto-v2: transport fidelity test against a real claude session (${COLS}x${ROWS})`);
  await ensureSession();
  console.log(`pane size: ${await paneSize()}`);

  const a = await testPipePane();
  const b = await testControlMode();
  const c = await testGapRepair();

  console.log('\n=== verdict ===');
  console.log(`pipe-pane: ${a.pct}% fidelity, ${a.bytes}b streamed`);
  console.log(`control  : ${b.pct}% fidelity, ${b.bytes}b streamed`);
  console.log(`gap-repair: ${c.pct}% post-splice fidelity, outage output ${c.gapSeen ? 'recovered' : 'LOST'}, resume ${c.resumeSeen ? 'ok' : 'BROKEN'}`);

  if (!KEEP) {
    await tmux('kill-session', '-t', SES).catch(() => {});
    console.log(`killed ${SES} (use --keep to leave it running)`);
  } else {
    console.log(`left ${SES} running`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
