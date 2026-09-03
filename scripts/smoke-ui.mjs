#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { HOST_TOOLS, defaultUrl, loadPlaywright, loadAxeSource } from './lib/ui-host.mjs';

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
  tmux(['kill-session', '-t', `=${PROBE}`]);
  try {
    execFileSync('tmux', ['new-session', '-d', '-s', PROBE, '-x', '120', '-y', '40'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    probeRefusal = String(e?.stderr ?? '').trim() || `tmux new-session failed: ${e?.message ?? e}`;
    return false;
  }
  tmux(['set-option', '-t', PROBE, '@ronin-control', 'user']);
  tmux(['set-option', '-t', PROBE, '@ronin_note', 'throwaway — the render gate, killed when it finishes']);
  for (let i = 0; i < 30; i++) tmux(['send-keys', '-t', PROBE, `echo ${BANNER} ${i}`, 'Enter']);
  return true;
}

function stopProbe() { tmux(['kill-session', '-t', `=${PROBE}`]); }

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

async function checkJourneys(page, label, jsErrors) {
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
  const commonsRooms = PANES().filter((pane) => pane.surface === 'commons').length; // PANES is a function since KOKUGO (labels read the lexicon)
  if (commons.tabs === commonsRooms) ok(`${label}: the Commons strip carries its ${commonsRooms} session rooms (registry-fed)`);
  else bad(`${label}: the Commons strip has ${commons.tabs} rooms, wanted ${commonsRooms}`);

  await page.locator('.home.show .home-tabrow [data-pane="wipe"]').first().click();
  await page.waitForTimeout(300);
  const pane = await page.evaluate(() => document.querySelector('.home.show')?.dataset.pane);
  if (pane === 'wipe') ok(`${label}: a strip tab lands on the ▤ Wipeboard pane`);
  else bad(`${label}: the strip tab landed on pane "${pane}", wanted "wipe"`);
  await page.evaluate(() => document.querySelector('.home.show .home-x')?.click());

  const hasGbrain = await page.evaluate(async () => (await (await fetch('/api/version')).json()).services?.includes('gbrain'));
  await openDesk();
  const ccTabs = await page.locator(`${DESK} .wk-channel-service-tab`).allTextContents();
  if (ccTabs.length === 8) ok(`${label}: the cowork commons carries its eight tabs (${ccTabs.join(' · ')})`);
  else bad(`${label}: the cowork commons has ${ccTabs.length} tabs, wanted 8`);
  await page.locator(`${DESK} .wk-channel-service-tab`).nth(1).click(); // Account
  await page.waitForTimeout(200);
  await page.locator(`${DESK} .desk-row[data-room="gbrain"]`).click();
  await page.waitForTimeout(300);
  const gbrainRow = page.locator(`${DESK} .desk-gbrain.show`).first();
  if (!hasGbrain) {
    if ((await gbrainRow.count()) > 0) ok(`${label}: gbrain is drawn on the Account tab without its service`);
    else bad(`${label}: gbrain is missing from the Account tab`);
    await page.locator('#brandbtn').click();
  } else if (!(await page.evaluate(async () => (await (await fetch('/api/gbrain')).json()).installed))) {
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
          await page.reload({ waitUntil: 'networkidle' });
          await page.waitForSelector('.tile');
          await page.waitForTimeout(3000);
        } else bad(`${label}: gbrain listed no available integration action`);
      } catch {
        bad(`${label}: gbrain service room did not load its status`);
      }
      await page.evaluate(() => document.querySelector('.home.show .home-x')?.click());
  }

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
  await ccTab(2);
  await page.waitForSelector(`${CC_TAB('profile')} .sys-skin`, { timeout: 8000 }).catch(() => {});
  const profileRows = await page.locator(`${CC_TAB('profile')} .sys-skin:visible`).count();
  if (profileRows >= 2) ok(`${label}: the Desk profile tab shows the picker — Stock plus ${profileRows - 1} profile(s)`);
  else bad(`${label}: the Desk profile tab shows ${profileRows} visible row(s) — the pane is not drawing`);
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

  await page.locator(skinPick, { hasText: 'Stock' }).first().click();
  await page.waitForTimeout(200);

  await page.locator('#brandbtn').click();
  await page.waitForSelector('[data-workspace-view="home"]:not([hidden])', { timeout: 3000 });
  ok(`${label}: Ronin returns from the Desk to the root landing`);

  if (args.includes('--staging')) {
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

  } else {
    console.log(`  note — ${label}: workspace skin composition proof runs against the staged dev client`);
  }

  const tile1 = page.locator('.tile').first();
  const settled = await tile1
    .locator('.home.show').first().waitFor({ state: 'hidden', timeout: 10_000 })
    .then(() => true, () => false);
  if (!settled) {
    bad(`${label}: tile 1 never settled back onto its session — the tab strip had no known starting state`);
  } else {
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
      const landed = await tile1.evaluate((t) => t.querySelector('.home.show')?.dataset.pane ?? null);
      if (arrowed && landed === arrowed) ok(`${label}: tab strip: ArrowRight moves focus, Enter lands the room (${landed})`);
      else bad(`${label}: tab strip keyboard broken — focus on "${arrowed}", landed "${landed}"`);
      await tile1.evaluate((t) => t.querySelector('.home.show .home-tabrow [data-pane="sessions"]')?.click());
    }
  }

  await page.evaluate(() => document.querySelector('.home.show .home-x')?.click());
  await page.waitForTimeout(200);
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

  await page.keyboard.press('Control+Shift+KeyN');
  await page.waitForTimeout(300);
  const kindBtn = page.locator('.tile.active .ks-btn').first();
  if ((await kindBtn.count()) === 0) {
    console.log('  note — no session_roles in the catalog; the launch-validation journey skipped');
  } else {
    let launched = false;
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
    await page.evaluate(() => {
      [...document.querySelectorAll('.tile.active .ks-form button')].find((b) => b.textContent === 'Cancel')?.click();
      document.querySelector('.home.show .home-x')?.click();
    });
    await page.waitForTimeout(200);
  }

  const TYPED = 'typed by the gate — must survive the failure';
  const errsBefore = jsErrors.length;
  await page.route('**/note', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'gate-injected failure' }) })
      : route.continue(),
  );
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

  const sessionsReading = () => page.evaluate(() => ({
    layout: Number(document.getElementById('grid')?.dataset.layout),
    map: [...document.querySelectorAll('select.sess')].map((picker) => picker.value),
    visible: [...document.querySelectorAll('.tile')].filter((tile) => getComputedStyle(tile).display !== 'none').length,
  }));
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

  for (let slot = 1; slot < 4; slot++) await page.locator('select.sess').nth(slot).selectOption('');
  await sessionsRoundTrip(1, 'league');
  await sessionsRoundTrip(2, 'team');
  await sessionsRoundTrip(4, 'league');
  await sessionsRoundTrip(4, 'team');
}

