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
 *   DESKTOP (Chromium)  — locked tiles, the tmux attach mirror, the workbench.
 *   PHONE   (WebKit)    — the phone SHELL (js/phone.js): the workbench never boots at
 *                         an iPhone-class viewport, so this pass walks the drill-down
 *                         (Coworks → Agents → the stage) instead of the workbench
 *                         probes. Touch is FIXED UNLOCKED, so it is also the only pass
 *                         that exercises the tape path — the phone went dark FIRST on
 *                         2026-08-08 while the Mac still worked.
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

import { execFileSync } from 'node:child_process';
import { HOST_TOOLS, defaultUrl, loadPlaywright, loadAxeSource } from './lib/ui-host.mjs';

// Host derivation and the playwright hunt both live in scripts/lib/ui-host.mjs — this
// this script and check-tips need the same two answers, and when each had its own copy they
// disagreed about the host.
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
  // colorScheme pinned: the shell follows the device (prefers-color-scheme) by
  // default now, and headless engines report LIGHT — the gate's assertions and the
  // visual baseline are written against the dark shell, so the pin is the honesty.
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, colorScheme: 'dark', ...contextOpts });
  const page = await ctx.newPage();
  // The rendering gate exercises the whole coworkspace even on a box whose owner has
  // not completed first load yet. Shadow ONLY the initial read in this browser: no file
  // is written, PUTs pass through untouched, and the real first-load module still gets
  // syntax/dead-code checks. Keeping the route for reloads matters because the gbrain
  // handoff journey deliberately reloads to reset the shared launcher.
  await page.route('**/api/settei', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    // A settei poll can be in flight when this context closes at the end of a pass; the
    // fetch then rejects ("Request context disposed") and, unhandled, that killed the
    // whole run after every desktop check had passed (three runs, 2026-08-25).
    try {
      const response = await route.fetch();
      const data = await response.json();
      if (data?.set?.owner && !String(data.set.owner.name ?? '').trim()) data.set.owner.name = 'Ronin rendering gate';
      await route.fulfill({ response, json: data });
    } catch (_) {
      await route.continue().catch(() => {});
    }
  });
  const jsErrors = [];
  const netFails = [];
  // Benign browser noise, not app faults. ResizeObserver settling fires constantly when
  // four xterm tiles fit at once; a gate that trips on it is a gate people learn to
  // ignore. Keep this list SHORT and justified — every entry is a blind spot.
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

/** Why the probe could not be created, in the words of whatever refused it. */
let probeRefusal = null;
let probeAvailable = false;

