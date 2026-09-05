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
  const label = `${options.phone ? 'phone' : 'desktop'} ${options.theme} ${options.reducedMotion}`;
  const ctx = await context(browser, options);
  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('requestfailed', (request) => failed.push(`${request.url()} ${request.failure()?.errorText || ''}`));
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
      selectors: [...(active?.querySelectorAll('.wk-workbench-selector-cards .wk-card-heading') || [])].map((node) => node.textContent?.trim()),
      presets: active?.querySelectorAll('.sp-slot').length || 0,
      legacyPhone: !!document.getElementById('phone'),
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 1,
    };
  });
  if (state.profile === 'setup' && state.title === 'Ronin Setup' && state.island === 'Ronin Setup') ok(`${label}: title, island, and fourth-workbench profile agree`);
  else bad(`${label}: identity mismatch ${JSON.stringify(state)}`);
  if (state.workspaces.length === 2 && state.workspaces[0]?.surface === 'setup.presets' && state.workspaces[1]?.surface === 'setup.register') ok(`${label}: Presets is pinned in WS1 and Register opens in WS2`);
  else bad(`${label}: initial seating mismatch ${JSON.stringify(state.workspaces)}`);
  const expected = ['Register', 'Model providers', 'Workspace folders', 'Ronin Services', 'gbrain', 'Templates'];
  if (JSON.stringify(state.selectors) === JSON.stringify(expected) && state.presets === 7) ok(`${label}: selector order and seven presets are complete`);
  else bad(`${label}: selector/preset mismatch ${JSON.stringify({ selectors: state.selectors, presets: state.presets })}`);
  if (!state.legacyPhone && !state.overflow) ok(`${label}: responsive workbench fits without the retired phone shell`);
  else bad(`${label}: responsive layout mismatch ${JSON.stringify({ legacyPhone: state.legacyPhone, overflow: state.overflow })}`);

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
  await setupPass(browser, { phone: false, theme: 'light', reducedMotion: 'no-preference' });
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
