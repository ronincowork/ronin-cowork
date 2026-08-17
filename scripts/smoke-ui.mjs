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

import { execFileSync } from 'node:child_process';
import { HOST_TOOLS, defaultUrl, loadPlaywright, loadAxeSource } from './lib/ui-host.mjs';

// Host derivation and the playwright hunt both live in scripts/lib/ui-host.mjs — this
// script and check-tips need the same two answers, and when each had its own copy they
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
    const response = await route.fetch();
    const data = await response.json();
    if (data?.set?.owner && !String(data.set.owner.name ?? '').trim()) data.set.owner.name = 'Ronin rendering gate';
    await route.fulfill({ response, json: data });
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

/**
 * FIRST JOURNEYS — behaviour, not just paint. Desktop pass only for now: these drive
 * the pointer/keyboard surface, and the touch grammar (drops, hoisted header) deserves
 * probes written for it rather than these re-aimed. Each journey asserts a CONTRACT
 * from docs/ui.md: the bar-is-a-destination rule, the one pane registry, the theme
 * flip, and the sheet's focus round-trip. Kept few and unbrittle on purpose — this is
 * the seed of the journey layer, not a snapshot suite.
 */
async function checkJourneys(page, label, jsErrors) {
  // 1 — ⛩ Commons is a DESTINATION, not a menu (owner's ruling 2026-08-17): one press
  // lands on ⌂ Roster, and nothing drops. This probe asserted the popover's open/close
  // truth until then; the popover went with the menu it existed for.
  await page.locator('#commonsbtn').click();
  await page.waitForTimeout(300);
  const commons = await page.evaluate(() => ({
    pane: document.querySelector('.home.show')?.dataset.pane,
    // ONE strip, not every tile's. A sessionless tile shows its own home panel, so an
    // unscoped count returns 4 × 10 and "10 rooms" would silently never be what was checked.
    tabs: document.querySelector('.home.show .home-tabrow')?.querySelectorAll('button').length,
    menu: !!document.querySelector('.commons-menu'),
  }));
  if (commons.pane === 'sessions' && !commons.menu) ok(`${label}: ⛩ Commons goes straight to ⌂ Roster, and drops nothing`);
  else bad(`${label}: ⛩ Commons landed on "${commons.pane}"${commons.menu ? ' and dropped a menu' : ''}, wanted the roster`);
  if (commons.tabs === 10) ok(`${label}: the Commons strip carries all 10 rooms (registry-fed; ⚙ lives in the bar)`);
  else bad(`${label}: the Commons strip has ${commons.tabs} rooms, wanted 10`);

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
  // On the STRIP, since 2026-08-17 — it is the only registry-fed surface left, so it is
  // where "visible but inert" has to be true. The `.off` rule the tab wears is the same
  // one the menu row wore; only the surface asserting it moved.
  await page.locator('#commonsbtn').click();
  await page.waitForTimeout(300);
  const gbrainRow = page.locator('.home.show .home-tabrow [data-pane="gbrain"]').first();
  if (!hasGbrain) {
    if (await gbrainRow.isDisabled()) ok(`${label}: gbrain is visible but inert without its service`);
    else bad(`${label}: gbrain is clickable without its service`);
    await page.evaluate(() => document.querySelector('.home.show .home-x')?.click());
  } else {
    if (await gbrainRow.isDisabled()) bad(`${label}: gbrain service registered but its room is inert`);
    else if (!(await page.evaluate(async () => (await (await fetch('/api/gbrain')).json()).installed))) {
      // NOT INSTALLED is a legal, first-class state (install-contract.md § The tab
      // rule): the room must be exactly one Load button, not the status panel.
      await gbrainRow.click();
      try {
        await page.waitForSelector('.home.show[data-pane="gbrain"] .gb-privacy button', { timeout: 8000 });
        const btn = await page.locator('.home.show[data-pane="gbrain"] .gb-privacy button').first().textContent();
        if (/load|retry/i.test(btn || '')) ok(`${label}: gbrain room offers the one-press Load while not installed`);
        else bad(`${label}: gbrain not installed but the room's button says "${btn}", wanted Load`);
      } catch {
        bad(`${label}: gbrain not installed and the room offered no Load button`);
      }
      await page.evaluate(() => document.querySelector('.home.show .home-x')?.click());
    } else {
      await gbrainRow.click();
      try {
        await page.waitForSelector('.home.show[data-pane="gbrain"] .gb-privacy .gb-row', { timeout: 8000 });
        const rows = await page.locator('.home.show[data-pane="gbrain"] .gb-privacy .gb-row').count();
        if (rows === 5) ok(`${label}: gbrain service room loads its five privacy facts`);
        else bad(`${label}: gbrain service room loaded ${rows} privacy facts, wanted 5`);
        const ask = page.locator('.home.show[data-pane="gbrain"] .gb-integration button').first();
        if (await ask.count()) {
          await ask.click();
          const handoff = await page.evaluate(() => ({
            pane: document.querySelector('.home.show')?.dataset.pane,
            prompt: document.querySelector('.home.show .home-null textarea')?.value || '',
          }));
          if (handoff.pane === 'new' && handoff.prompt.includes('connect') && handoff.prompt.includes('gbrain')) {
            ok(`${label}: an integration hands an editable request to PersonalAssistant`);
          } else bad(`${label}: gbrain integration did not hand off to the New Session form`);
          // The handoff deliberately changes the shared launcher's mode and form.
          // Reload so this probe cannot alter the later launch-validation premise.
          await page.reload();
          await page.waitForSelector('.tile');
        } else bad(`${label}: gbrain listed no available integration action`);
      } catch {
        bad(`${label}: gbrain service room did not load its status`);
      }
      await page.evaluate(() => document.querySelector('.home.show .home-x')?.click());
    }
  }

  // 4 — the ONE gear: ⚙ in the bar opens the System sheet, and the appearance flip
  // button flips the shell and flips it back (auto-follow re-arms on the way back —
  // the colorScheme pin above makes dark the device mode here).
  await page.locator('#sysbtn').click();
  try {
    await page.waitForSelector('#syssheet.open', { timeout: 3000 });
    ok(`${label}: the bar's ⚙ opens the one System sheet`);
  } catch {
    bad(`${label}: the bar's ⚙ did not open the System sheet`);
  }
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.locator('#syssheet .sys-flip').click();
  await page.waitForTimeout(200);
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.locator('#syssheet .sys-flip').click();
  await page.waitForTimeout(200);
  const backBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (lightBg !== darkBg && backBg === darkBg) ok(`${label}: the flip button flips the shell and back (${darkBg} ⇄ ${lightBg})`);
  else bad(`${label}: theme flip broken — dark=${darkBg} light=${lightBg} back=${backBg}`);
  const failAfterTheme = await page.evaluate(() => !!document.getElementById('failbar'));
  if (failAfterTheme) bad(`${label}: the theme flip raised the failure banner`);
  // WAIT FOR THE SHEET TO BE GONE, do not sleep 200ms and hope (2026-08-17). This was a
  // fixed timeout, and roughly one run in two the sheet was still open when the next probe
  // started — so probe 4 focused a tab underneath a live modal and read `undefined`, and
  // the note-journey click later died on `#syssheet intercepts pointer events` after
  // 30 seconds. Both failures blamed the product; neither was the product. A gate that
  // fails one run in two teaches people to re-run it, which is how a real failure gets
  // waved through.
  // `#syssheet.open` DETACHED, not `#syssheet:not(.open)` visible: a ui.sheet is built once
  // and lives for the page, so the closed sheet is still in the DOM and merely hidden —
  // and waitForSelector's default state is `visible`, so the obvious spelling waits for a
  // hidden div to appear and times out every time. Matching on `.open` and waiting for the
  // match to vanish asks the question the class actually answers.
  await page.keyboard.press('Escape');
  await page.waitForSelector('#syssheet.open', { state: 'detached', timeout: 3000 });

  // 4 — the Commons strip is a real tablist: arrows move focus along it, Enter lands
  // the focused room. (Activation stays deliberate — focus alone must not open a room.)
  await page.evaluate(() => {
    const t = document.querySelector('.tile.active .tile-head button.menu');
    t?.click(); // メ — bring the Commons up so the strip is on screen
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('.tile.active .home-tabrow [aria-selected="true"]')?.focus());
  await page.keyboard.press('ArrowRight');
  const arrowed = await page.evaluate(() => document.activeElement?.dataset?.pane);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const landed = await page.evaluate(() => document.querySelector('.home.show')?.dataset.pane);
  if (arrowed && landed === arrowed) ok(`${label}: tab strip: ArrowRight moves focus, Enter lands the room (${landed})`);
  else bad(`${label}: tab strip keyboard broken — focus on "${arrowed}", landed "${landed}"`);
  await page.evaluate(() => {
    const t = document.querySelector('.tile.active .home-tabrow [data-pane="sessions"]');
    t?.click();
  });

  // 5 — the note sheet keeps the ui.sheet contract: opens from the tile head, focus
  // enters, Escape closes and gives focus back to the opener.
  await page.evaluate(() => document.querySelector('.home.show .home-x')?.click());
  await page.waitForTimeout(200);
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
  await page.locator('#newbtn').click(); // the real route in: か New opens the launcher
  await page.waitForTimeout(300);
  const kindBtn = page.locator('.tile.active .ks-btn').first();
  if ((await kindBtn.count()) === 0) {
    console.log('  note — no session_jobs in the catalog; the launch-validation journey skipped');
  } else {
    let launched = false;
    const sniff = (req) => {
      if (req.url().includes('/api/launch')) launched = true;
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
}

/**
 * PHONE JOURNEYS — the touch grammar's own probes, run in the phone pass: the ニ sheet
 * opens and dismisses, the Commons is reachable through it, and the tab strip lands a
 * room by tap. Few and unbrittle, same policy as the desktop set.
 */
async function checkPhoneJourneys(page, label) {
  await page.tap('#bar .tdrop-btn.ni');
  await page.waitForTimeout(200);
  const niOpen = await page.evaluate(() => !!document.querySelector('.tdrop.open'));
  if (niOpen) ok(`${label}: ニ opens the app sheet`);
  else return bad(`${label}: ニ did not open its sheet`);
  // A row is a door, and since 2026-08-17 Commons is a door to ONE place: ⌂ Roster.
  // It opened a second menu inside the sheet until then — a sheet dropping a menu over
  // itself was three taps deep on a 402px phone, which is most of why the menu went.
  await page.tap('#commonsbtn');
  await page.waitForTimeout(300);
  const pane = await page.evaluate(() => document.querySelector('.home.show')?.dataset.pane);
  if (pane === 'sessions') ok(`${label}: ニ → Commons lands on ⌂ Roster in one tap`);
  else bad(`${label}: ニ → Commons landed on "${pane}", wanted "sessions"`);
  const sheetGone = await page.evaluate(() => !document.querySelector('.tdrop.open'));
  if (sheetGone) ok(`${label}: the sheet closed behind the door it opened`);
  else bad(`${label}: the ニ sheet stayed open over the pane`);
  // The strip: the only way to a specific room, so tap one — ▧ Docs — and come back.
  await page.tap('.tile .home-tabrow [data-pane="docs"]');
  await page.waitForTimeout(300);
  const docs = await page.evaluate(() => document.querySelector('.home.show')?.dataset.pane);
  if (docs === 'docs') ok(`${label}: the tab strip lands ▧ Docs by tap`);
  else bad(`${label}: strip tap landed "${docs}", wanted "docs"`);
  await page.tap('.tile .home-tabrow [data-pane="sessions"]');
  await page.waitForTimeout(200);
  const back = await page.evaluate(() => document.querySelector('.home.show')?.dataset.pane);
  if (back === 'sessions') ok(`${label}: the tab strip lands ⌂ Roster by tap`);
  else bad(`${label}: strip tap landed "${back}", wanted "sessions"`);
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
  // The Commons panel, not a menu: ⛩ drops nothing since 2026-08-17, so the second
  // state worth scanning is the room it lands in — a tab strip and a live roster.
  await page.locator('#commonsbtn').click();
  await page.waitForTimeout(300);
  await scan('with the Commons open on ⌂ Roster');
  await page.evaluate(() => document.querySelector('.home.show .home-x')?.click());
  await page.locator('.tile .tile-head button.note').first().click();
  await page.waitForTimeout(400);
  await scan('with the note sheet open');
  await page.keyboard.press('Escape');
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
  if (label === 'desktop') {
    await checkJourneys(page, label, jsErrors);
    await checkA11y(page, label, await loadAxeSource());
  } else {
    await checkPhoneJourneys(page, label);
  }

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
