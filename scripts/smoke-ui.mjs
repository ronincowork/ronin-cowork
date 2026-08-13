#!/usr/bin/env node
/**
 * RENDERING smoke test — does the page actually WORK in a browser?
 *
 * The sibling `smoke-test.mjs` checks the pipe with no browser. That is a useful test
 * and it is not this one. It passed while the UI was dead: on 2026-08-08 a constructor
 * threw before any handler was wired, so every websocket message was correct and the
 * screen was blank. "The protocol is right" was true and irrelevant.
 *
 * Two passes, because the two surfaces fail differently:
 *
 *   DESKTOP (Chromium)  — locked tiles, the tmux attach mirror.
 *   PHONE   (WebKit)    — touch is FIXED UNLOCKED (`locked = !IS_TOUCH`), so it is the
 *                         only pass that exercises the tape path. That is why the phone
 *                         went dark FIRST on 2026-08-08 while the Mac still worked.
 *
 * The phone pass wants WebKit, because Glen's phone is Safari and iOS Safari is where the
 * caching, momentum-scroll and dictation quirks live. WebKit needs system libraries that
 * require root to install (`npx playwright install-deps webkit`). When it is unavailable
 * this falls back to Chromium with phone geometry and SAYS SO — it still catches a blank
 * pane and a thrown constructor, it just is not Safari. The label is never allowed to
 * overstate which engine ran.
 *
 * Usage:  node scripts/smoke-ui.mjs [url]
 * Exits non-zero on failure, so it works as a gate.
 */

import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

// No hardcoded host: the default derives the same ladder the server itself binds with
// (src/config.ts) — BIND env, else the tailnet IP, else loopback. `--staging` points the
// derived URL at the /staging/ copy; an explicit URL argument always wins.
function defaultUrl(staging) {
  let host = process.env.BIND?.trim();
  if (!host) {
    try {
      host = execFileSync('tailscale', ['ip', '-4'], { encoding: 'utf8' }).trim().split('\n')[0];
    } catch { /* tailscale not installed / not up */ }
  }
  return `http://${host || '127.0.0.1'}:${process.env.PORT || 3006}/${staging ? 'staging/' : ''}`;
}
const args = process.argv.slice(2);
const URL_ = args.find((a) => !a.startsWith('--')) || defaultUrl(args.includes('--staging'));
const require_ = createRequire(import.meta.url);

// Playwright is a HOST TOOL, not a dependency (docs/host-tools.md), so the public install
// never carries a browser. Resolution is that document's three steps, in its order — env
// override, normal resolution, then ONE documented machine-local location — and never a
// guess. The guess this replaced pointed into a home directory belonging to a username that
// has never existed on any machine we run, so it resolved nowhere for months and nobody
// noticed, which is why that document has a rule about it.
//
// The third step is not decoration. `npm i --no-save playwright` puts it in step two's
// reach, and then the next `npm install` — setup.sh runs one — PRUNES it as extraneous.
// Measured, by losing it that way. A host tool has to live outside the tree it serves.
export const HOST_TOOLS = `${homedir()}/.cache/ronin-host-tools`;

// Each step is a RESOLVER, not a path string: step 3 resolves `playwright` the way node
// would if it were run from the host-tools directory. Pointing `import()` straight at a
// package directory does not work — ESM has no directory resolution, so it needs the
// package's own entry file, and hardcoding `index.js` is a guess about somebody else's
// package layout. `createRequire` asks node instead.
const CANDIDATES = [
  ['RONIN_PLAYWRIGHT_PATH', () => (process.env.RONIN_PLAYWRIGHT_PATH ? import(process.env.RONIN_PLAYWRIGHT_PATH) : null)],
  ['node resolution from the repo', () => require_('playwright')],
  [`${HOST_TOOLS}/node_modules`, () => createRequire(`${HOST_TOOLS}/`)('playwright')],
];

let pw;
for (const [, load] of CANDIDATES) {
  try {
    const m = await load();
    if (m?.chromium) { pw = m; break; }
  } catch {
    /* try the next one */
  }
}
if (!pw?.chromium) {
  console.error(
    'FAIL: could not find playwright. Tried:\n  ' + CANDIDATES.map(([n]) => n).join('\n  ') +
    `\nInstall it for this machine:\n  mkdir -p ${HOST_TOOLS} && cd ${HOST_TOOLS} && npm i playwright && npx playwright install chromium` +
    '\nOr point RONIN_PLAYWRIGHT_PATH at an existing install. See docs/host-tools.md.',
  );
  process.exit(2);
}
const { chromium, webkit, devices } = pw;

