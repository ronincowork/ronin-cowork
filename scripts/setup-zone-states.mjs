#!/usr/bin/env node
/**
 * THE SETUP HEADER ZONE, IN EVERY STATE IT HAS.
 *
 * An explicit diagnostic, not part of any gate. One machine only ever shows you its own
 * state — Tailnet installed, a provider signed in, registration declined — so the states
 * nobody's machine happens to be in are the ones that rot. This drives each of them.
 *
 * IT WRITES NOTHING. Every non-GET is answered locally, and the reading each case needs is
 * served from a fixture rather than the machine, so no run can answer a Setup step, submit a
 * registration or touch a password. That is deliberate: an earlier harness navigated by
 * button name, pressed real controls, and registered its owner.
 *
 *   node scripts/setup-zone-states.mjs [url] [--theme=dark|light] [--shots=<dir>]
 *
 * Prints one line per state: the sentence the zone says, then its picks, `*` for a chosen
 * pick and `(off)` for one shown but not selectable. A blank sentence with no picks is a
 * settled step, which is correct — the band goes blank and keeps its space.
 */
import fs from 'node:fs';
import path from 'node:path';
import { defaultUrl, loadPlaywright } from './lib/ui-host.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = '') => (args.find((a) => a.startsWith(`--${name}=`)) || `=${fallback}`).split('=').slice(1).join('=');
const URL_ = args.find((a) => !a.startsWith('--')) || defaultUrl();
const THEME = flag('theme', 'dark');
const SHOTS = flag('shots');
const CLIENT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public');

const playwright = await loadPlaywright();
if (!playwright) throw new Error('Playwright is required for the Setup header zone states');

const STEP_IDS = ['provider', 'register', 'workspace', 'installations', 'password'];
const progress = (answers, facts) => ({
  steps: STEP_IDS.map((id, i) => ({ id, number: i + 1, answered: Boolean(answers[id]), answer: answers[id] || '' })),
  facts: facts || { tailscale: true }, scanning: false, scanned_at: '2026-01-01T00:00:00Z',
});

/** card is the selector's 0-based position: 0 providers, 1 register, 2 folders, 3 installations, 4 password. */
const CASES = [
  { tag: 'provider · none', card: 0, answers: {}, runtime: { activated_count: 0 } },
  { tag: 'provider · settled', card: 0, answers: { provider: 'acted' } },
  { tag: 'register · fresh', card: 1, answers: {}, registration: { status: 'optional' } },
  { tag: 'register · declined', card: 1, answers: { register: 'not_now' }, registration: { status: 'optional' } },
  { tag: 'register · anonymous', card: 1, answers: { register: 'acted' }, registration: { status: 'anonymous', submitted_at: '2026-01-01T00:00:00Z' } },
  { tag: 'register · pending', card: 1, answers: { register: 'acted' }, registration: { status: 'pending', submitted_at: '2026-01-01T00:00:00Z' } },
  { tag: 'register · registered', card: 1, answers: { register: 'acted' }, registration: { status: 'registered', submitted_at: '2026-01-01T00:00:00Z' } },
  { tag: 'workspace · settled', card: 2, answers: { workspace: 'acted' } },
  { tag: 'installations · settled', card: 3, answers: { installations: 'acted' } },
  { tag: 'password · tailnet, unanswered', card: 4, answers: {}, password: { required: false, basic: false } },
  { tag: 'password · tailnet, chosen', card: 4, answers: { password: 'not_now' }, password: { required: false, basic: false } },
  { tag: 'password · set', card: 4, answers: {}, password: { required: true, basic: false } },
  { tag: 'password · no tailnet', card: 4, answers: {}, password: { required: false, basic: false }, facts: { tailscale: false } },
  { tag: 'password · no tailnet, chosen', card: 4, answers: { password: 'not_now' }, password: { required: false, basic: false }, facts: { tailscale: false } },
  { tag: 'password · set, no tailnet', card: 4, answers: {}, password: { required: true, basic: false }, facts: { tailscale: false } },
  { tag: 'password · before the scan', card: 4, answers: {}, password: { required: false, basic: false }, facts: {} },
];

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const ORIGIN = new URL(URL_).origin;
const browser = await playwright.chromium.launch({ args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests'] });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let failures = 0;

for (const item of CASES) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: THEME, deviceScaleFactor: 1 });
  await ctx.addInitScript((t) => localStorage.setItem('tmuxgrid.theme', t), THEME);
  const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await ctx.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.continue();
    // Nothing this harness does may reach the machine as a write.
    if (route.request().method() !== 'GET') return json(route, {});
    const p = url.pathname;
    if (p === '/api/setup/progress') return json(route, progress(item.answers, item.facts));
    if (p === '/api/setup/registration' && item.registration) return json(route, { registered: false, identity_mode: 'email', communication: {}, ...item.registration });
    if (p === '/api/password' && item.password) return json(route, item.password);
    const rel = (p.match(/^\/[0-9a-f]{6,}\/(.+)$/) || [, p.replace(/^\//, '')])[1];
    const file = path.join(CLIENT, rel);
    if (rel && !rel.startsWith('api/') && fs.existsSync(file) && fs.statSync(file).isFile()) {
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    }
    let live; try { live = await route.fetch(); } catch { return route.abort(); }
    if (p === '/api/setup/runtime' && item.runtime) {
      const data = await live.json().catch(() => ({}));
      return json(route, { ...data, ...item.runtime, providers: item.runtime.activated_count === 0 ? [] : data.providers || [] });
    }
    try { return await route.fulfill({ response: live }); } catch { return route.abort(); }
  });

  const page = await ctx.newPage();
  const broke = [];
  page.on('pageerror', (error) => broke.push(String(error).slice(0, 160)));
  try {
    await page.goto(`${ORIGIN}/#/setup`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2800);
    // Navigate ONLY by selector card. A by-name lookup reaches into the surface and presses
    // real controls; that is how a harness once registered its owner.
    await page.locator('[data-workspace-view="setup"] .wk-workbench-selector-cards [data-workbench-offer-type]').nth(item.card).click();
    await page.waitForTimeout(1600);
    const seat = '[data-workspace-view="setup"] [data-workspace="workspace2"] ';
    const read = await page.evaluate((s) => {
      const zone = document.querySelector(s + '.setup-zone');
      if (!zone) return { missing: true };
      return {
        state: zone.querySelector('.setup-zone-state')?.textContent || '',
        picks: [...zone.querySelectorAll('[data-setup-zone-pick]')].map((b) => ({
          label: b.textContent, chosen: b.getAttribute('aria-selected') === 'true', off: b.disabled,
        })),
      };
    }, seat);
    if (read.missing) { console.log(`  FAIL — ${item.tag}: no zone on the surface`); failures += 1; }
    else {
      const picks = read.picks.map((p) => `${p.label}${p.chosen ? '*' : ''}${p.off ? '(off)' : ''}`).join(' | ');
      console.log(`  ${item.tag.padEnd(30)} ${read.state ? `"${read.state}"` : '(blank)'}  ${picks || '—'}`);
    }
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${item.tag.replace(/[^a-z0-9]+/gi, '-')}-${THEME}.png`) });
  } catch (error) {
    console.log(`  FAIL — ${item.tag}: ${String(error.message || error).slice(0, 140)}`);
    failures += 1;
  }
  for (const error of broke) { console.log(`  FAIL — ${item.tag}: page error ${error}`); failures += 1; }
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
}
await browser.close();
console.log(failures ? `\nFAILED — ${failures} problem(s).` : `\nAll ${CASES.length} header zone states rendered.`);
process.exit(failures ? 1 : 0);
