#!/usr/bin/env node
import { defaultUrl, loadPlaywright } from './lib/ui-host.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const playwright = await loadPlaywright();
if (!playwright) throw new Error('Playwright is not installed (set RONIN_PLAYWRIGHT_PATH or install host tools).');
const profile = mkdtempSync(path.join(tmpdir(), 'ronin-refresh-probe-'));
const context = await playwright.chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1600, height: 900 } });
try {
  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console ${message.text().slice(0, 120)}`); });
  await page.addInitScript(() => {
    window.__long = [];
    try { new PerformanceObserver((list) => window.__long.push(...list.getEntries().map((entry) => Math.round(entry.duration)))).observe({ entryTypes: ['longtask'] }); } catch {}
  });
  const ready = async () => {
    const start = Date.now();
    for (;;) {
      const surfaces = await page.evaluate(() => [...document.querySelectorAll('[data-workbench-surface]')].map((element) => `${element.dataset.workbenchSurface}:${element.dataset.state || 'ok'}`));
      if ((surfaces.length && !surfaces.some((value) => value.endsWith(':loading'))) || Date.now() - start > 15_000) return { ms: Date.now() - start, surfaces };
      await page.waitForTimeout(100);
    }
  };
  const report = async (label) => {
    const result = await ready();
    const long = await page.evaluate(() => window.__long);
    console.log(label.padEnd(20), `ready ${String(result.ms).padStart(5)}ms`, `longtasks ${long.length} (max ${Math.max(0, ...long)}ms)`, result.surfaces.join(' '));
  };
  const base = process.env.RONIN_URL || defaultUrl();
  const team = process.env.RONIN_PROBE_TEAM || process.argv[2];
  await page.goto(`${base}#/campaign`); await report('campaign first load');
  for (let i = 1; i <= 3; i++) { await page.reload(); await report(`campaign reload ${i}`); }
  if (team) {
    await page.goto(`${base}#/team/${encodeURIComponent(team)}`); await report('team first load');
    for (let i = 1; i <= 3; i++) { await page.reload(); await report(`team reload ${i}`); }
  }
  console.log('errors:', errors.length ? errors.slice(0, 6) : 'none');
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}