/**
 * Glen's phone is an iPhone 16 Pro. Playwright's device registry stops at iPhone 15 Pro
 * (1.60.0), so take that preset for the real iOS Safari user-agent and touch flags and
 * override the geometry: 16 Pro is 402x874 CSS px at DPR 3, less ~193px of Safari chrome.
 * The exact numbers matter less than being in the phone breakpoint (max-width:680px) with
 * touch on — but naming a device we are not emulating is how "verified on iPhone" starts
 * meaning nothing.
 */
const PHONE = {
  ...(devices['iPhone 15 Pro'] ?? { deviceScaleFactor: 3, isMobile: true, hasTouch: true }),
  viewport: { width: 402, height: 681 },
};
delete PHONE.defaultBrowserType; // we choose the engine explicitly below

const fails = [];
const ok = (msg) => console.log(`  ok   — ${msg}`);
const bad = (msg) => {
  console.log(`  FAIL — ${msg}`);
  fails.push(msg);
};

/** Open a page, collect JS errors and failed requests. */
async function openPage(browser, contextOpts) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, ...contextOpts });
  const page = await ctx.newPage();
  const jsErrors = [];
  const netFails = [];
  // Benign browser noise, not app faults. ResizeObserver settling fires constantly when
  // four xterm tiles fit at once; a gate that trips on it is a gate people learn to
  // ignore. Keep this list SHORT and justified — every entry is a blind spot.
  const BENIGN = [/ResizeObserver loop/i];
  const keep = (s) => !BENIGN.some((re) => re.test(s));
  page.on('pageerror', (e) => keep(e.message) && jsErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && keep(m.text())) jsErrors.push('console: ' + m.text().slice(0, 200));
  });
  page.on('requestfailed', (r) => netFails.push(`${r.url()} :: ${r.failure()?.errorText}`));
  return { page, jsErrors, netFails };
}

/** Has this tile painted real content, in either the terminal or the tape view? */
const painted = (page) =>
  page.evaluate(() => {
    const t = document.querySelector('.tile');
    const a = (t?.querySelector('.xterm-rows')?.innerText || '').trim();
    const b = (t?.querySelector('.tape')?.innerText || '').trim();
    return { xterm: a.length, tape: b.length };
  });

/**
 * THE GATE OWNS ITS OWN SESSION. It never attaches to a live one.
 *
 * It used to pick whatever was first in the session picker — someone's actual work. tmux
 * renders a window at ONE size (`TMUX_WINDOW_SIZE=latest`, the newest client wins), so the
 * phone pass attaching at 402x681 resized that window for every other client watching it,
 * then snapped it back on disconnect. Every gate run yanked the owner's tiles about. The
 * check was honest; the collateral was not.
 *
 * So: create `gate_probe_<pid>`, print a known banner into it, attach to THAT, assert the
 * banner painted, kill it. Same assertion — the client renders, the socket carries bytes,
 * a pane paints — with nobody else's pane touched.
 */
const PROBE = `gate_probe_${process.pid}`;
const BANNER = 'RONIN-GATE-PROBE-PAINTED';

function tmux(args, quiet = true) {
  try {
    return execFileSync('tmux', args, { encoding: 'utf8', stdio: quiet ? ['ignore', 'pipe', 'ignore'] : 'inherit' });
  } catch { return null; }
}

function startProbe() {
  tmux(['kill-session', '-t', `=${PROBE}`]);
  // -d so it is never attached here; a plain shell is enough to paint.
  if (tmux(['new-session', '-d', '-s', PROBE, '-x', '120', '-y', '40']) === null) return false;
  // Hidden from the owner's eye the way viewers are, and never writable by an agent.
  tmux(['set-option', '-t', PROBE, '@ronin-control', 'user']);
  tmux(['set-option', '-t', PROBE, '@ronin_note', 'throwaway — the render gate, killed when it finishes']);
  for (let i = 0; i < 30; i++) tmux(['send-keys', '-t', PROBE, `echo ${BANNER} ${i}`, 'Enter']);
  return true;
}

function stopProbe() { tmux(['kill-session', '-t', `=${PROBE}`]); }

async function attachProbe(page, label) {
  const sel = page.locator('select.sess').first();
  const opts = (await sel.locator('option').allTextContents()).map((o) => o.trim());
  const mine = opts.find((o) => o.includes(PROBE));
  if (!mine) {
    bad(`${label}: the gate's own session ${PROBE} is not in the picker (is the tmux server up?)`);
    return;
  }
  await sel.selectOption({ label: mine });
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(1000);
    const p = await painted(page);
    if (p.xterm > 20 || p.tape > 20) {
      const which = p.tape > 20 ? `tape ${p.tape} chars` : `terminal ${p.xterm} chars`;
      ok(`${label}: attached the gate's own session and it painted (${which})`);
      return;
    }
  }
  bad(`${label}: attached ${PROBE} and the pane stayed EMPTY`);
}

