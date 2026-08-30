#!/usr/bin/env node
/**
 * visual-ui — the composition fingerprint: do the critical compositions still SIT
 * where they sat, in the colours they wore?
 *
 *   node scripts/visual-ui.mjs             # diff against tests/baselines/ui-fingerprint.json
 *   node scripts/visual-ui.mjs --update    # re-measure and WRITE the baseline (a reviewed act)
 *
 * Deliberately NOT pixel screenshots. Live terminals, session names and catalog rows
 * make pixels churn, and a masked-pixel suite is a maintenance tax a solo owner stops
 * paying (docs/ui.md). What must not shift unnoticed is the CHROME: where the bar,
 * its verbs, a tile's head and the Commons strip sit, and which token colours they
 * resolve to — in both themes. So the fingerprint is element geometry (rounded to
 * 2px) plus resolved colours for a fixed viewport, which is deterministic on one
 * machine and reviewable as a JSON diff in git.
 *
 * The baseline records the machine (platform-arch) that measured it: font metrics
 * differ across OSes, so on any other machine this gate SKIPS with a note instead of
 * crying wolf — the same honesty rule as smoke-ui's engine label. A real change
 * fails with the exact keys that moved; the remedy for an INTENDED change is
 * `--update` in the same commit, which puts the new shape in front of review.
 *
 * Exit codes match smoke-ui: 0 ok/skip-with-note, 1 a composition shifted, 2 could
 * not look (no browser).
 */
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

/** Geometry + resolved colour for the selectors that are content-independent. */
async function fingerprint(page, entries) {
  // Fonts first: the kana/mark glyphs ride fallback fonts that can land after
  // networkidle, and a late glyph is a width drift is a scrollbar is a 2px lie.
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

// THE ROOT ARRIVAL IS THE CAMPAIGN HOME (2026-08-29): three doors in a frame over a
// tray. The sessions home it replaced (.home-tabs, .home-maxrow, a tile head) is gone
// from this route by design, so its selectors are gone from here. On the home every bar
// control but the brand is hidden (campaign-home.css) — #shapecycle and #sysbtn are
// pinned at their hidden box precisely so their reappearance would show.
const DESKTOP = [
  '#bar', '#brandbtn', '#shapecycle', '#sysbtn',
  '.ch-frame', '.ch-doors', '.ch-door', '.ch-tray',
];
// NOT the session picker: its flex width follows the live session names — content,
// not chrome, and a baseline on content is a baseline that cries wolf.
// メ went with the Sessions grid (73ebd6e); ニ remains, hidden on the home like the rest.
const PHONE = ['#bar', '#bar .tdrop-btn.ni'];
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
  // Both themes, same chrome: the token flip is part of the composition contract.
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  // Themeable borders transition through intermediate colours. Measure the settled
  // light composition, never whichever interpolation frame the browser happened to paint.
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
  // login.html is static, so this works before AND after the auth routes exist.
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