function startProbe() {
  tmux(['kill-session', '-t', `=${PROBE}`]);
  // -d so it is never attached here; a plain shell is enough to paint.
  //
  // STDERR IS KEPT for this one call, unlike every other tmux() here. Whatever refused the
  // session — the box's session max (libexec/ronin-may-spawn), a dial, a dead server — is
  // the only account of why the whole gate is about to stop, and throwing it away is how
  // "is the tmux server up?" came to be printed at a server that was up (2026-08-17). The
  // call site prints this verbatim rather than guessing.
  try {
    execFileSync('tmux', ['new-session', '-d', '-s', PROBE, '-x', '120', '-y', '40'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    probeRefusal = String(e?.stderr ?? '').trim() || `tmux new-session failed: ${e?.message ?? e}`;
    return false;
  }
  // Hidden from the owner's eye the way viewers are, and never writable by an agent.
  //
  // THIS LINE DOES NOT LAND whenever bin/shim is on the caller's PATH, which is how anyone
  // on this box runs the gate (measured 2026-08-18): the shim refuses every @ronin-control
  // write with "dial flips are owner-only", exit 4, and tmux() swallows it. Left as it is
  // rather than routed around /usr/bin/tmux — that is exactly the deliberate, visible act
  // the shim exists to make you take — and note that it would BREAK this gate if it worked:
  // with the dial at `user` the shim would then refuse the gate's OWN send-keys below and
  // the pane would never paint. So the probe is a plain session wearing the note on the
  // next line, and this is the record of why. Making it genuinely owner-only is a change to
  // Ronin's own session creation, not a bypass in a test script.
  tmux(['set-option', '-t', PROBE, '@ronin-control', 'user']);
  tmux(['set-option', '-t', PROBE, '@ronin_note', 'throwaway — the render gate, killed when it finishes']);
  for (let i = 0; i < 30; i++) tmux(['send-keys', '-t', PROBE, `echo ${BANNER} ${i}`, 'Enter']);
  return true;
}

function stopProbe() { tmux(['kill-session', '-t', `=${PROBE}`]); }

async function attachProbe(page, label) {
  // Session switching belongs to the Workbench selector now. runPass seats the
  // probe through its roster card; the Tile header is the resulting source of truth.
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

/** The DOM assertions that apply to both surfaces. */
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

/**
 * FIRST JOURNEYS — behaviour, not just paint. Desktop pass only for now: these drive
 * the pointer/keyboard surface, and the touch grammar (drops, hoisted header) deserves
 * probes written for it rather than these re-aimed. Each journey asserts a CONTRACT
 * from docs/ui.md: the bar-is-a-destination rule, the one pane registry, the theme
 * flip, and the sheet's focus round-trip. Kept few and unbrittle on purpose — this is
 * the seed of the journey layer, not a snapshot suite.
 */
async function checkJourneys(page, label, jsErrors) {
  // LEAGUE HAS A DISCOVERABLE SECOND-TAB DOOR. Inspect rather than activate it: the gate
  // must prove the link contract without replacing or opening away from this Sessions tab.
  const leagueDoor = await page.locator('#leaguebtn').evaluate((link) => {
    const target = new URL(link.href, location.href);
    return {
      visible: !!(link.offsetWidth || link.offsetHeight || link.getClientRects().length),
      text: link.textContent.trim(),
      sameOrigin: target.origin === location.origin,
      hash: target.hash,
      target: link.target,
      rel: [...link.relList],
    };
  });
  if (leagueDoor.visible && leagueDoor.text === 'League' && leagueDoor.sameOrigin
    && leagueDoor.hash === '#/league-workspace' && leagueDoor.target === '_blank'
    && leagueDoor.rel.includes('noopener')) {
    ok(`${label}: header League link opens same-origin #/league-workspace in a noopener new tab`);
  } else {
    bad(`${label}: header League new-tab contract is broken — ${JSON.stringify(leagueDoor)}`);
  }

  // 1 — ⛩ ronin is the root door: Campaign, Coworks and Agents, never one Cowork's
  // Commons. The Cowork Commons remains the workspace surface behind ⚙.
  await page.locator('#brandbtn').click();
  await page.waitForTimeout(300);
  const roninHome = await page.evaluate(() => ({
    hash: location.hash,
    visible: !document.querySelector('.ch-view')?.hidden,
    doors: document.querySelectorAll('.ch-view .ch-door').length,
    chrome: [...document.querySelectorAll('#bar > :not(#brandbtn)')]
      .filter((node) => getComputedStyle(node).display !== 'none').length,
  }));
  if (roninHome.hash === '' && roninHome.visible && roninHome.doors === 3 && roninHome.chrome === 0) ok(`${label}: ⛩ ronin opens the root landing`);
  else bad(`${label}: ⛩ ronin did not open the root landing — ${JSON.stringify(roninHome)}`);
  // The strip once carried ten rooms and two kinds of thing. Install rooms moved to the
  // admin_desk; Archives later became the fifth session room. The expected count comes
  // from the same static registry the product renders, so this probe checks DOM convergence
  // without freezing a second copy of the intended room set.
  const commonsRooms = PANES().filter((pane) => pane.surface === 'commons').length; // PANES is a function since KOKUGO (labels read the lexicon)
  if (commons.tabs === commonsRooms) ok(`${label}: the Commons strip carries its ${commonsRooms} session rooms (registry-fed)`);
  else bad(`${label}: the Commons strip has ${commons.tabs} rooms, wanted ${commonsRooms}`);

  // 2 — a strip tab lands its room: ▤ Wipeboard (a core room on every build). The strip
  // is the ONLY way to pick a room now, which is what makes this the probe that has to
  // hold — the bar reaches the Commons, the strip reaches the rooms.
  await page.locator('.home.show .home-tabrow [data-pane="wipe"]').first().click();
  await page.waitForTimeout(300);
  const pane = await page.evaluate(() => document.querySelector('.home.show')?.dataset.pane);
  if (pane === 'wipe') ok(`${label}: a strip tab lands on the ▤ Wipeboard pane`);
  else bad(`${label}: the strip tab landed on pane "${pane}", wanted "wipe"`);
  await page.evaluate(() => document.querySelector('.home.show .home-x')?.click());

  // 3 — gbrain is the service-switch proof: always visible; inert in cowork alone;
  // live and populated when the service registered.
  const hasGbrain = await page.evaluate(async () => (await (await fetch('/api/version')).json()).services?.includes('gbrain'));
  // IN THE COWORK COMMONS, since 2026-08-27 — gbrain is install-level, so it lives on the
  // cowork commons' Account tab ("the rest, as the desk was"). ⚙ on the grid page is the
  // `cowork` destination at full width. "Visible but inert" has to be true wherever the
  // room is drawn; only the surface asserting it moved (menu → strip → desk → commons).
  await openDesk();
  const ccTabs = await page.locator(`${DESK} .wk-channel-service-tab`).allTextContents();
  if (ccTabs.length === 8) ok(`${label}: the cowork commons carries its eight tabs (${ccTabs.join(' · ')})`);
  else bad(`${label}: the cowork commons has ${ccTabs.length} tabs, wanted 8`);
  await page.locator(`${DESK} .wk-channel-service-tab`).nth(1).click(); // Account
  await page.waitForTimeout(200);
  // The Account tab is the desk's rail (owner: "the selectors on the left"): gbrain is a
  // row on it, built when picked — so pick it.
  await page.locator(`${DESK} .desk-row[data-room="gbrain"]`).click();
  await page.waitForTimeout(300);
  const gbrainRow = page.locator(`${DESK} .desk-gbrain.show`).first();
  if (!hasGbrain) {
    if ((await gbrainRow.count()) > 0) ok(`${label}: gbrain is drawn on the Account tab without its service`);
    else bad(`${label}: gbrain is missing from the Account tab`);
    await page.locator('#brandbtn').click();
  } else if (!(await page.evaluate(async () => (await (await fetch('/api/gbrain')).json()).installed))) {
    // NOT INSTALLED is a legal, first-class state (install-contract.md § The tab rule):
    // the room must be exactly one Load button, not the status panel.
    try {
      await page.waitForSelector(`${DESK} .desk-gbrain .gb-privacy button`, { timeout: 8000 });
      const btn = await page.locator(`${DESK} .desk-gbrain .gb-privacy button`).first().textContent();
      if (/load|retry/i.test(btn || '')) ok(`${label}: gbrain room offers the one-press Load while not installed`);
      else bad(`${label}: gbrain not installed but the room's button says "${btn}", wanted Load`);
    } catch {
      bad(`${label}: gbrain not installed and the room offered no Load button`);
    }
    await page.locator('#brandbtn').click();
  } else {
      try {
        await page.waitForSelector(`${DESK} .desk-gbrain .gb-privacy .gb-row`, { timeout: 8000 });
        const rows = await page.locator(`${DESK} .desk-gbrain .gb-privacy .gb-row`).count();
        if (rows === 5) ok(`${label}: gbrain service room loads its five privacy facts`);
        else bad(`${label}: gbrain service room loaded ${rows} privacy facts, wanted 5`);
        const answerRow = await page.locator(`${DESK} .desk-gbrain .gb-card .gb-row`).filter({ hasText: 'Answers' }).first().textContent();
        if (/composed by the agent \(by design\)|gbrain composition available|unknown/.test(answerRow || '')) {
          ok(`${label}: gbrain names who composes answers beside search`);
        } else bad(`${label}: gbrain did not name who composes answers`);
        const ask = page.locator(`${DESK} .desk-gbrain .gb-integration button`).first();
        if (await ask.count()) {
          await ask.click();
          // IT CROSSES SURFACES NOW, and that is the half worth asserting. gbrain is a
          // desk room; ＋ New is a Commons tab. The Commons' `showPane` names a pane but
          // does not RAISE the panel — every caller used to be inside it already — so a
          // hand-off from the desk has to lower the desk and raise the Commons first, or
          // the launcher opens filled-in and invisible behind the desk. It did exactly
          // that for one run on 2026-08-18; this probe is why that lasted one run.
          const handoff = await page.evaluate(() => ({
            deskUp: !document.getElementById('cowork-view')?.hidden,
            homeUp: !!document.querySelector('.home.show'),
            pane: document.querySelector('.home.show')?.dataset.pane,
            prompt: document.querySelector('.home.show .home-null textarea')?.value || '',
          }));
          if (handoff.homeUp && !handoff.deskUp && handoff.pane === 'new'
              && handoff.prompt.includes('connect') && handoff.prompt.includes('gbrain')) {
            ok(`${label}: an integration hands an editable request across to PersonalAssistant`);
          } else bad(`${label}: gbrain hand-off landed wrong — desk up=${handoff.deskUp}, home up=${handoff.homeUp}, pane=${handoff.pane}`);
          // The handoff deliberately changes the shared launcher's mode and form.
          // Reload so this probe cannot alter the later launch-validation premise.
          //
          // AND THEN WAIT FOR THE BOOT TO FINISH, exactly as runPass waits after its own
          // goto. `reload()` alone resolves on `load`, which is long before this page is
          // usable (2026-08-18). main.js's init awaits fetchSessions() and only THEN runs
          // `guard('reattach saved sessions')`, whose `tile.connect()` calls `hideHome()`
          // (tile.js) — so on a busy box that step lands a second or two after the reload
          // and SHUTS whatever panel has been opened in the meantime. Caught by stack trace
          // rather than by argument: the tab-strip probe below opened the Commons, pressed
          // Enter, watched the right room land, and then had the panel closed under it
          // ~250ms later from main.js:81. It failed about two runs in five and blamed the
          // tablist every time — the same shape of lie as the System-sheet cascade above.
          //
          // THE RACE IS THE PRODUCT'S, NOT THIS SCRIPT'S, and waiting here does not repeal
          // it: a person who presses ⛩ while the page is still booting has the Commons
          // taken away from them too. Reported to the owner 2026-08-18; if it is fixed, the
          // probe for it belongs here as its own journey, not as a fault this one absorbs.
          // What the wait buys is that the journeys below test what they say they test.
          await page.reload({ waitUntil: 'networkidle' });
          await page.waitForSelector('.tile');
          await page.waitForTimeout(3000);
        } else bad(`${label}: gbrain listed no available integration action`);
      } catch {
        bad(`${label}: gbrain service room did not load its status`);
      }
      await page.evaluate(() => document.querySelector('.home.show .home-x')?.click());
  }

  // 4 — the ONE gear: ⚙ in the bar is the COWORK COMMONS (2026-08-27) — on the parked grid
  // page the `cowork` destination at full width, six tabs on the Kit's channel surface; on
  // the cowork_space the same surface placed in a workspace (team-view.js). What this
  // asserts is unchanged from the desk it replaced: one gear, one surface, the appearance
  // flip works from it, a skin re-skins the running app, and ⚙ again is the way back.
  // No overlay, so nothing can intercept pointer events for the probes that follow.
  const CC_TAB = (id) => `${DESK} .cc-pane[data-tab="${id}"]`;
  const ccTab = async (n) => { await page.locator(`${DESK} .wk-channel-service-tab`).nth(n).click(); await page.waitForTimeout(700); };
  await openDesk();
  try {
    await page.waitForSelector(`${DESK} .cc`, { timeout: 3000 });
    ok(`${label}: the Campaign Workbench opens the Ronin Desk`);
  } catch {
    bad(`${label}: the Campaign Workbench did not open the Ronin Desk`);
  }
  const ccNames = await page.locator(`${DESK} .wk-channel-service-tab`).allTextContents();
  if (ccNames.length === 8) ok(`${label}: the cowork commons carries eight tabs — ${ccNames.join(' · ')}`);
  else bad(`${label}: the cowork commons has ${ccNames.length} tabs, wanted 8`);
  // The Desk profile tab must DRAW the picker (its pane was missing from the desk's per-room
  // CSS list once, 2026-08-27, and the row counted while showing nothing).
  await ccTab(2);
  // The rows arrive after two reads (the skin list, the profile) — wait for them, never a
  // fixed pause: 700ms lost the race about one run in three (2026-08-27).
  await page.waitForSelector(`${CC_TAB('profile')} .sys-skin`, { timeout: 8000 }).catch(() => {});
  const profileRows = await page.locator(`${CC_TAB('profile')} .sys-skin:visible`).count();
  if (profileRows >= 2) ok(`${label}: the Desk profile tab shows the picker — Stock plus ${profileRows - 1} profile(s)`);
  else bad(`${label}: the Desk profile tab shows ${profileRows} visible row(s) — the pane is not drawing`);
  // The Keypad tab holds the pad's card INLINE — not a sheet (owner, 2026-08-27).
  await ccTab(7);
  const padInline = await page.locator(`${DESK} .cc-pane[data-tab="keypad"] .pad-card .pad-board`).count() > 0;
  if (padInline) ok(`${label}: the Keypad tab holds the pad's board inline`);
  else bad(`${label}: the Keypad tab does not hold the pad's board`);

  await ccTab(1); // Account: appearance, skins, the flip — the Appearance row on the rail
  await page.locator(`${DESK} .desk-row[data-room="appearance"]`).click();
  await page.waitForTimeout(300);
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.locator(`${CC_TAB('account')} .sys-flip`).click();
  await page.waitForTimeout(200);
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.locator(`${CC_TAB('account')} .sys-flip`).click();
  await page.waitForTimeout(200);
  const backBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (lightBg !== darkBg && backBg === darkBg) ok(`${label}: the flip button flips the shell and back (${darkBg} ⇄ ${lightBg})`);
  else bad(`${label}: theme flip broken — dark=${darkBg} light=${lightBg} back=${backBg}`);
  const failAfterTheme = await page.evaluate(() => !!document.getElementById('failbar'));
  if (failAfterTheme) bad(`${label}: the theme flip raised the failure banner`);

  // SKINS — a skin is design tokens and nothing else, so the probe reads a TOKEN and then
  // a rendered element (the bar's ⚙, always drawn): the variable proves the block landed,
  // the element proves the app actually wears it. Shipped skins only here; the user's own
  // copy is a store this gate must not write to.
  const skinPick = `${CC_TAB('account')} .sys-skin`;
  const skins = await page.locator(skinPick).count();
  if (skins >= 2) ok(`${label}: the skin picker lists ${skins} skins from the catalog`);
  else bad(`${label}: the skin picker listed ${skins} skins, wanted at least 2`);
  const before = await page.evaluate(() => ({
    tok: getComputedStyle(document.documentElement).getPropertyValue('--radius-md').trim(),
    drawn: getComputedStyle(document.querySelector('#brandbtn')).borderRadius,
  }));
  await page.locator(skinPick, { hasText: 'Square' }).first().click();
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({
    tok: getComputedStyle(document.documentElement).getPropertyValue('--radius-md').trim(),
    drawn: getComputedStyle(document.querySelector('#brandbtn')).borderRadius,
  }));
  if (after.tok !== before.tok && after.drawn !== before.drawn) {
    ok(`${label}: a skin re-skins the running app (--radius-md ${before.tok}→${after.tok}, drawn ${before.drawn}→${after.drawn})`);
  } else bad(`${label}: picking a skin changed nothing — token ${before.tok}→${after.tok}, drawn ${before.drawn}→${after.drawn}`);
  // A COLOUR SKIN MUST KEEP THE FLIP — the case that actually broke. `paper` carries a dark
  // face and a light face, and the bug this catches is silent in both directions: a prefix
  // that eats one of the token's own dashes parses to zero tokens, so the skin applies
  // nothing and looks merely subtle rather than broken (2026-08-19, one run).
  await page.locator(skinPick, { hasText: 'Paper' }).first().click();
  await page.waitForTimeout(250);
  const faceA = await page.evaluate(() => ({
    shell: document.documentElement.dataset.theme,
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
  }));
  await page.locator(`${CC_TAB('account')} .sys-flip`).click();
  await page.waitForTimeout(350);
  const faceB = await page.evaluate(() => ({
    shell: document.documentElement.dataset.theme,
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
  }));
  if (faceA.bg !== faceB.bg && faceA.shell !== faceB.shell) {
    ok(`${label}: a colour skin keeps the flip — ${faceA.shell} ${faceA.bg} ⇄ ${faceB.shell} ${faceB.bg}`);
  } else bad(`${label}: the skin's two faces did not follow the shell — ${JSON.stringify(faceA)} vs ${JSON.stringify(faceB)}`);
  await page.locator(`${CC_TAB('account')} .sys-flip`).click(); // back to the shell we arrived in
  await page.waitForTimeout(250);

  // Put the shared browser profile back on Stock before this journey leaves Appearance.
  await page.locator(skinPick, { hasText: 'Stock' }).first().click();
  await page.waitForTimeout(200);

  // ⚙ TOGGLES, and the grid comes back — verify this before the skin composition proof,
  // whose direct hash loads deliberately replace the document.
  await page.locator('#brandbtn').click();
  await page.waitForSelector('[data-workspace-view="home"]:not([hidden])', { timeout: 3000 });
  ok(`${label}: Ronin returns from the Desk to the root landing`);

  if (args.includes('--staging')) {
  // WORKSPACE SKIN ACCEPTANCE — the three shipped Team-oriented consumers have no skin
  // path of their own. Drive the canonical skin module, visit the real registered views,
  // and read computed feature/Foundation geometry. These comparisons deliberately span
  // every shipped skin axis: shape, space/type, surface colour and font. A feature literal
  // that pins one of those roles makes the corresponding rendered comparison stay equal.
  const setShippedSkin = async (name) => {
    const expected = await page.evaluate(async (wanted) => {
    const { listSkins, setSkin } = await import('./js/skins.js');
    const skin = (await listSkins()).find((entry) => entry.name === wanted);
    if (!skin) throw new Error(`shipped skin missing: ${wanted}`);
    setSkin(skin);
      const shell = document.documentElement.dataset.theme;
      return { ...skin.tokens, ...(shell === 'light' ? skin.light : skin.dark) };
    }, name);
    if (Object.keys(expected).length) {
      await page.waitForFunction((tokens) => {
        const style = getComputedStyle(document.documentElement);
        return Object.entries(tokens).every(([token, value]) => style.getPropertyValue(token).trim() === value);
      }, expected, { timeout: 5000 });
    }
  };
  const workspaceSkinReadings = async () => {
    const readings = Object.fromEntries(
      ['square', 'soft', 'tight', 'roomy', 'paper', 'mono'].map((name) => [name, {}]),
    );
    for (const [view, route, targets] of [
      ['League', '#/league-workspace', { shape: '.league-selector', surface: '.tw-cell', feature: '.league-selector .wk-card', backdrop: true }],
      ['Team', '#/team', { shape: '.tw-kanban', surface: '.tw-kanban', feature: '.tw-cards' }],
      ['New Team', '#/new-team', { shape: '.nt-definition', surface: '.nt-definition', feature: '.nt-definition h2' }],
    ]) {
      await page.goto(URL_.replace(/#.*$/, '') + route, { waitUntil: 'networkidle', timeout: 30_000 });
      const root = `[data-workspace-view="${view.toLowerCase().replace(' ', '-')}"]:not([hidden])`;
      for (const selector of new Set([targets.shape, targets.surface, targets.feature])) {
        await page.waitForSelector(`${root} ${selector}:not([hidden])`, { timeout: 5000 });
      }
      for (const name of Object.keys(readings)) {
        await setShippedSkin(name);
        await page.waitForTimeout(150);
        readings[name][view] = await page.locator(root).evaluate((node, selected) => {
          const shapeStyle = getComputedStyle(node.querySelector(selected.shape));
          let surfaceNode = node.querySelector(selected.surface);
          let surfaceStyle = getComputedStyle(surfaceNode);
          if (selected.backdrop) {
            while (surfaceNode.parentElement && surfaceStyle.backgroundColor === 'rgba(0, 0, 0, 0)') {
              surfaceNode = surfaceNode.parentElement;
              surfaceStyle = getComputedStyle(surfaceNode);
            }
          }
          const featureStyle = getComputedStyle(node.querySelector(selected.feature));
          return {
            radius: shapeStyle.borderRadius,
            surface: surfaceStyle.backgroundColor,
            font: featureStyle.fontFamily,
            spacing: [featureStyle.padding, featureStyle.marginTop, featureStyle.marginBottom].join('|'),
            type: featureStyle.fontSize,
          };
        }, targets);
      }
    }
    return readings;
  };
  await setShippedSkin('stock');
  const stockRadius = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--radius-md').trim());
  const workspaceSkins = await workspaceSkinReadings();
  for (const view of ['League', 'Team', 'New Team']) {
    const proof = workspaceSkins;
    const changed = {
      radius: proof.square[view].radius !== proof.soft[view].radius,
      spaceOrType: proof.tight[view].spacing !== proof.roomy[view].spacing
        || proof.tight[view].type !== proof.roomy[view].type,
      surface: proof.roomy[view].surface !== proof.paper[view].surface,
      font: proof.paper[view].font !== proof.mono[view].font,
    };
    if (Object.values(changed).every(Boolean)) {
      ok(`${label}: ${view} inherits skin tokens for radius, space/type, surface and font`);
    } else {
      bad(`${label}: ${view} skin inheritance incomplete — ${JSON.stringify({ changed, proof: Object.fromEntries(Object.entries(proof).map(([skin, byView]) => [skin, byView[view]])) })}`);
    }
  }
  await setShippedSkin('stock');
  const stockRestored = await page.evaluate(async (expected) => {
    const { currentSkin } = await import('./js/skins.js');
    return currentSkin() === 'stock'
      && getComputedStyle(document.documentElement).getPropertyValue('--radius-md').trim() === expected;
  }, stockRadius);
  if (stockRestored) ok(`${label}: workspace skin proof restores canonical Stock state and tokens`);
  else bad(`${label}: workspace skin proof did not restore canonical Stock state and tokens`);
  await page.goto(URL_.replace(/#.*$/, '') + '#/sessions', { waitUntil: 'networkidle', timeout: 30_000 });

  // Stock was restored through the same module before returning to Sessions: this probe
  // shares a browser profile with the ones after it, so no skin state may leak onward.
  } else {
    console.log(`  note — ${label}: workspace skin composition proof runs against the staged dev client`);
  }

  // 4 — the Commons strip is a real tablist: arrows move focus along it, Enter lands
  // the focused room. (Activation stays deliberate — focus alone must not open a room.)
  //
  // ONE NAMED TILE, never `.tile.active` (2026-08-18). This probe used to aim its clicks at
  // `.tile.active …` and read its answer from an UNSCOPED `document.querySelector('.home
  // .show')`, and both name a tile the probe never chose. `.active` is set by focusin
  // (tile.js `activate`) and the gbrain journey above RELOADS the page, so from the day
  // gbrain registered on this box NO tile carried `.active` by the time this ran. Every
  // `?.` then no-oped in silence: the Commons never opened, focus was still on the bar
  // where the System sheet's Escape had just put it back, ArrowRight moved nothing, and
  // `arrowed` read `undefined`. `landed` still said "sessions" — the unscoped read found
  // tile 2's own home panel, because a SESSIONLESS tile shows one — so the sentence "focus
  // on undefined, landed sessions" described a pane no key had touched. It was called
  // intermittent for a day because it tracked whether anything had happened to focus a
  // tile, not whether the tablist worked.
  //
  // Then the Enter landed on the bar and reopened the System sheet, and the note journey
  // below died thirty seconds later on `#syssheet intercepts pointer events`, taking the
  // whole run with it. One stranded focus, two unrelated-looking failures, the second fatal
  // and the second the one everybody read. So the keys are pressed ONLY once focus is
  // PROVEN to sit on a tab: a probe that cannot reach its subject says so and stops, rather
  // than typing into whatever happened to be focused.
  const tile1 = page.locator('.tile').first();
  // A KNOWN STARTING STATE FIRST, and it is a PRECONDITION rather than an assertion — the
  // subject here is the tablist, not the panel's arrival. ⛩ TOGGLES since 2026-08-17
  // (tile.js `toggleHome`), so pressing it blind is only safe once the panel is known to be
  // down. Measured 2026-08-18: the gbrain journey above reloads the page and tile 1 spends a
  // moment SESSIONLESS, and a sessionless tile shows its own home panel — so on some runs
  // the strip was already up with an arbitrary tab selected and ArrowRight wrapped off the
  // end of it. Waiting for the panel to be DOWN makes ⛩ mean "open" every time and pins the
  // selected tab to ⌂ Roster, which is what makes the arrow's answer predictable. (It is
  // also the point at which boot's reattach has landed — see the note on that reload, and
  // do not shorten this wait without reading it.)
  const settled = await tile1
    .locator('.home.show').first().waitFor({ state: 'hidden', timeout: 10_000 })
    .then(() => true, () => false);
  if (!settled) {
    bad(`${label}: tile 1 never settled back onto its session — the tab strip had no known starting state`);
  } else {
    // ⛩ is the Commons and stayed in the header row; メ (.tmore-btn) is the drop beside it.
    // They are not interchangeable, whatever the comment that used to sit here said.
    await tile1.locator('.tile-head button.menu').click();
    const onTab = tile1.locator('.home.show .home-tabrow [aria-selected="true"]').first();
    let focused = false;
    try {
      await onTab.waitFor({ timeout: 3000 });
      focused = await onTab.evaluate((el) => (el.focus(), document.activeElement === el));
    } catch { /* focused stays false, and is reported rather than typed through */ }
    if (!focused) {
      bad(`${label}: ⛩ never raised the Commons strip over the first tile — the tablist was unreachable`);
    } else {
      await page.keyboard.press('ArrowRight');
      const arrowed = await page.evaluate(() => document.activeElement?.dataset?.pane);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      // THIS tile's pane, not the document's first — see the scoping note above. Read
      // through evaluate and not `locator(...).getAttribute()`: a locator READ BLOCKS for
      // the full 30s timeout when the panel is not there, and on 2026-08-18 that turned a
      // probe that should have said "landed null" into another whole-run crash. A journey
      // asking "what happened" must be able to answer "nothing" immediately.
      const landed = await tile1.evaluate((t) => t.querySelector('.home.show')?.dataset.pane ?? null);
      if (arrowed && landed === arrowed) ok(`${label}: tab strip: ArrowRight moves focus, Enter lands the room (${landed})`);
      else bad(`${label}: tab strip keyboard broken — focus on "${arrowed}", landed "${landed}"`);
      // CLEANUP, so it is best-effort and must not be able to block. A locator click waits
      // the full 30s for an element that is not coming and takes the whole run down with
      // it; putting the strip back where the next probe expects it is housekeeping, and
      // housekeeping that can fail the gate is a second failure mode for no assertion.
      await tile1.evaluate((t) => t.querySelector('.home.show .home-tabrow [data-pane="sessions"]')?.click());
    }
  }

  // 5 — the note sheet keeps the ui.sheet contract: opens from the tile head, focus
  // enters, Escape closes and gives focus back to the opener.
  await page.evaluate(() => document.querySelector('.home.show .home-x')?.click());
  await page.waitForTimeout(200);
  // 📝 lives behind メ since 2026-08-17 — six controls came off the row into its drop.
  await page.locator('.tile .tile-head button.tmore-btn').first().click();
  await page.locator('.tile .tile-head button.note').first().click();
  try {
    await page.waitForSelector('#notesheet.open textarea:not([disabled])', { timeout: 4000 });
    ok(`${label}: 📝 opens the note sheet and the editor is live`);
  } catch {
    bad(`${label}: the note sheet did not open (or never enabled its editor)`);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const noteAfter = await page.evaluate(() => ({
    open: document.getElementById('notesheet')?.classList.contains('open'),
    focusBack: document.activeElement?.classList?.contains('note'),
  }));
  if (!noteAfter.open && noteAfter.focusBack) ok(`${label}: Escape closes the sheet and returns focus to 📝`);
  else bad(`${label}: sheet close broken — open=${noteAfter.open} focusReturned=${noteAfter.focusBack}`);

  // 6 — the launch journey, VALIDATION half. Deliberately not a real spawn: a gate
  // that launches sessions on every verify is a gate spawning work, so what is proven
  // is the refusal contract — manual mode with no name must refuse LOCALLY: focus
  // lands on the name field and no /api/launch request leaves the page.
  await page.keyboard.press('Control+Shift+KeyN'); // the real route in: ⌃⇧N opens the launcher (か New left the bar 2026-08-27)
  await page.waitForTimeout(300);
  const kindBtn = page.locator('.tile.active .ks-btn').first();
  if ((await kindBtn.count()) === 0) {
    console.log('  note — no session_roles in the catalog; the launch-validation journey skipped');
  } else {
    let launched = false;
    // A SPAWN IS A POST TO EXACTLY `/api/launch`, and the match has to say so. It used to
    // be `url().includes('/api/launch')`, which caught any route sharing the prefix —
    // and the launcher now GETs `/api/launch-profile` on every pick to ask the server
    // what the pair resolves to (src/launch-profile.ts), so a read was being counted as
    // a session being spawned. Exact pathname + method is strictly STRONGER: it still
    // catches every real spawn, including the bare variant, and nothing else.
    const sniff = (req) => {
      if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/launch') launched = true;
    };
    page.on('request', sniff);
    await kindBtn.click();
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const name = document.querySelector('.tile.active .ks-name');
      if (name) name.value = ''; // manual mode requires it — the refusal under test
    });
    await page.locator('.tile.active .home-go').click();
    await page.waitForTimeout(300);
    page.off('request', sniff);
    const focusOnName = await page.evaluate(() => document.activeElement?.classList?.contains('ks-name'));
    if (!launched && focusOnName) ok(`${label}: launch with no name refuses locally — focus lands on the name, nothing sent`);
    else bad(`${label}: launch validation broken — sent=${launched} focusOnName=${focusOnName}`);

    // 6b — THE PAYLOAD, which is the half a refusal cannot prove. Still not a real spawn:
    // the body is read off the request the page WOULD have sent and the send is aborted,
    // so this stays a gate that spawns nothing.
    //
    // REGRESSION, 2026-08-22: a Commons launch that reaches the server naming NO axis
    // falls through to `launch_bare` and is born a bare shell with a blank letter — no
    // agent, no reading. That is a correct outcome for the tile picker and for
    // `OpenShell`, and a silent failure for every ordinary click, so the axis has to be
    // proven ON THE WIRE rather than in the form.
    // THE BODY IS CAUGHT IN THE PAGE, not on the wire, and that is deliberate. Playwright
    // route interception has to answer the request somehow: an abort is a network failure
    // and a non-2xx is a "Failed to load resource" — and the browser logs BOTH to the
    // console, which this gate's own no-JS-errors check then fails on. Standing in for
    // `fetch` inside the page hands back a synthetic Response, so nothing leaves the
    // browser, nothing spawns, and no console entry is written. What is captured is the
    // exact serialized body the client built, which is what the regression is about.
    await page.evaluate(() => {
      window.__launchBody = null;
      window.__fetchWas = window.fetch;
      window.fetch = (url, init) => {
        if (String(url).includes('/api/launch') && init?.method === 'POST') {
          window.__launchBody = init.body;
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'smoke gate — read and refused, never spawned' }), {
              status: 409,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        return window.__fetchWas(url, init);
      };
    });
    const pick = page.locator('.tile.active .ks-btn[data-task]:not([data-task=""])').first();
    if ((await pick.count()) === 0) {
      console.log('  note — no task button on the board; the launch-payload journey skipped');
    } else {
      await pick.click();
      await page.waitForTimeout(400); // the pick asks the server what it resolves to
      await page.evaluate(() => {
        const t = document.querySelector('.tile.active .ks-form textarea');
        if (t) { t.value = 'smoke — never sent'; t.dispatchEvent(new Event('input', { bubbles: true })); }
        const n = document.querySelector('.tile.active .ks-name');
        if (n) n.value = 'zz_smoke_never_spawns';
      });
      await page.locator('.tile.active .home-go').click();
      await page.waitForTimeout(600);
      const sent = await page.evaluate(() => {
        try { return JSON.parse(window.__launchBody ?? 'null'); } catch { return 'unparseable'; }
      });
      if (sent && sent !== 'unparseable' && sent.session_role && sent.project_root) {
        ok(`${label}: an ordinary launch names its axis on the wire (session_role="${sent.session_role}")`);
      } else {
        bad(`${label}: launch payload lost its axis — a body naming none is born a bare shell. Sent: ${JSON.stringify(sent)}`);
      }
    }
    await page.evaluate(() => { if (window.__fetchWas) window.fetch = window.__fetchWas; });
    // Put the form and the panel away so later probes meet the terminal again.
    await page.evaluate(() => {
      [...document.querySelectorAll('.tile.active .ks-form button')].find((b) => b.textContent === 'Cancel')?.click();
      document.querySelector('.home.show .home-x')?.click();
    });
    await page.waitForTimeout(200);
  }

  // 7 — the FAILED-SAVE journey: the note sheet's save fails (injected at the route,
  // so the server never sees it) and the contract must hold — the sheet stays open,
  // the typed text survives, and the line says why. This is the "failures stop
  // impersonating success" rule, proven rather than promised.
  const TYPED = 'typed by the gate — must survive the failure';
  // The 500 below is OURS: the browser logs every failed resource, and the collector
  // must not report the gate's own injection as a page fault. Errors present before
  // the injection stay; the injected one is removed after, by its exact shape.
  const errsBefore = jsErrors.length;
  await page.route('**/note', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'gate-injected failure' }) })
      : route.continue(),
  );
  // 📝 lives behind メ since 2026-08-17 — six controls came off the row into its drop.
  await page.locator('.tile .tile-head button.tmore-btn').first().click();
  await page.locator('.tile .tile-head button.note').first().click();
  try {
    await page.waitForSelector('#notesheet.open textarea:not([disabled])', { timeout: 4000 });
    await page.locator('#notesheet textarea').fill(TYPED);
    await page.evaluate(() => {
      [...document.querySelectorAll('#notesheet .ns-bar button')].find((b) => b.textContent === 'Save')?.click();
    });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({
      open: document.getElementById('notesheet')?.classList.contains('open'),
      text: document.querySelector('#notesheet textarea')?.value,
      said: document.querySelector('#notesheet .ns-msg')?.textContent || '',
    }));
    if (after.open && after.text === TYPED && /not saved/.test(after.said)) {
      ok(`${label}: a failed save keeps the sheet open, keeps the text, and says why`);
    } else {
      bad(`${label}: failed-save contract broken — open=${after.open} textKept=${after.text === TYPED} said="${after.said}"`);
    }
  } catch {
    bad(`${label}: the note sheet did not open for the failed-save journey`);
  }
  await page.unroute('**/note');
  for (let i = jsErrors.length - 1; i >= errsBefore; i--) {
    if (/Failed to load resource.*500/.test(jsErrors[i])) jsErrors.splice(i, 1);
  }
  await page.keyboard.press('Escape');

  // SESSIONS COEXISTS WITH WORKSPACE VIEWS — the raw 1/2/4 Tile grid is a first-class
  // destination, not an implementation phase that League or Team may replace. Use only
  // the gate's throwaway session (never an owner's), keep the other three slots blank so
  // the exact four-slot map is distinguishable, and cross real direct-entry routes. A
  // round trip must preserve layout, map and live rendering, not merely redraw four boxes.
  const sessionsReading = () => page.evaluate(() => ({
    layout: Number(document.getElementById('grid')?.dataset.layout),
    map: [...document.querySelectorAll('select.sess')].map((picker) => picker.value),
    visible: [...document.querySelectorAll('.tile')].filter((tile) => getComputedStyle(tile).display !== 'none').length,
  }));
  // The 1·2·4 count left the bar on 2026-08-27 (the cowork_space's shape is the roster's
  // 2 | 4); the parked grid page is set through the module the pad's ▚ key uses.
  const setSessionsLayout = async (wanted) => {
    await page.evaluate((n) => import('/js/viewport.js').then((m) => m.setLayout(n)), wanted);
    await page.waitForTimeout(150);
    return sessionsReading();
  };
  const waitForProbePaint = async () => {
    for (let attempt = 0; attempt < 14; attempt++) {
      const state = await painted(page);
      if (state.xterm > 20 || state.tape > 20) return true;
      await page.waitForTimeout(1000);
    }
    return false;
  };
  const sessionsRoundTrip = async (layout, destination) => {
    const before = await setSessionsLayout(layout);
    const mappedProbe = before.map[0] === PROBE && before.map.slice(1).every((session) => !session);
    const paintedBefore = await waitForProbePaint();
    if (before.layout !== layout || before.visible !== layout || !mappedProbe || !paintedBefore) {
      bad(`${label}: Sessions ${layout}-Tile baseline is not truthful — ${JSON.stringify({ before, mappedProbe, paintedBefore })}`);
      return;
    }

    const route = destination === 'team' ? '#/team' : '#/league-workspace';
    await page.goto(URL_.replace(/#.*$/, '') + route, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForSelector(`[data-workspace-view="${destination}"]:not([hidden])`, { timeout: 5000 });
    await page.goto(URL_.replace(/#.*$/, '') + '#/sessions', { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForSelector('[data-workspace-view="sessions"]:not([hidden]) .tile', { timeout: 5000 });

    const after = await sessionsReading();
    const paintedAfter = await waitForProbePaint();
    if (after.layout === layout && after.visible === layout
      && JSON.stringify(after.map) === JSON.stringify(before.map) && paintedAfter) {
      ok(`${label}: Sessions ${layout}-Tile layout/map and live Tile survive ${destination} round trip`);
    } else {
      bad(`${label}: Sessions ${layout}-Tile state changed across ${destination} — ${JSON.stringify({ before, after, paintedAfter })}`);
    }
  };

  // Blank the unused display slots through their real pickers. This changes only this
  // browser tab's mapping; it neither attaches to nor stops any other session.
  for (let slot = 1; slot < 4; slot++) await page.locator('select.sess').nth(slot).selectOption('');
  await sessionsRoundTrip(1, 'league');
  await sessionsRoundTrip(2, 'team');
  await sessionsRoundTrip(4, 'league');
  await sessionsRoundTrip(4, 'team');
}

/**
 * THE PHONE PASS — the shell, not the workbench. On an iPhone-class viewport main.js
 * never boots the workbench (js/phone.js, the MOBILE plan): the page is the three-step
 * drill-down, so the workbench probes above would fail it for not being a page it is
 * deliberately no longer. This walks the owner's own journey instead: the Coworks,
 * the probe's Cowork, the Agent's stage with the keys row docked on the composer.
 */
async function runPhonePass({ label, browser, contextOpts }) {
  const { page, jsErrors, netFails } = await openPage(browser, contextOpts);
  // Catch the FIRST paintable state, not merely the settled page. The phone used to
  // reveal index.html's desktop bar (including the "2" shape button), then hide it only
  // after buildPhone marked the body. A settled-state assertion cannot see that flash.
  await page.addInitScript(() => {
    const timer = setInterval(() => {
      // The init script itself runs while the parser is still above index.html's inline
      // veil, when computed visibility is briefly its default. The contract begins when
      // application code removes this class, so sample that transition and nothing prior.
      if (!document.body || document.documentElement.classList.contains('boot-pending')) return;
      window.__roninFirstVisible = {
        phone: !!document.getElementById('phone'),
        bar: document.getElementById('bar') ? getComputedStyle(document.getElementById('bar')).display : null,
      };
      clearInterval(timer);
    }, 0);
  });
  try {
    await page.goto(URL_.replace(/#.*$/, ''), { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (e) {
    bad(`${label}: page did not load: ${e.message}`);
  }
  await page.waitForTimeout(3000);
  const shell = await page.evaluate(() => ({
    phone: !!document.getElementById('phone'),
    barHidden: !document.getElementById('bar') || getComputedStyle(document.getElementById('bar')).display === 'none',
    failBar: document.getElementById('failbar')?.innerText.trim().slice(0, 400) || null,
  }));
  const firstVisible = await page.evaluate(() => window.__roninFirstVisible || null);
  if (firstVisible?.phone && firstVisible.bar === 'none') ok(`${label}: first paint is the phone shell, never desktop chrome`);
  else bad(`${label}: first paint exposed desktop chrome before the phone shell (${JSON.stringify(firstVisible)})`);
  if (shell.phone) ok(`${label}: the phone shell mounted`);
  else bad(`${label}: no phone shell — the workbench booted on a phone viewport`);
  if (shell.barHidden) ok(`${label}: the workbench chrome is hidden whole`);
  else bad(`${label}: the desktop bar is still showing over the shell`);
  if (shell.failBar) bad(`${label}: the failure banner is showing:\n         ` + shell.failBar.replace(/\n/g, '\n         '));
  else ok(`${label}: no failure banner`);

  if (!probeAvailable) {
    console.log(`  SKIP — ${label}: the drill-down journey needs the probe session (session capacity is full)`);
  } else {
    // Screen 1 → 2: the probe is teamless, so it lives behind the unassigned Cowork.
    const teamCard = page.locator('#phone .ph-card[href="#/m/t/%20unassigned"]').first();
    await teamCard.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
    if (await teamCard.count()) {
      await teamCard.tap();
      ok(`${label}: the Coworks screen offers the probe's Cowork`);
    } else bad(`${label}: the unassigned Cowork card never appeared on the Coworks screen`);
    // Screen 2 → 3: the Agent card, by its route.
    const agentCard = page.locator(`#phone .ph-card[href="#/m/s/%20unassigned/${PROBE}"]`).first();
    await agentCard.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
    if (await agentCard.count()) {
      await agentCard.tap();
      await page.waitForTimeout(1500);
      ok(`${label}: the Cowork screen offers the probe Agent`);
    } else bad(`${label}: the probe's Agent card never appeared on its Cowork screen`);
    // Screen 3: the stage — keys row and composer docked, tile head replaced by the bar.
    const stage = await page.evaluate(() => {
      const head = document.querySelector('#phone .tile-head');
      return {
        keys: document.querySelectorAll('#phone .keysrow button').length,
        composer: !!document.querySelector('#phone .composer.show'),
        headHidden: !head || getComputedStyle(head).display === 'none',
      };
    });
    if (stage.keys >= 9) ok(`${label}: the keys row is on the stage (${stage.keys} keys, zero taps away)`);
    else bad(`${label}: the keys row is missing or short (${stage.keys} keys)`);
    if (stage.composer) ok(`${label}: the composer is docked on the stage`);
    else bad(`${label}: no composer on the stage`);
    if (stage.headHidden) ok(`${label}: the tile head yields to the shell bar`);
    else bad(`${label}: the tile head is still painting under the shell bar`);
    let paintedOk = false;
    for (let i = 0; i < 14 && !paintedOk; i++) {
      await page.waitForTimeout(1000);
      const p = await painted(page);
      if (p.xterm > 20 || p.tape > 20) {
        ok(`${label}: the probe painted on the stage (${p.tape > 20 ? `tape ${p.tape}` : `terminal ${p.xterm}`} chars)`);
        paintedOk = true;
      }
    }
    if (!paintedOk) bad(`${label}: attached ${PROBE} on the stage and the pane stayed EMPTY`);
    // メ: the Agent's own controls, one sheet.
    await page.tap('#phone .ph-bar .tdrop-btn');
    await page.waitForTimeout(300);
    const meOpen = await page.evaluate(() => !!document.querySelector('#phone .tdrop.open'));
    if (meOpen) ok(`${label}: メ opens the Agent sheet`);
    else bad(`${label}: メ did not open the Agent sheet`);
    await page.tap('#phone .ph-title');
    await page.waitForTimeout(200);
    // ‹ back: the journey reverses.
    await page.tap('#phone .ph-back');
    await page.waitForTimeout(600);
    const backAt = await page.evaluate(() => location.hash);
    if (backAt === '#/m/t/%20unassigned') ok(`${label}: ‹ returns to the Cowork's Agents`);
    else bad(`${label}: ‹ landed on "${backAt}", wanted the Cowork's Agents`);
  }

  if (jsErrors.length) bad(`${label}: uncaught JS errors:\n         ` + jsErrors.join('\n         '));
  else ok(`${label}: no uncaught JS errors`);
  if (netFails.length) bad(`${label}: failed requests:\n         ` + netFails.join('\n         '));
  else ok(`${label}: no failed requests`);
}

/**
 * THE AXE SCAN — serious/critical violations at three representative states. axe-core
 * is a host tool (ui-host.mjs loadAxeSource); absent = a SKIP that says so, the same
 * bargain as the browser itself. color-contrast is EXCLUDED here on purpose: contrast
 * policy is check-css's contrast floor, which holds the measured tiers both themes —
 * including the documented sub-AA `--muted` secondary tier the owner's density ruling
 * keeps (docs/ui.md). Everything else at serious+critical fails the gate.
 */
async function checkA11y(page, label, axeSrc) {
  if (!axeSrc) {
    console.log(`  note — axe-core not installed (cd ~/.cache/ronin-host-tools && npm i axe-core); a11y scan skipped`);
    return;
  }
  await page.addScriptTag({ content: axeSrc });
  const scan = async (state) => {
    const bad2 = await page.evaluate(async () => {
      const r = await axe.run(document, {
        resultTypes: ['violations'],
        rules: { 'color-contrast': { enabled: false } },
      });
      return r.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id} (${v.impact}) ×${v.nodes.length} e.g. ${v.nodes[0]?.target?.join(' ')}`);
    });
    if (bad2.length) bad(`${label}: axe ${state}:\n         ` + bad2.join('\n         '));
    else ok(`${label}: axe ${state} — no serious/critical violations`);
  };
  await scan('at rest');
  // Ronin Home is the root state behind the Torii.
  await page.locator('#brandbtn').click();
  await page.waitForTimeout(300);
  await scan('on Ronin Home');
  // 📝 lives behind メ since 2026-08-17 — six controls came off the row into its drop.
  await page.locator('.tile .tile-head button.tmore-btn').first().click();
  await page.locator('.tile .tile-head button.note').first().click();
  await page.waitForTimeout(400);
  await scan('with the note sheet open');
  await page.keyboard.press('Escape');
}

async function runPass({ label, browser, contextOpts }) {
  const { page, jsErrors, netFails } = await openPage(browser, contextOpts);
  // Hold session discovery after the selected workspace can mount. The first visible
  // desktop frame must arrive while this unrelated read is still pending; otherwise a
  // reload is just the bare theme canvas until every boot enrichment finishes.
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
  // Agent cards show their readable title; the fixed session ID remains the resource key.
  // Never make seating depend on those two strings happening to be identical.
  const probeCard = page.locator(`.wk-card[data-workbench-offer-resource="${PROBE}"]`).first();
  if (probeAvailable) {
    // The Team roster is fed by its own live refresh. Waiting at the card is the real
    // readiness boundary; a one-time count raced that refresh and intermittently skipped
    // the click, then blamed the downstream Tile label for being absent.
    await probeCard.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
    if (await probeCard.count()) { await probeCard.click(); await page.waitForTimeout(1200); }
  }
  // API health can answer before the phone workbench finishes constructing its Tiles.
  // Readiness is the probe seated through the selector, not an arbitrary sleep;
  // checkDom still reports the same failure below when it never arrives.
  if (probeAvailable) {
    await page.locator(`[data-workbench-surface="session.terminal"][data-workbench-resource="${PROBE}"] .tile-head .sess`).first()
      .waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
  }

  // THIS is the check that catches a constructor throw — the 2026-08-08 outage.
  if (jsErrors.length) bad(`${label}: uncaught JS errors:\n         ` + jsErrors.join('\n         '));
  else ok(`${label}: no uncaught JS errors`);
  if (netFails.length) bad(`${label}: failed requests:\n         ` + netFails.join('\n         '));
  else ok(`${label}: no failed requests`);

  await checkDom(page, label);
  if (probeAvailable) {
    await attachProbe(page, label);
    // The in-Tile Docs editor shares `.tile-body` with xterm. Exercise that exact
    // bubbling seam: a pointer gesture in the editor must retain editor focus instead
    // of the body's terminal-focus handler stealing it.
    const docsFocus = await page.evaluate(() => {
      // Warm terminal pools keep hidden Tiles mounted. A hidden pool seat is no more a
      // focus target than a closed Docs overlay, so take the body the person can see.
      const body = [...document.querySelectorAll('.tile .tile-body')].find((node) => node.getClientRects().length);
      if (!body) return { kept: false, active: '', reason: 'no visible tile body' };
      const overlay = body.querySelector('.tile-doc-view');
      const area = overlay?.querySelector('.dc-text');
      if (!overlay || !area) return { kept: false, active: '', reason: 'Docs editor is absent' };
      // Match a successfully loaded text document without reading or writing a user's
      // file. The controls and event wiring are the real ones created by buildDocs().
      overlay.classList.add('open');
      overlay.dataset.view = 'edit';
      area.disabled = false;
      area.focus();
      const before = `${document.activeElement?.tagName || ''}.${document.activeElement?.className || ''}`;
      const rect = area.getBoundingClientRect();
      area.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      const kept = document.activeElement === area;
      const active = `${document.activeElement?.tagName || ''}.${document.activeElement?.className || ''}`;
      overlay.classList.remove('open');
      overlay.dataset.view = 'list';
      area.disabled = true;
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

// The gate's own pane. Live sessions are never touched — see attachProbe.
//
// CLEANUP IS ARMED BEFORE THE PROBE EXISTS, and covers every way this process can end
// (2026-08-18). `exit` already caught the ordinary paths — including an uncaught
// TimeoutError out of a journey, which is the way this gate usually dies — but NOTHING
// caught a signal other than SIGINT, and a run stopped by a harness timeout, a closed
// terminal or a plain `kill` dies on SIGTERM/SIGHUP with `exit` never firing. That is how a
// `gate_probe_*` outlives its run and turns up in the owner's roster. It also RATCHETS: on
// a box at its session max one orphan is the difference between the next run getting a
// probe and being refused one. stopProbe is idempotent — killing a session that is not
// there is a no-op — so arming it a line early costs nothing and closes the window where a
// crash between create and arm would leak.
process.on('exit', stopProbe);
// No stopProbe() in here on purpose: process.exit() fires the `exit` handler above, and
// cleanup living in exactly one place is what makes "unconditional" checkable.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => process.exit(sig === 'SIGINT' ? 130 : 143));
}
probeAvailable = startProbe();
if (!probeAvailable && !/REFUSED:\s*at the session max\b/i.test(String(probeRefusal))) {
  // WHAT REFUSED IT, IN ITS OWN WORDS, AND THEN STOP. This used to say "could not create
  // the gate probe session (is the tmux server up?)" and carry on running every probe
  // below. Both halves were wrong on 2026-08-17: the tmux server was up, the box was at its
  // session max, and ronin-may-spawn says so explicitly — but the text was a guess and it
  // sent people hunting for a fault in the tree. With no probe session there is nothing for
  // attachProbe to attach, so the tile stays empty, every control that `needs: 'session'`
  // is correctly inert, and the journeys below time out clicking disabled buttons. Twenty
  // failures describing a cause that is not the UI is worse than none.
  //
  // A session-cap refusal is handled below as a narrow live-pane SKIP while both browsers
  // still prove the page. Every other refusal exits 1: a missing server, broken shim or
  // unexplained tmux failure must not turn into an environmental skip.
  console.error(
    '\nFAIL: the gate could not create its own probe session, so it never looked at the page.' +
    '\nWhat refused it:\n\n' + String(probeRefusal).replace(/^/gm, '  ') + '\n',
  );
  process.exit(1);
}
if (!probeAvailable) {
  console.log(`  note — live-pane probe skipped: ${String(probeRefusal).trim()}`);
}

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
  ? `PASSED — desktop and phone [${engine}] both render and paint a live pane.\n`
  : `PASSED — desktop and phone [${engine}] render cleanly; live-pane checks skipped at session capacity.\n`);
