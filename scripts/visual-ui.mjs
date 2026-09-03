#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultUrl, loadPlaywright } from './lib/ui-host.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'tests', 'baselines', 'ui-fingerprint.json');
const UPDATE = process.argv.includes('--update');
const URL_ = process.argv.slice(2).find((a) => !a.startsWith('--')) || defaultUrl(false);
const PLATFORM = `${os.platform()}-${os.arch()}`;

const pw = await loadPlaywright();
if (!pw) {
  console.error('visual-ui: could not find playwright — see docs/host-tools.md. The compositions have NOT been looked at.');
  process.exit(2);
}

async function fingerprint(page, entries) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate((list) => {
    const out = {};
    for (const sel of list) {
      const el = document.querySelector(sel);
      if (!el) {
        out[sel] = 'MISSING';
        continue;
      }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const px = (n) => Math.round(n / 2) * 2; // 2px grid: stable, still catches real shifts
      out[sel] = {
        box: [px(r.x), px(r.y), px(r.width), px(r.height)],
        bg: cs.backgroundColor,
        color: cs.color,
        border: cs.borderTopColor,
      };
    }
    return out;
  }, entries);
}

const DESKTOP = [
  '#bar', '#brandbtn', '#shapecycle',
  '.ch-frame', '.ch-doors', '.ch-door', '.ch-release',
];
const PHONE = ['#phone .ph-bar', '#phone .ph-title', '#phone .ph-main'];
const LOGIN = ['form', '#pw', '#go', 'h1'];

const browser = await pw.chromium.launch().catch((e) => {
  console.error(`visual-ui: browser will not launch: ${String(e.message).split('\n')[0]}`);
  process.exit(2);
});

const shot = { platform: PLATFORM, viewport: '1400x900 / 402x681', surfaces: {} };

{
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, colorScheme: 'dark' })).newPage();
  await page.goto(URL_, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('boot-pending'));
  await page.waitForTimeout(1500);
  shot.surfaces.desktop = await fingerprint(page, DESKTOP);
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  await page.waitForTimeout(300);
  shot.surfaces['desktop-light'] = await fingerprint(page, ['#bar', '.ch-frame', '.ch-door']);
  await page.close();
}
{
  const page = await (await browser.newContext({
    viewport: { width: 402, height: 681 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark', // the shell follows the device now; the baseline is the dark shell
  })).newPage();
  await page.goto(URL_, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('boot-pending'));
  await page.waitForTimeout(1500);
  shot.surfaces.phone = await fingerprint(page, PHONE);
  await page.close();
}
{
  const page = await (await browser.newContext({ viewport: { width: 800, height: 700 }, colorScheme: 'dark' })).newPage();
  await page.goto(URL_.replace(/\/$/, '') + '/login.html', { waitUntil: 'networkidle', timeout: 30_000 });
  shot.surfaces.login = await fingerprint(page, LOGIN);
  await page.close();
}
await browser.close();

if (UPDATE) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(shot, null, 2) + '\n');
  console.log(`visual-ui: baseline WRITTEN (${PLATFORM}) — review the JSON diff like any other change.`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.log('visual-ui: no baseline yet — run `node scripts/visual-ui.mjs --update` once and commit it.');
  process.exit(0);
}
const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
if (base.platform !== PLATFORM) {
  console.log(`visual-ui: SKIP — baseline is ${base.platform}, this machine is ${PLATFORM} (font metrics differ; the recording box is the gate).`);
  process.exit(0);
}

const diffs = [];
for (const [surface, entries] of Object.entries(base.surfaces)) {
  for (const [sel, want] of Object.entries(entries)) {
    const got = shot.surfaces[surface]?.[sel];
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      diffs.push(`${surface} ${sel}\n      was ${JSON.stringify(want)}\n      now ${JSON.stringify(got)}`);
    }
  }
}
console.log(`visual-ui: ${Object.keys(base.surfaces).length} surface(s) against ${path.relative(ROOT, BASELINE)}`);
if (diffs.length) {
  for (const d of diffs) console.log('  ✗ ' + d);
  console.log(`\nFAILED — ${diffs.length} composition(s) shifted. Intended? Re-run with --update and commit the diff.`);
  process.exit(1);
}
console.log('  ok — every fingerprinted composition sits where the baseline has it, both themes');
