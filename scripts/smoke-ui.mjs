#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { HOST_TOOLS, defaultUrl, loadPlaywright } from './lib/ui-host.mjs';

const args = process.argv.slice(2);
const URL_ = args.find((a) => !a.startsWith('--')) || defaultUrl(args.includes('--staging'));

const pw = await loadPlaywright();
if (!pw) {
  console.error(
    'FAIL: could not find playwright.' +
    `\nInstall it for this machine:\n  mkdir -p ${HOST_TOOLS} && cd ${HOST_TOOLS} && npm i playwright && npx playwright install chromium` +
    '\nOr point RONIN_PLAYWRIGHT_PATH at an existing install. See docs/host-tools.md.',
  );
  process.exit(2);
}
const { chromium, webkit, devices } = pw;

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

async function openPage(browser, contextOpts) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, colorScheme: 'dark', ...contextOpts });
  const page = await ctx.newPage();
  await page.route('**/api/machine-settings', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    try {
      const response = await route.fetch();
      const data = await response.json();
      if (data?.set?.owner && !String(data.set.owner.name ?? '').trim()) data.set.owner.name = 'Ronin rendering gate';
      if (data?.set?.setup) data.set.setup.pending = false;
      await route.fulfill({ response, json: data });
    } catch (_) {
      await route.continue().catch(() => {});
    }
  });
  const jsErrors = [];
  const netFails = [];
  const BENIGN = [/ResizeObserver loop/i];
  const keep = (s) => !BENIGN.some((re) => re.test(s));
  page.on('pageerror', (e) => keep(e.message) && jsErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && keep(m.text())) {
      const source = m.location().url;
      jsErrors.push('console: ' + m.text().slice(0, 200) + (source ? ` @ ${source}` : ''));
    }
  });
  page.on('requestfailed', (r) => netFails.push(`${r.url()} :: ${r.failure()?.errorText}`));
  return { page, jsErrors, netFails };
}

const painted = (page) =>
  page.evaluate(() => {
    const t = document.querySelector('.tile');
    const a = (t?.querySelector('.xterm-rows')?.innerText || '').trim();
    const b = (t?.querySelector('.tape')?.innerText || '').trim();
    return { xterm: a.length, tape: b.length };
  });

const PROBE = `gate_probe_${process.pid}`;
const BANNER = 'RONIN-GATE-PROBE-PAINTED';

function tmux(args, quiet = true) {
  try {
    return execFileSync('tmux', args, { encoding: 'utf8', stdio: quiet ? ['ignore', 'pipe', 'ignore'] : 'inherit' });
  } catch { return null; }
}

let probeRefusal = null;
let probeAvailable = false;

function startProbe() {
  if (tmux(['has-session', '-t', `=${PROBE}`]) !== null) deleteThroughRonin(PROBE);
  tmux(['kill-session', '-t', `=${PROBE}`]);
  try {
    execFileSync('tmux', ['new-session', '-d', '-s', PROBE, '-x', '120', '-y', '40'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    probeRefusal = String(e?.stderr ?? '').trim() || `tmux new-session failed: ${e?.message ?? e}`;
    return false;
  }
  tmux(['set-option', '-t', PROBE, '@ronin-control', 'user']);
  tmux(['set-option', '-t', PROBE, '@ronin-gate-probe', 'throwaway — the render gate, killed when it finishes']);
  for (let i = 0; i < 30; i++) tmux(['send-keys', '-t', PROBE, `echo ${BANNER} ${i}`, 'Enter']);
  return true;
}

function stopProbe({ stale = false } = {}) {
  // Opening the probe in a Workbench tile creates one or more grouped grid_* viewer
  // sessions. Killing only the root leaves those grouped sessions alive, so every UI
  // gate can add another "Gate Probe" to the owner's server. At startup, also retire a
  // prior crashed gate, but only when its exact private marker proves ownership.
  const rows = tmux(['list-sessions', '-F', '#{session_name}\t#{session_group}\t#{@ronin-gate-probe}']) || '';
  const parsed = rows.split('\n').map((line) => line.split('\t'));
  const roots = new Set(parsed
    .filter(([name, , note]) => name === PROBE || (stale && /^gate_probe_\d+$/.test(name) && note === 'throwaway — the render gate, killed when it finishes'))
    .map(([name]) => name));
  const owned = parsed
    .filter(([name, group]) => name && (roots.has(name) || roots.has(group)))
    .map(([name]) => name);
  // Ronin's own Delete ends the probe, so its session folder goes with it (KAN-770); a bare
  // kill-session left one gate_probe_<pid> folder per gate. Synchronous: this also runs on exit.
  for (const name of roots) deleteThroughRonin(name);
  for (const name of owned.reverse()) tmux(['kill-session', '-t', `=${name}`]);
}

function deleteThroughRonin(name) {
  try {
    execFileSync('curl', ['-s', '-o', '/dev/null', '--max-time', '30', '-X', 'DELETE',
      '-H', 'content-type: application/json', '-d', '{"ignore_items":true}',
      `${URL_.replace(/#.*$/, '')}api/sessions/${encodeURIComponent(name)}`], { stdio: 'ignore' });
  } catch { /* the tmux kill below still ends it */ }
}

async function attachProbe(page, label) {
  const seated = page.locator(`[data-workbench-surface="session.terminal"][data-workbench-resource="${PROBE}"] .tile-head .sess`).first();
  if (!(await seated.count())) {
    const offered = await page.locator('.wk-card-heading').allTextContents();
    const seats = await page.locator('.tile-head .sess').evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent, title: node.title })));
    bad(`${label}: the gate's own session ${PROBE} was not seated from the Workbench selector (seats: ${JSON.stringify(seats)}; offered: ${offered.join(', ')})`);
    return;
  }
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