async function runPhonePass({ label, browser, contextOpts }) {
  const { page, jsErrors, netFails } = await openPage(browser, contextOpts);
  await page.addInitScript(() => {
    const timer = setInterval(() => {
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
    const teamCard = page.locator('#phone .ph-card[href="#/m/t/%20unassigned"]').first();
    await teamCard.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
    if (await teamCard.count()) {
      await teamCard.tap();
      ok(`${label}: the Coworks screen offers the probe's Cowork`);
    } else bad(`${label}: the unassigned Cowork card never appeared on the Coworks screen`);
    const agentCard = page.locator(`#phone .ph-card[href="#/m/s/%20unassigned/${PROBE}"]`).first();
    await agentCard.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
    if (await agentCard.count()) {
      await agentCard.tap();
      await page.waitForTimeout(1500);
      ok(`${label}: the Cowork screen offers the probe Agent`);
    } else bad(`${label}: the probe's Agent card never appeared on its Cowork screen`);
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
    await page.tap('#phone .ph-bar .tdrop-btn');
    await page.waitForTimeout(300);
    const meOpen = await page.evaluate(() => !!document.querySelector('#phone .tdrop.open'));
    if (meOpen) ok(`${label}: メ opens the Agent sheet`);
    else bad(`${label}: メ did not open the Agent sheet`);
    await page.tap('#phone .ph-title');
    await page.waitForTimeout(200);
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
  await page.locator('#brandbtn').click();
  await page.waitForTimeout(300);
  await scan('on Ronin Home');
  await page.locator('.tile .tile-head button.tmore-btn').first().click();
  await page.locator('.tile .tile-head button.note').first().click();
  await page.waitForTimeout(400);
  await scan('with the note sheet open');
  await page.keyboard.press('Escape');
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
  if (probeAvailable) {
    await attachProbe(page, label);
    const docsFocus = await page.evaluate(() => {
      const body = [...document.querySelectorAll('.tile .tile-body')].find((node) => node.getClientRects().length);
      if (!body) return { kept: false, active: '', reason: 'no visible tile body' };
      const overlay = body.querySelector('.tile-doc-view');
      const area = overlay?.querySelector('.dc-text');
      if (!overlay || !area) return { kept: false, active: '', reason: 'Docs editor is absent' };
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

process.on('exit', stopProbe);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => process.exit(sig === 'SIGINT' ? 130 : 143));
}
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
  ? `PASSED — desktop and phone [${engine}] both render and paint a live pane.\n`
  : `PASSED — desktop and phone [${engine}] render cleanly; live-pane checks skipped at session capacity.\n`);
