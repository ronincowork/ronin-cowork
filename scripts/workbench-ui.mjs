#!/usr/bin/env node
/** Focused rendered contract for the one Workbench and its current profiles/tenants. */
import { defaultUrl, loadPlaywright } from './lib/ui-host.mjs';

const playwright = await loadPlaywright();
if (!playwright) throw new Error('Playwright is required for check:workbench-ui');
const browser = await playwright.chromium.launch({ headless: true });
const routes = [
  { hash: 'campaign', profile: 'campaign' },
  { hash: 'cowork', profile: 'cowork' },
  { hash: 'team/campaign_config', profile: 'team' },
  { hash: 'launch', profile: 'launch' },
];
const fail = (message) => { throw new Error(message); };

try {
  for (const expected of routes) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`${defaultUrl()}#/${expected.hash}`);
    const frame = page.locator('.wk-workbench-layout:visible');
    await frame.waitFor();
    if (await frame.getAttribute('data-workbench-profile') !== expected.profile) fail(`${expected.hash}: wrong Workbench.profile`);
    if (await page.locator('.tw-cell:visible,.tw-column:visible,.cv-selector:visible,.tw-kanban:visible').count()) fail(`${expected.hash}: legacy frame survived`);

    const shape = page.locator('#shapecycle:visible');
    if (await shape.textContent() !== '4') await shape.click();
    const cells = page.locator('.wk-workbench-cell:visible');
    if (await cells.count() !== 4) fail(`${expected.hash}: the granite did not reveal all four workspaces`);
    const ids = await cells.evaluateAll((items) => items.map((item) => item.dataset.workspace).sort());
    if (ids.join(',') !== 'workspace1,workspace2,workspace3,workspace4') fail(`${expected.hash}: workspace ids differ`);

    const heads = page.locator('.wk-workbench-host:visible .wk-surface-header:visible,.wk-workbench-host:visible .wk-channel-service-tabs:visible,.wk-workbench-host:visible .tile-head:visible');
    const metrics = await heads.evaluateAll((items) => [...new Set(items.map((item) => `${Math.round(item.getBoundingClientRect().height)}|${getComputedStyle(item).backgroundColor}`))]);
    if (await heads.count() !== 5 || metrics.length !== 1) fail(`${expected.hash}: headers are not one fixed band per selector/workspace`);
    const headTitles = page.locator('.wk-workbench-host:visible .wk-surface-header-title:visible,.wk-workbench-host:visible .wk-channel-service-title:visible,.wk-workbench-host:visible .tile-head .sess:visible');
    const titleType = await headTitles.evaluateAll((items) => [...new Set(items.map((item) => {
      const style = getComputedStyle(item);
      return `${style.fontFamily}|${style.fontSize}|${style.fontWeight}|${style.lineHeight}`;
    }))]);
    if (await headTitles.count() !== 5 || titleType.length !== 1) fail(`${expected.hash}: Workbench header titles do not share one typography contract`);

    const cards = page.locator('.wk-workbench-selector-cards .wk-card:visible');
    const cardCount = await cards.count();
    for (let index = 0; index < cardCount; index += 1) {
      await page.locator('.wk-workbench-cell[data-workspace="workspace1"]:visible').click();
      await cards.nth(index).click();
      if (!await page.locator('.wk-workbench-cell[data-workspace="workspace1"] > [data-workbench-surface]').count()) fail(`${expected.hash}: selector card ${index + 1} did not resolve through Workbench.library`);
    }
    const first = cards.first();
    for (const id of ['workspace1', 'workspace2']) {
      await page.locator(`.wk-workbench-cell[data-workspace="${id}"]:visible`).click();
      await first.click();
    }
    const placed = page.locator('.wk-workbench-cell:visible > [data-workbench-surface]');
    if (await placed.count() < 2) fail(`${expected.hash}: the same library surface did not instantiate twice`);
    const unique = await placed.evaluateAll((items) => new Set(items).size);
    if (unique !== await placed.count()) fail(`${expected.hash}: workspaces share a surface node`);
    if (errors.length) fail(`${expected.hash}: ${errors.join('; ')}`);
    await page.close();
  }
  console.log('check-workbench-ui: one granite, four profiles, four seats, independent surface instances');
} finally {
  await browser.close();
}
