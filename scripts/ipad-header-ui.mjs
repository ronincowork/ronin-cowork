#!/usr/bin/env node
/* The wide-touch header, looked at rather than grepped.
 *
 * Source-text tests cannot see a caret sitting on top of another button, a header that
 * has wrapped to two lines, or readings that are no longer at the right-hand end. This
 * opens the real client at both iPad shapes and measures the composition: one row per
 * header, nothing overlapping anything, the readings flush right, everything on a shared
 * vertical centre.
 *
 * It borrows the live instance for its data and serves THIS desk's public tree over the
 * top (the private-desk preview route), so no rig has to be started and nothing on the
 * live box is touched.
 *
 *   node scripts/ipad-header-ui.mjs [url]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/ui-host.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const URL_ = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://100.101.235.17:3006/';
// The workbench, not the front door: the readings and the caret only exist there.
const AT = `${URL_.replace(/#.*$/, '').replace(/\/$/, '')}/#/cowork`;

const pw = await loadPlaywright();
if (!pw) {
  console.error('ipad-header-ui: could not find playwright — see docs/host-tools.md. The header has NOT been looked at.');
  process.exit(2);
}

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' };
const desk = (rel) => {
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  let body = fs.readFileSync(file);
  if (/\.(html|css|js)$/.test(file)) body = Buffer.from(String(body).replaceAll('__RONIN_ASSET_VERSION__', 'desk'));
  return { body, contentType: TYPES[path.extname(file)] ?? 'application/octet-stream' };
};

// Every bar control that a finger can hit, plus the island and the readings group.
const BAR = ['#brandbtn', '#coworksbtn', '#servicesstate', '#viewisland', '#viewplace',
  '.app-header-collapse', '#viewmap', '#ramrpm', '#viewactions', '#feedbackaction'];

const measure = (page) => page.evaluate((sel) => {
  const seen = (el) => el && el.getClientRects().length > 0;
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  // A header is on two lines when its children occupy two separate vertical bands —
  // not merely when the band is taller than what it holds.
  const rowsOf = (parent) => {
    const kids = [...parent.children].filter(seen).map(box).filter((r) => r.h > 0);
    if (kids.length < 2) return kids.length;
    const bands = [];
    for (const r of kids.sort((a, b) => a.y - b.y)) {
      const band = bands.find((x) => Math.min(x.bottom, r.bottom) - Math.max(x.y, r.y) > Math.min(x.h, r.h) * 0.5);
      if (band) { band.y = Math.min(band.y, r.y); band.bottom = Math.max(band.bottom, r.bottom); band.h = band.bottom - band.y; }
      else bands.push({ y: r.y, bottom: r.bottom, h: r.h });
    }
    return bands.length;
  };
  const out = { coarse: matchMedia('(pointer: coarse)').matches, wide: matchMedia('(min-width: 681px)').matches, items: {}, overlaps: [], rows: {} };
  const live = [];
  for (const s of sel) {
    const el = document.querySelector(s);
    if (!seen(el)) { out.items[s] = null; continue; }
    out.items[s] = box(el);
    live.push([s, el, box(el)]);
  }
  // A control hidden behind another control. Ignore an ancestor containing its own child.
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const [sa, ea, a] = live[i]; const [sb, eb, b] = live[j];
      if (ea.contains(eb) || eb.contains(ea)) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.x, b.x);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      if (ox > 1 && oy > 1) out.overlaps.push({ a: sa, b: sb, x: Math.round(ox), y: Math.round(oy) });
    }
  }
  const bar = document.getElementById('bar');
  if (bar && seen(bar)) {
    const b = box(bar);
    const cs = getComputedStyle(bar);
    // One row or two: compare the bar's height against its tallest child plus padding.
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const tallest = [...bar.children].filter(seen).reduce((m, el) => Math.max(m, box(el).h), 0);
    out.rows.bar = { box: b, tallest: Math.round(tallest), pad: Math.round(pad), wrapped: rowsOf(bar) > 1, rows: rowsOf(bar), overflow: bar.scrollWidth > bar.clientWidth + 1, flexWrap: cs.flexWrap };
    // Right-hand end: how much clear space is left between the last reading and the edge.
    const trailing = ['#feedbackaction', '#viewactions', '#ramrpm', '#viewmap'].map((s) => out.items[s]).filter(Boolean);
    const last = trailing.length ? Math.max(...trailing.map((t) => t.right)) : null;
    out.rows.gapRight = last === null ? null : Math.round(b.right - parseFloat(cs.paddingRight) - last);
    // Vertical: do the bar's own controls share a centre?
    // The island is cut into the top edge on purpose, so it is not on the row's centre line.
    const centres = [...bar.children].filter(seen).filter((el) => el.id !== 'viewisland').map((el) => { const r = box(el); return r.y + r.h / 2; });
    out.rows.centreSpread = centres.length ? Math.round(Math.max(...centres) - Math.min(...centres)) : 0;
  }
  // The visible work-surface header the docked caret sits over, and what it holds.
  const head = [...document.querySelectorAll('.wk-surface-header')].find(seen);
  if (head) {
    out.rows.surfaceHeader = box(head);
    out.rows.surfaceHeaderChildren = [...head.children].filter(seen).map((el) => ({ cls: el.className, ...box(el) }));
    const cs = getComputedStyle(head);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    out.rows.surfaceRows = rowsOf(head);
    out.rows.surfaceWrapped = rowsOf(head) > 1;
  }
  return out;
}, BAR);

const shapes = [
  { name: 'iPad portrait', width: 820, height: 1180 },
  { name: 'iPad landscape', width: 1180, height: 820 },
];

// Ronin answers on a tailscale address, which Chromium treats as a private network: an
// insecure page may not fetch from it, and every /api call would fail before the header
// finished drawing. These flags are about reaching the box, not about the page's own rules.
const browser = await pw.chromium.launch({
  args: ['--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults', '--disable-web-security'],
}).catch((e) => {
  console.error(`ipad-header-ui: browser will not launch: ${String(e.message).split('\n')[0]}`);
  process.exit(2);
});

let bad = 0;
const report = (label, m) => {
  const say = (ok, text) => { if (!ok) bad += 1; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${text}`); };
  console.log(`\n${label}  (pointer:coarse=${m.coarse}, min-width:681=${m.wide})`);
  say(m.coarse && m.wide, 'the wide-touch rules are the ones in force');
  if (m.rows.bar) {
    say(!m.rows.bar.wrapped, `the application header is one row (rows=${m.rows.bar.rows}, h=${Math.round(m.rows.bar.box.h)})`);
    say(!m.rows.bar.overflow, 'the application header does not overflow its width');
    say(m.rows.centreSpread <= 2, `the bar's controls share a vertical centre (spread=${m.rows.centreSpread}px)`);
    if (m.rows.gapRight !== null) say(m.rows.gapRight >= 0 && m.rows.gapRight <= 8, `the readings sit at the right-hand end (clear space=${m.rows.gapRight}px)`);
  }
  if (m.rows.surfaceHeader) say(!m.rows.surfaceWrapped, `the work-surface header is one row (rows=${m.rows.surfaceRows}, h=${Math.round(m.rows.surfaceHeader.h)})`);
  say(m.overlaps.length === 0, `nothing sits on top of anything else${m.overlaps.length ? `: ${m.overlaps.map((o) => `${o.a} over ${o.b} (${o.x}x${o.y}px)`).join(', ')}` : ''}`);
  for (const [k, v] of Object.entries(m.items)) {
    if (v) console.log(`       ${k.padEnd(22)} x=${Math.round(v.x)} y=${Math.round(v.y)} w=${Math.round(v.w)} h=${Math.round(v.h)}`);
  }
};

for (const shape of shapes) {
  const ctx = await browser.newContext({
    viewport: { width: shape.width, height: shape.height },
    hasTouch: true, isMobile: false, deviceScaleFactor: 2, colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().split('\n')[0].slice(0, 120)); });
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    const rel = u.pathname.replace(/^\/[0-9a-f]{8}\/|^\/desk\//, '/').replace(/^\//, '');
    const served = u.pathname === '/' ? desk('index.html') : desk(rel);
    if (served) return route.fulfill({ status: 200, contentType: served.contentType, body: served.body });
    return route.fallback();
  });
  await page.goto(AT, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(1200);

  if (errs.length) { console.log(`\n${shape.name}: the page reported ${errs.length} error(s) — the composition below is not trustworthy:`); for (const e of errs.slice(0, 5)) console.log(`       ${e}`); bad += 1; }
  report(`${shape.name} — header expanded`, await measure(page));

  const caret = page.locator('.app-header-collapse');
  if (await caret.count() && await caret.isVisible()) {
    await caret.click({ timeout: 5000 });
    await page.waitForTimeout(400);
    const m = await measure(page);
    console.log(`\n${shape.name} — header COLLAPSED`);
    const barGone = !m.items['#brandbtn'];
    console.log(`  ${barGone ? 'ok  ' : 'FAIL'} the application header is out of the way`);
    if (!barGone) bad += 1;
    const c = m.items['.app-header-collapse'];
    console.log(`  ${c ? 'ok  ' : 'FAIL'} the caret survives the collapse and can bring the header back`);
    if (!c) bad += 1;
    // Every control on screen, not just the nearest header: the docked caret is fixed and
    // free to land on anything. It may sit OVER a header band — that is the point — but it
    // must never take a button's place under the finger.
    const buried = await page.evaluate(() => {
      const seen = (el) => el && el.getClientRects().length > 0;
      const box = (el) => el.getBoundingClientRect();
      const caret = document.querySelector('.app-header-collapse');
      if (!caret) return null;
      const c = box(caret);
      const out = [];
      for (const el of document.querySelectorAll('button, a, input, select, [role="button"], .wk-surface-header-actions > *')) {
        if (el === caret || caret.contains(el) || el.contains(caret) || !seen(el)) continue;
        const b = box(el);
        const ox = Math.min(c.right, b.right) - Math.max(c.left, b.left);
        const oy = Math.min(c.bottom, b.bottom) - Math.max(c.top, b.top);
        if (ox <= 1 || oy <= 1) continue;
        // Does the caret actually steal the hit? Ask the document, not the geometry.
        const mx = Math.max(c.left, b.left) + ox / 2; const my = Math.max(c.top, b.top) + oy / 2;
        const top = document.elementFromPoint(mx, my);
        out.push({ what: (el.id || el.className || el.tagName).toString().slice(0, 40), stolen: top === caret || caret.contains(top), frac: b.width ? +(ox / b.width).toFixed(2) : 1 });
      }
      const mid = document.elementFromPoint((c.left + c.right) / 2, (c.top + c.bottom) / 2);
      return { out, reachable: mid === caret || caret.contains(mid) };
    });
    if (buried) {
      const stolen = buried.out.filter((x) => x.stolen);
      console.log(`  ${stolen.length === 0 ? 'ok  ' : 'FAIL'} the caret takes no control's place under the finger${stolen.length ? `: ${stolen.map((x) => `${x.what} (${Math.round(x.frac * 100)}% covered)`).join(', ')}` : ` (${buried.out.length} control(s) merely overlapped, none stolen)`}`);
      if (stolen.length) bad += 1;
      console.log(`  ${buried.reachable ? 'ok  ' : 'FAIL'} the caret itself is what the finger reaches`);
      if (!buried.reachable) bad += 1;
    }
    if (c) console.log(`       caret x=${Math.round(c.x)} y=${Math.round(c.y)} w=${Math.round(c.w)} h=${Math.round(c.h)}`);
    await caret.click({ timeout: 5000 });
    await page.waitForTimeout(400);
    const back = await measure(page);
    const restored = !!back.items['#brandbtn'] && !!back.items['#viewisland'];
    console.log(`  ${restored ? 'ok  ' : 'FAIL'} the caret brings the whole header back, island included`);
    if (!restored) bad += 1;
  } else {
    console.log('  FAIL the collapse caret is not on screen');
    bad += 1;
  }
  await ctx.close();
}

await browser.close();
console.log(bad ? `\nipad-header-ui: ${bad} problem(s) in the composition.` : '\nipad-header-ui: the header composes cleanly at both iPad shapes.');
process.exit(bad ? 1 : 0);
