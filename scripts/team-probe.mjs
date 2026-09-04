#!/usr/bin/env node
import { defaultUrl, loadPlaywright } from './lib/ui-host.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const team = process.env.RONIN_PROBE_TEAM || process.argv[2];
if (!team) throw new Error('Usage: node scripts/team-probe.mjs TEAM (or set RONIN_PROBE_TEAM)');
const playwright = await loadPlaywright();
if (!playwright) throw new Error('Playwright is not installed (set RONIN_PLAYWRIGHT_PATH or install host tools).');
const profile = mkdtempSync(path.join(tmpdir(), 'ronin-team-probe-'));
const context = await playwright.chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1600, height: 900 } });
try {
  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console ${message.text().slice(0, 120)}`); });
  const snapshot = () => page.evaluate(() => ({
    tiles: document.querySelectorAll('.tile-head').length,
    cards: document.querySelectorAll('.wk-selector button, .wk-card, [data-workbench-card]').length,
    loading: document.querySelectorAll('[data-state="loading"]').length,
  }));
  const ready = async () => {
    const start = Date.now();
    for (;;) {
      const state = await snapshot();
      if ((state.tiles > 0 && state.loading === 0) || Date.now() - start > 15_000) return { ms: Date.now() - start, ...state };
      await page.waitForTimeout(100);
    }
  };
  const report = async (label) => {
    const result = await ready();
    const slowest = await page.evaluate(() => performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/api/')).map((entry) => ({ name: entry.name.replace(/^.*\/api\//, '/api/'), ms: Math.round(entry.responseEnd - entry.startTime) })).sort((a, b) => b.ms - a.ms).slice(0, 3));
    console.log(label.padEnd(16), `ready ${String(result.ms).padStart(5)}ms tiles ${result.tiles} loading ${result.loading}`, JSON.stringify(slowest));
  };
  const base = process.env.RONIN_URL || defaultUrl();
  await page.goto(`${base}#/team/${encodeURIComponent(team)}`); await report('team first');
  for (let i = 1; i <= 3; i++) { await page.reload(); await report(`team reload ${i}`); }
  console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}
