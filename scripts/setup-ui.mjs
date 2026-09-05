#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { defaultUrl, loadPlaywright } from './lib/ui-host.mjs';

const URL_ = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || defaultUrl(true);
const ARTIFACTS = process.env.RONIN_SETUP_ARTIFACTS || '/tmp/ronin-setup-verify';
const playwright = await loadPlaywright();
if (!playwright) throw new Error('Playwright is required for the Setup rendering gate');
fs.mkdirSync(ARTIFACTS, { recursive: true });

const failures = [];
const ok = (message) => console.log(`  ok   — ${message}`);
const bad = (message) => { failures.push(message); console.log(`  FAIL — ${message}`); };

async function context(browser, { phone = false, theme = 'light', reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({
    viewport: phone ? { width: 402, height: 681 } : { width: 1400, height: 900 },
    isMobile: phone,
    hasTouch: phone,
    colorScheme: theme,
    reducedMotion,
  });
  await ctx.addInitScript((chosen) => localStorage.setItem('tmuxgrid.theme', chosen), theme);
  return ctx;
}

async function runtimeBand(browser, count) {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.route('**/api/setup/runtime', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      activated_count: count,
      activated_band: count >= 2 ? 'two_plus' : count === 1 ? 'one' : 'zero',
      providers: [],
      roots: [],
    }),
  }));
  await page.goto(`${URL_.replace(/#.*$/, '')}#/home`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-workspace-view="home"]:not([hidden]) .ch-door');
  const doors = await page.locator('.ch-door').evaluateAll((nodes) => nodes.map((node) => ({
    name: node.querySelector('h2')?.textContent,
    href: node.getAttribute('href'),
    disabled: node.getAttribute('aria-disabled'),
    gate: node.querySelector('.ch-gate')?.textContent || '',
  })));
  const expectedSettings = count >= 2 ? '#/campaign' : '#/setup';
  if (doors.length === 3 && doors[0]?.name === 'Machine Settings' && doors[0]?.href === expectedSettings) ok(`${count} providers: Machine Settings defaults to ${expectedSettings.slice(2)}`);
  else bad(`${count} providers: wrong Three Blocks settings route ${JSON.stringify(doors)}`);
  const locked = doors.slice(1).every((door) => door.disabled === 'true' && /Activate one model provider/.test(door.gate));
  const open = doors.slice(1).every((door) => door.disabled === null && !door.gate);
  if ((count === 0 && locked) || (count > 0 && open)) ok(`${count} providers: Teams and New Project gate correctly`);
  else bad(`${count} providers: Teams/New Project gate mismatch ${JSON.stringify(doors.slice(1))}`);
  await ctx.close();
}