/** The DOM assertions that apply to both surfaces. */
async function checkDom(page, label) {
  const dom = await page.evaluate(() => ({
    live: document.querySelectorAll('.tile:not(.tile-dead)').length,
    dead: document.querySelectorAll('.tile.tile-dead').length,
    pickers: document.querySelectorAll('select.sess').length,
    failBar: document.getElementById('failbar')?.innerText.trim().slice(0, 400) || null,
  }));
  if (dom.live > 0) ok(`${label}: ${dom.live} live tile(s) rendered`);
  else bad(`${label}: no live tiles rendered — the grid never built`);
  if (dom.dead) bad(`${label}: ${dom.dead} tile(s) failed to build (contained, but broken)`);
  if (dom.pickers > 0) ok(`${label}: ${dom.pickers} session picker(s) present`);
  else bad(`${label}: no session pickers — buildHome/build never ran`);
  if (dom.failBar) bad(`${label}: the failure banner is showing:\n         ` + dom.failBar.replace(/\n/g, '\n         '));
  else ok(`${label}: no failure banner`);
}

async function runPass({ label, browser, contextOpts }) {
  const { page, jsErrors, netFails } = await openPage(browser, contextOpts);
  try {
    await page.goto(URL_, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (e) {
    bad(`${label}: page did not load: ${e.message}`);
  }
  await page.waitForTimeout(3000);

  // THIS is the check that catches a constructor throw — the 2026-08-08 outage.
  if (jsErrors.length) bad(`${label}: uncaught JS errors:\n         ` + jsErrors.join('\n         '));
  else ok(`${label}: no uncaught JS errors`);
  if (netFails.length) bad(`${label}: failed requests:\n         ` + netFails.join('\n         '));
  else ok(`${label}: no failed requests`);

  await checkDom(page, label);
  await attachProbe(page, label);

  const after = jsErrors.length;
  if (after && !fails.some((f) => f.includes('uncaught JS errors'))) {
    bad(`${label}: JS errors appeared during attach:\n         ` + jsErrors.join('\n         '));
  }
}

console.log(`\nRENDERING smoke test → ${URL_}\n`);

// The gate's own pane. Live sessions are never touched — see attachProbe.
if (!startProbe()) bad('could not create the gate probe session (is the tmux server up?)');
process.on('exit', stopProbe);
process.on('SIGINT', () => { stopProbe(); process.exit(130); });

// ---- desktop ----
// EXIT 2 IS "I COULD NOT LOOK", and a browser that will not start is that, not a broken
// page. The distinction is the whole contract with bin/ronin-byoin: 2 becomes an honest
// SKIP, anything else becomes a FAILING GATE, and conflating them either hides a real
// render fault behind "no browser here" or cries wolf on every run of an unprovisioned
// box. The binary exists and dies on a missing system library — the three pieces of a
// host tool come apart, see docs/host-tools.md.
let desktop;
try {
  desktop = await chromium.launch();
} catch (e) {
  const lib = /([\w.+-]+\.so[\w.]*): cannot open shared object file/.exec(String(e?.message ?? e));
  console.error(
    `FAIL: the browser is installed but will not launch${lib ? ` (missing ${lib[1]})` : ''}.` +
    '\nIts system libraries are missing, and only root can add them:' +
    '\n  sudo npx playwright install-deps chromium' +
    '\nSee docs/host-tools.md. The page has NOT been looked at.',
  );
  process.exit(2);
}
await runPass({ label: 'desktop', browser: desktop, contextOpts: { viewport: { width: 1400, height: 900 } } });
await desktop.close();

// ---- phone: WebKit if the host can run it, else Chromium with phone geometry ----
console.log('');
let phoneBrowser = null;
let engine = 'WebKit (iOS Safari engine)';
try {
  phoneBrowser = await webkit.launch();
} catch (e) {
  engine = 'Chromium emulation — NOT Safari';
  const why = /missing dependencies|Missing libraries/i.test(String(e.message))
    ? 'WebKit is installed but the host is missing system libraries; run: npx playwright install-deps webkit (needs root)'
    : String(e.message).split('\n')[0];
  console.log(`  note — phone pass is falling back to Chromium. ${why}`);
  try {
    phoneBrowser = await chromium.launch();
  } catch (e2) {
    bad(`phone: could not launch any browser: ${e2.message}`);
  }
}
if (phoneBrowser) {
  await runPass({ label: `phone [${engine}]`, browser: phoneBrowser, contextOpts: PHONE });
  await phoneBrowser.close();
}

stopProbe();

console.log('');
if (fails.length) {
  console.log(`FAILED — ${fails.length} check(s) failed. The UI is not usable.\n`);
  process.exit(1);
}
console.log(`PASSED — desktop and phone [${engine}] both render and paint a live pane.\n`);