async function checkDom(page, label) {
  const DESK = '[data-workspace-view="campaign"] [data-workbench-surface="ronin.desk"]';
  const openDesk = async () => {
    await page.goto(URL_.replace(/#.*$/, '') + '#/campaign', { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1200);
    await page.locator('[data-workspace-view="campaign"] .wk-card', { hasText: 'Ronin Desk' }).click();
    await page.waitForSelector(`${DESK} .cc`, { timeout: 3000 });
  };
  const dom = await page.evaluate(() => ({
    live: document.querySelectorAll('.tile:not(.tile-dead)').length,
    dead: document.querySelectorAll('.tile.tile-dead').length,
    sessionNames: document.querySelectorAll('.tile-head .sess').length,
    failBar: document.getElementById('failbar')?.innerText.trim().slice(0, 400) || null,
  }));
  if (!probeAvailable) console.log(`  SKIP — ${label}: live Team tile construction (session capacity is full)`);
  else if (dom.live > 0) ok(`${label}: ${dom.live} live tile(s) rendered`);
  else bad(`${label}: no live Team tiles rendered`);
  if (dom.dead) bad(`${label}: ${dom.dead} tile(s) failed to build (contained, but broken)`);
  if (!probeAvailable) console.log(`  SKIP — ${label}: Team tile session label (session capacity is full)`);
  else if (dom.sessionNames > 0) ok(`${label}: ${dom.sessionNames} Team tile session label(s) present`);
  else bad(`${label}: no session labels in the Team workspace`);
  if (dom.failBar) bad(`${label}: the failure banner is showing:\n         ` + dom.failBar.replace(/\n/g, '\n         '));
  else ok(`${label}: no failure banner`);
}

/* The Team commons' Configuration tab: the questions are ERABI stones (140 wide, the forms' tight
   40 px, the tray under the group) or, with no saved record, the tab says so. Read-only, and on a
   page of its own: placing the Commons on the gate's page would unseat the probe it just seated. */
async function checkTeamConfiguration(gatePage, label) {
  const page = await gatePage.context().newPage();
  try {
    // The first saved Team, so the stones are measured on a real record; a box with none gets the no-record line.
    let team = '%20unassigned';
    try {
      const rosters = await (await page.request.get(URL_.replace(/#.*$/, '') + 'api/team-rosters')).json();
      const first = Array.isArray(rosters) ? rosters.find((row) => row?.name && row.state !== 'archived') : null;
      if (first) team = encodeURIComponent(first.name);
    } catch { /* no rosters route, or none saved: the unassigned page still shows the tab */ }
    await page.goto(URL_.replace(/#.*$/, '') + `#/team/${team}`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(2000);
    // The card's text carries its summary too, so match the label alone.
    const card = page.locator('.wk-card').filter({ has: page.getByText('Commons', { exact: true }) }).first();
    if (!(await card.count())) { console.log(`  SKIP — ${label}: no Commons card on this Team page`); return; }
    await card.click();
    await page.waitForTimeout(1000);
    const tab = page.locator('button').filter({ hasText: /^(Configuration|Team Configuration)$/ }).first();
    if (!(await tab.count())) { bad(`${label}: the Commons strip has no Configuration tab`); return; }
    await tab.click();
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => {
      // Several commons instances may exist (one per workspace); the shown one is the one with a box.
      const tab = [...document.querySelectorAll('.tw-config')].find((node) => node.getClientRects().length);
      if (!tab) return { shown: false };
      const empty = tab.querySelector('.tw-config-empty');
      const stone = tab.querySelector('.ask-stone:not(.ask-switch)');
      if (!stone) return { shown: true, empty: (empty?.textContent || '').trim() };
      const rect = stone.getBoundingClientRect();
      stone.click();
      const tray = document.querySelector('.ask-tray');
      const group = stone.closest('.ask-group');
      const under = !!(tray && group) && tray.getBoundingClientRect().top >= group.getBoundingClientRect().bottom - 1;
      document.querySelector('.ask-stone[aria-expanded="true"]')?.click();
      return { shown: true, stone: [Math.round(rect.width), Math.round(rect.height)], tray: !!tray, under };
    });
    if (!state.shown) { bad(`${label}: the Configuration tab did not show`); return; }
    if (state.stone) {
      if (state.stone[0] === 140 && (state.stone[1] === 40 || state.stone[1] === 48)) ok(`${label}: Configuration asks through ERABI — a 140 × ${state.stone[1]} reading stone`);
      else bad(`${label}: Configuration's reading stone is ${state.stone.join(' × ')}, wanted 140 × 40 (the forms' tight stone) or 140 × 48`);
      if (state.tray && state.under) ok(`${label}: the tray opens under the stone's group`);
      else bad(`${label}: the tray did not open under the group (tray=${state.tray}, under=${state.under})`);
    } else if (state.empty) ok(`${label}: Configuration says the Team has no saved record`);
    else bad(`${label}: Configuration painted neither stones nor its no-record line`);
  } finally {
    await page.close().catch(() => {});
  }
}

async function checkCurrentWorkspace(page, label) {
  const state = await page.evaluate(() => {
    const head = document.querySelector('.tile-head');
    return {
      view: document.querySelector('[data-workspace-view]:not([hidden])')?.dataset.workspaceView || '',
      embeddedCommons: document.querySelectorAll('.tile .home').length,
      first: head?.firstElementChild?.className || '',
      second: head?.children[1]?.className || '',
      torii: head?.firstElementChild?.textContent || '',
      selector: [...document.querySelectorAll('[data-workspace-view]:not([hidden]) .wk-workbench-selector-cards .wk-card')].map((card) => ({
        utility: card.classList.contains('wk-selector-utility'),
        entity: card.classList.contains('wk-selector-entity'),
        pressed: card.hasAttribute('aria-pressed'),
      })),
    };
  });
  if (state.view === 'team') ok(`${label}: Team is the active cowork-space destination`);
  else bad(`${label}: active destination is "${state.view}", wanted Team`);
  if (!state.embeddedCommons) ok(`${label}: terminal Tiles contain no embedded Commons`);
  else bad(`${label}: ${state.embeddedCommons} embedded Commons surface(s) remain`);
  if (!probeAvailable) {
    console.log(`  SKIP — ${label}: tile-head order (session capacity is full)`);
  } else if (/torii/.test(state.first) && /sess/.test(state.second) && state.torii === '⛩') {
    ok(`${label}: Torii rename is first, immediately before the session name`);
  } else bad(`${label}: tile-head order is wrong — ${JSON.stringify(state)}`);
  const firstEntity = state.selector.findIndex((card) => card.entity);
  const lastEntity = state.selector.findLastIndex((card) => card.entity);
  const shelves = firstEntity > 0 && lastEntity >= firstEntity
    && state.selector.slice(0, firstEntity).every((card) => card.utility)
    && state.selector.slice(firstEntity, lastEntity + 1).every((card) => card.entity)
    && state.selector.slice(lastEntity + 1).every((card) => card.utility);
  if (shelves && state.selector.every((card) => !card.pressed)) {
    ok(`${label}: selector separates blue utilities from kaki Agents without placement highlights`);
  } else bad(`${label}: selector hierarchy/placement state is unclear — ${JSON.stringify(state.selector)}`);
}

// THE MOBILE DOCUMENT at phone geometry. A phone downloads mobile.html and nothing else,
// so the first frame the engine paints is the mobile bar: there is no desktop bar, no
// workbench and no boot skeleton in that document to flash. That is the whole answer to
// the frame Glen photographed (the desktop bar and a squashed skeleton, replaced a beat
// later by the phone UI). Two addresses reach the document — /m, and / for a phone-class
// User-Agent, which the iPhone descriptor sends — and the pass proves both, cold and with
// the first server answer stalled, the way the flash was caught.
function mobileFirstPaintRecorder() {
  const tick = () => {
    const desktop = document.querySelector('#bar, #bootframe, .wk-workbench-layout');
    if (desktop && desktop.getClientRects().length) {
      window.__roninFirstPaint = { mobile: false, painted: desktop.id || desktop.className };
      return;
    }
    const bar = document.querySelector('#phone > .ph-bar');
    if (bar && bar.getClientRects().length) {
      const showing = (sel) => !!bar.querySelector(sel)?.getClientRects().length;
      window.__roninFirstPaint = { mobile: true, title: [...bar.querySelectorAll('.ph-title')].find((n) => n.getClientRects().length)?.textContent?.trim() || '', mark: showing('.brand'), back: showing('.ph-back') };
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function runPhonePass({ label, browser, contextOpts }) {
  // [name, route, stall the first answer, the bar the first frame must show]
  const cases = [
    ['/m', 'm', false, 'list'],
    ['/ as a phone', '', false, 'list'],
    ['/m with the first answer stalled', 'm', true, 'list'],
    ['/m at a tile address', `m#/s/${PROBE}`, false, 'inside'],
  ];
  for (const [name, route, stall, opens] of cases) {
    const { page, jsErrors, netFails } = await openPage(browser, contextOpts);
    await page.addInitScript(mobileFirstPaintRecorder);
    if (stall) {
      await page.route('**/api/sessions', async (r) => {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        await r.continue();
      });
    }
    try {
      await page.goto(new URL(route, URL_.replace(/#.*$/, '')).href, { waitUntil: 'networkidle', timeout: 30_000 });
    } catch (e) {
      bad(`${label}: ${name} did not load: ${e.message}`);
    }
    await page.waitForTimeout(1500);
    const first = await page.evaluate(() => window.__roninFirstPaint || null);
    const rightBar = opens === 'list' ? first?.mark && !first.back : first?.back && !first.mark;
    if (first?.mobile && rightBar) ok(`${label}: ${name} — first paint is the mobile bar, ${opens === 'list' ? 'the mark' : '‹ inside'}`);
    else bad(`${label}: ${name} — first paint is not the ${opens} bar (${JSON.stringify(first)})`);
    const settled = await page.evaluate(() => ({
      mobile: !!document.querySelector('#phone > .ph-bar') && !!document.querySelector('#phone > .ph-main'),
      desktop: !!document.querySelector('#bar, #bootframe, #viewhost, .wk-workbench-layout, [data-workspace-view]'),
      entry: [...document.scripts].some((s) => /\/js\/phone\.js$/.test(s.src)),
      cards: document.querySelectorAll('#phone .ph-card').length,
      failBar: document.getElementById('failbar')?.innerText.trim().slice(0, 400) || null,
    }));
    if (settled.mobile && settled.entry && !settled.desktop) ok(`${label}: ${name} — the mobile document, with no desktop markup in it (${settled.cards} cards)`);
    else bad(`${label}: ${name} — not the mobile document (${JSON.stringify(settled)})`);
    if (settled.failBar) bad(`${label}: ${name} — the failure banner is showing:\n         ` + settled.failBar.replace(/\n/g, '\n         '));
    if (jsErrors.length) bad(`${label}: ${name} — uncaught JS errors:\n         ` + jsErrors.join('\n         '));
    else ok(`${label}: ${name} — no uncaught JS errors`);
    if (netFails.length) bad(`${label}: ${name} — failed requests:\n         ` + netFails.join('\n         '));
    await page.context().close();
  }
}

async function runPass({ label, browser, contextOpts }) {
  const { page, jsErrors, netFails } = await openPage(browser, contextOpts);
  let releaseSessions;
  const sessionsHeld = new Promise((resolve) => { releaseSessions = resolve; });
  await page.route('**/api/sessions', async (route) => {
    await sessionsHeld;
    await route.continue();
  });
  const navigation = page.goto(URL_.replace(/#.*$/, '') + '#/team/%20unassigned', { waitUntil: 'networkidle', timeout: 30_000 });
  let paintedBeforeSessions = false;
  try {
    await page.waitForFunction(() => !document.documentElement.classList.contains('boot-pending')
      && !!document.querySelector('#viewhost > :not([hidden])'), null, { timeout: 10_000 });
    paintedBeforeSessions = true;
  } catch (e) {
    const boot = await page.evaluate(() => ({
      pending: document.documentElement.classList.contains('boot-pending'),
      views: [...document.querySelectorAll('[data-workspace-view]')].map((el) => ({ id: el.dataset.workspaceView, hidden: el.hidden })),
    }));
    bad(`${label}: selected desktop workspace stayed veiled behind session discovery: ${e.message} — ${JSON.stringify(boot)}`);
  } finally {
    releaseSessions();
  }
  try {
    await navigation;
  } catch (e) {
    bad(`${label}: page did not load: ${e.message}`);
  }
  if (paintedBeforeSessions) ok(`${label}: selected desktop workspace paints before session discovery completes`);
  await page.waitForTimeout(3000);
  const probeCard = page.locator(`.wk-card[data-workbench-offer-resource="${PROBE}"]`).first();
  if (probeAvailable) {
    await probeCard.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
    if (await probeCard.count()) { await probeCard.click(); await page.waitForTimeout(1200); }
  }
  if (probeAvailable) {
    await page.locator(`[data-workbench-surface="session.terminal"][data-workbench-resource="${PROBE}"] .tile-head .sess`).first()
      .waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
  }

  if (jsErrors.length) bad(`${label}: uncaught JS errors:\n         ` + jsErrors.join('\n         '));
  else ok(`${label}: no uncaught JS errors`);
  if (netFails.length) bad(`${label}: failed requests:\n         ` + netFails.join('\n         '));
  else ok(`${label}: no failed requests`);

  await checkDom(page, label);
  await checkTeamConfiguration(page, label);
  if (probeAvailable) {
    await attachProbe(page, label);
    const docsFocus = await page.evaluate(() => {
      const body = [...document.querySelectorAll('.tile .tile-body')].find((node) => node.getClientRects().length);
      if (!body) return { kept: false, active: '', reason: 'no visible tile body' };
      const overlay = body.querySelector('.tile-doc-view');
      const area = overlay?.querySelector('.dc-text');
      if (!overlay || !area) return { kept: false, active: '', reason: 'Docs editor is absent' };
      const previousSurface = body.dataset.surface;
      body.dataset.surface = 'docs';
      overlay.dataset.view = 'edit';
      area.disabled = false;
      area.focus();
      const before = `${document.activeElement?.tagName || ''}.${document.activeElement?.className || ''}`;
      const rect = area.getBoundingClientRect();
      area.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      const kept = document.activeElement === area;
      const active = `${document.activeElement?.tagName || ''}.${document.activeElement?.className || ''}`;
      overlay.dataset.view = 'list';
      area.disabled = true;
      body.dataset.surface = previousSurface;
      return { kept, active, before, rect: [rect.width, rect.height] };
    });
    if (docsFocus.kept) ok(`${label}: in-Tile Docs keeps selection and editing focus away from xterm`);
    else bad(`${label}: in-Tile Docs loses selection/editing focus to xterm (${docsFocus.reason || `before ${docsFocus.before}, active ${docsFocus.active}, rect ${docsFocus.rect}`})`);
  }
  else console.log(`  SKIP — ${label}: live-pane attach probe (session capacity is full)`);
  await checkCurrentWorkspace(page, label);

  const after = jsErrors.length;
  if (after && !fails.some((f) => f.includes('uncaught JS errors'))) {
    bad(`${label}: JS errors appeared during attach:\n         ` + jsErrors.join('\n         '));
  }
}

console.log(`\nRENDERING smoke test → ${URL_}\n`);

process.on('exit', stopProbe);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => process.exit(sig === 'SIGINT' ? 130 : 143));
}
stopProbe({ stale: true });
probeAvailable = startProbe();
if (!probeAvailable) {
  console.error(
    '\nFAIL: the gate could not create its own probe session, so it never looked at the page.' +
    '\nWhat refused it:\n\n' + String(probeRefusal).replace(/^/gm, '  ') + '\n',
  );
  process.exit(1);
}

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
  await runPhonePass({ label: `phone [${engine}]`, browser: phoneBrowser, contextOpts: PHONE });
  await phoneBrowser.close();
}

stopProbe();

console.log('');
if (fails.length) {
  console.log(`FAILED — ${fails.length} check(s) failed. The UI is not usable.\n`);
  process.exit(1);
}
console.log(probeAvailable
  ? `PASSED — the desktop renders and paints a live pane; the phone [${engine}] gets the mobile document.\n`
  : `PASSED — desktop and phone [${engine}] render cleanly; live-pane checks skipped at session capacity.\n`);