async function setupPass(browser, options) {
  const label = `${options.phone ? 'phone' : 'desktop'} ${options.theme} ${options.reducedMotion} ${options.providerCount ?? 2}-providers${options.ready ? '-ready' : '-blocked'}`;
  const ctx = await context(browser, options);
  const page = await ctx.newPage();
  const providerRows = [
    { id: 'anthropic', label: 'Claude', state: options.ready ? 'activated' : 'installable', installable: !options.ready, installed: options.ready, activated: !!options.ready },
    { id: 'openai', label: 'Codex', state: 'installed', installed: true, activated: false },
  ].slice(0, options.providerCount ?? 2);
  const errors = [];
  const failed = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('requestfailed', (request) => failed.push(`${request.url()} ${request.failure()?.errorText || ''}`));
  await page.route('**/api/setup/runtime', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      activated_count: options.ready ? 1 : 0,
      activated_band: options.ready ? 'one' : 'zero',
      providers: providerRows,
      roots: [],
      gbrain: { installed: false, active: false },
      services: { installed: false, active: false },
    }),
  }));
  await page.goto(`${URL_.replace(/#.*$/, '')}#/setup`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-workspace-view="setup"]:not([hidden]) .wk-workbench-layout');
  const state = await page.evaluate(() => {
    const active = document.querySelector('[data-workspace-view="setup"]:not([hidden])');
    return {
      profile: active?.querySelector('.wk-workbench-layout')?.dataset.workbenchProfile || '',
      title: document.title,
      island: document.querySelector('#viewplace')?.textContent?.trim() || '',
      workspaces: [...(active?.querySelectorAll('.wk-workbench-cell:not([hidden])') || [])].map((node) => ({
        id: node.dataset.workspace,
        surface: node.firstElementChild?.dataset.workbenchSurface || '',
      })),
      columns: [...(active?.querySelectorAll('.wk-workbench-layout > [data-surface]:not([hidden])') || [])].map((node) => node.getAttribute('data-surface')),
      selectors: [...(active?.querySelectorAll('.wk-workbench-selector-cards .wk-card-heading') || [])].map((node) => node.textContent?.trim()),
      providerCards: [...(active?.querySelectorAll('.wk-workbench-selector-cards [data-workbench-offer-resource]') || [])].map((node) => ({
        key: node.getAttribute('data-workbench-offer-resource'),
        label: node.querySelector('.wk-card-heading')?.textContent?.trim(),
      })),
      presets: active?.querySelectorAll('.sp-slot').length || 0,
      feedback: [...(document.querySelectorAll('button, a') || [])].some((node) => node.textContent?.trim() === 'Feedback' && node.getClientRects().length > 0),
      providerGroup: active?.querySelector('[data-setup-requirement-target="setup.providers"]')?.matches('.wk-selector-group') === true,
      stoneBoxes: [...(active?.querySelectorAll('.sp-slot') || [])].map((node) => {
        const box = node.getBoundingClientRect();
        return { width: box.width, height: box.height, top: box.top };
      }),
      launch: (() => {
        const node = [...(active?.querySelectorAll('button') || [])].find((item) => item.textContent?.trim() === 'Launch');
        if (!node) return null;
        const style = getComputedStyle(node);
        const kaki = getComputedStyle(document.documentElement).getPropertyValue('--kaki').trim();
        return { background: style.backgroundColor, border: style.borderColor, kaki, mark: !!node.querySelector('.wk-launch-mark') };
      })(),
      legacyPhone: !!document.getElementById('phone'),
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 1,
    };
  });
  if (state.profile === 'setup' && state.title === 'Ronin Setup' && state.island === 'Ronin Setup') ok(`${label}: title, island, and fourth-workbench profile agree`);
  else bad(`${label}: identity mismatch ${JSON.stringify(state)}`);
  if (state.workspaces.length === 2 && state.workspaces[0]?.surface === 'setup.register' && state.workspaces[1]?.surface === 'setup.presets') ok(`${label}: Register opens in WS1 and Presets is pinned in WS2`);
  else bad(`${label}: initial seating mismatch ${JSON.stringify(state.workspaces)}`);
  if (state.columns[0] === 'selector') ok(`${label}: selector is the left column`);
  else bad(`${label}: selector is not left ${JSON.stringify(state.columns)}`);
  const expected = ['Register', ...providerRows.map((row) => row.label), 'Workspace folders', 'Ronin Services', 'gbrain', 'Templates'];
  if (JSON.stringify(state.selectors) === JSON.stringify(expected) && state.presets === 7) ok(`${label}: selector order and seven presets are complete`);
  else bad(`${label}: selector/preset mismatch ${JSON.stringify({ selectors: state.selectors, presets: state.presets })}`);
  const expectedProviderCards = providerRows.map((row) => ({ key: row.id, label: row.label }));
  if (JSON.stringify(state.providerCards) === JSON.stringify(expectedProviderCards)) ok(`${label}: ${providerRows.length} Runtime provider rows render exactly ${providerRows.length} individual cards`);
  else bad(`${label}: Runtime provider rows/cards mismatch ${JSON.stringify({ expectedProviderCards, actual: state.providerCards })}`);
  if (providerRows.length === 0 || state.providerGroup) ok(`${label}: provider group is metadata only when provider cards exist`);
  else bad(`${label}: provider group metadata is absent or selectable`);
  const stoneWidths = state.stoneBoxes.map((box) => Math.round(box.width));
  const equalStones = new Set(stoneWidths).size === 1;
  const staggered = state.stoneBoxes.length > 2 && new Set(state.stoneBoxes.map((box) => Math.round(box.top))).size > 1;
  if (equalStones && staggered) ok(`${label}: seven preset stones are equal and staggered`);
  else bad(`${label}: preset stone geometry mismatch ${JSON.stringify(state.stoneBoxes)}`);
  if (!options.ready || (state.launch?.mark && state.launch.border !== state.launch.background)) ok(`${label}: Launch is gated or uses its mark and a neutral background with distinct outline`);
  else bad(`${label}: Launch treatment mismatch ${JSON.stringify(state.launch)}`);
  if (!state.feedback) ok(`${label}: Setup header has no Feedback control`);
  else bad(`${label}: Setup header still exposes Feedback`);
  if (!state.legacyPhone && !state.overflow) ok(`${label}: responsive workbench fits without the retired phone shell`);
  else bad(`${label}: responsive layout mismatch ${JSON.stringify({ legacyPhone: state.legacyPhone, overflow: state.overflow })}`);

  if (providerRows.length && !options.ready) {
    const stone = page.locator('.sp-slot').filter({ hasText: 'Bare Metal' }).first();
    const targets = page.locator('[data-setup-requirement-target]');
    await stone.hover();
    const hover = await targets.evaluateAll((nodes) => nodes.filter((node) => node.classList.contains('is-requirement-marked')).map((node) => node.getAttribute('data-setup-requirement-target')));
    if (JSON.stringify(hover) === JSON.stringify(['setup.providers', 'setup.provider:anthropic'])) ok(`${label}: blocked hover marks the exact provider heading and first activatable card persimmon`);
    else bad(`${label}: blocked hover target mismatch ${JSON.stringify(hover)}`);
    await stone.focus();
    const focus = await targets.evaluateAll((nodes) => nodes.filter((node) => node.classList.contains('is-requirement-marked')).map((node) => node.getAttribute('data-setup-requirement-target')));
    if (JSON.stringify(focus) === JSON.stringify(hover)) ok(`${label}: keyboard focus matches pointer hover`);
    else bad(`${label}: keyboard target mismatch ${JSON.stringify(focus)}`);
    await stone.click();
    const selected = await targets.evaluateAll((nodes) => nodes.filter((node) => node.classList.contains('is-requirement-marked')).map((node) => ({
      key: node.getAttribute('data-setup-requirement-target'),
      flashing: node.classList.contains('is-requirement-flashing'),
      iterations: getComputedStyle(node).animationIterationCount,
      animation: getComputedStyle(node).animationName,
    })));
    const persistent = selected.map((entry) => entry.key);
    const motionOK = options.reducedMotion === 'reduce'
      ? selected.every((entry) => entry.animation === 'none')
      : selected.every((entry) => entry.flashing && entry.iterations === '2');
    if (JSON.stringify(persistent) === JSON.stringify(hover) && motionOK) ok(`${label}: blocked selection persists and has the ruled two-flash/reduced-motion presentation`);
    else bad(`${label}: blocked selection presentation mismatch ${JSON.stringify(selected)}`);
  }

  const before = await page.evaluate(() => performance.timeOrigin);
  await page.locator('.ui-bar-place-toggle').click();
  await page.waitForSelector('[data-workspace-view="campaign"]:not([hidden])');
  await page.locator('.ui-bar-place-toggle').click();
  await page.waitForSelector('[data-workspace-view="setup"]:not([hidden])');
  const after = await page.evaluate(() => performance.timeOrigin);
  if (before === after) ok(`${label}: Setup/Settings toggle does not reboot the application`);
  else bad(`${label}: Setup/Settings toggle reloaded the document`);

  await page.locator('.ui-bar-place-toggle').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-workspace-view="campaign"]:not([hidden])');
  ok(`${label}: island toggle is keyboard operable`);

  await page.goto(`${URL_.replace(/#.*$/, '')}#/setup`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(ARTIFACTS, `${label.replaceAll(' ', '-')}.png`), fullPage: true });
  if (!errors.length && !failed.length) ok(`${label}: no console exceptions or failed requests`);
  else bad(`${label}: runtime errors ${JSON.stringify({ errors, failed })}`);
  await ctx.close();
}

const browser = await playwright.chromium.launch({ headless: true });
try {
  for (const count of [0, 1, 2]) await runtimeBand(browser, count);
  await setupPass(browser, { phone: false, theme: 'light', reducedMotion: 'no-preference', providerCount: 0 });
  await setupPass(browser, { phone: false, theme: 'light', reducedMotion: 'no-preference', providerCount: 2 });
  await setupPass(browser, { phone: false, theme: 'light', reducedMotion: 'no-preference', providerCount: 1, ready: true });
  await setupPass(browser, { phone: false, theme: 'dark', reducedMotion: 'reduce' });
  await setupPass(browser, { phone: true, theme: 'light', reducedMotion: 'no-preference' });
  await setupPass(browser, { phone: true, theme: 'dark', reducedMotion: 'reduce' });
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`setup-ui: FAILED (${failures.length})`);
  process.exit(1);
}
console.log(`setup-ui: passed; screenshots in ${ARTIFACTS}`);
