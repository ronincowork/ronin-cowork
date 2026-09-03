#!/usr/bin/env node
import { createRequire } from 'node:module';
import { homedir } from 'node:os';

const require = createRequire(`${homedir()}/.cache/ronin-host-tools/`);
const { chromium } = require('playwright');
const url = process.argv[2];
if (!url) throw new Error('usage: node scripts/zz-waterfall.mjs "$(ronin-url)"');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true, ...(process.env.RONIN_PROFILE_IDENTITY ? { extraHTTPHeaders: { 'accept-encoding': 'identity' } } : {}) });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: Number(process.env.RONIN_PROFILE_RTT || 40), downloadThroughput: 12_500_000, uploadThroughput: 12_500_000 });
await page.addInitScript(() => {
  window.__roninTimeline = [];
  addEventListener('DOMContentLoaded', () => {
    const seen = new Set();
    const sample = () => {
      if (!document.getElementById('bootframe') && !seen.has('frame-replaced')) { seen.add('frame-replaced'); window.__roninTimeline.push({ event: 'frame-replaced', ms: Math.round(performance.now()) }); }
      for (const node of document.querySelectorAll('[data-workbench-surface]')) {
        const name = node.dataset.workbenchSurface;
        if (!seen.has(name)) { seen.add(name); window.__roninTimeline.push({ event: `surface:${name}`, ms: Math.round(performance.now()) }); }
      }
    };
    new MutationObserver(sample).observe(document.body, { childList: true, subtree: true });
    sample();
  });
});
const started = performance.now();
const requests = [];
const failed = [];
const errors = [];
page.on('request', (request) => requests.push({ request, at: performance.now() }));
page.on('requestfailed', (request) => failed.push(`${request.url()} — ${request.failure()?.errorText}`));
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(url, { waitUntil: 'commit', timeout: 15000 });
await page.waitForTimeout(Number(process.env.RONIN_PROFILE_MS || 3000));
const paint = await page.evaluate(() => performance.getEntriesByType('paint').map((entry) => ({ name: entry.name, ms: Math.round(entry.startTime) })));
const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.responseEnd));
const state = await page.evaluate(() => ({ ready: document.readyState, frame: !!document.getElementById('bootframe'), pending: document.documentElement.classList.contains('boot-pending'), timeline: window.__roninTimeline }));
console.log(JSON.stringify({ paint, lastRequestMs: Math.round(Math.max(0, ...resources)), requestCount: requests.length, failed, errors, state, wallMs: Math.round(performance.now() - started) }));
await browser.close();
