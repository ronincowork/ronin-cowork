#!/usr/bin/env node
/** Browser acceptance for the first-install handoff. Writes are intercepted: this proves
 * the real cowork_setup renderer sends every answer, clears setup, launches Atarashi, and
 * deploys the returned session name into the workspace tile directive without changing
 * the machine running the gate. */
import { defaultUrl, loadPlaywright } from './lib/ui-host.mjs';

const base = process.argv[2] || defaultUrl(false);
const pw = await loadPlaywright();
if (!pw) {
  console.error('cowork-setup-journey: Playwright is required — see docs/host-tools.md');
  process.exit(2);
}

const browser = await pw.chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 }, colorScheme: 'dark' })).newPage();
const writes = [];
let completed = false;

await page.route('**/api/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() === 'GET') {
    if (url.pathname === '/api/settei/setup' && completed) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ pending: false, completed_at: new Date().toISOString() }) });
    }
    if (url.pathname === '/api/sessions' && completed) {
      const response = await route.fetch();
      const sessions = await response.json();
      sessions.push({ name: 'setup-dogfood', windows: 1, attached: false, created: 1, hasNote: false, tags: [], session_job: 'Atarashi' });
      return route.fulfill({ response, json: sessions });
    }
    return route.continue();
  }

  let body = null;
  try { body = req.postDataJSON(); } catch { /* a body is not required */ }
  writes.push({ method: req.method(), path: url.pathname, body });
  if (url.pathname === '/api/settei/setup') completed = true;
  if (url.pathname === '/api/launch') {
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ name: 'setup-dogfood' }) });
  }
  if (url.pathname === '/api/install') {
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
  }
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
});

const fail = (message) => { throw new Error(message); };
try {
  await page.goto(base.replace(/\/$/, '') + '/?setup', { waitUntil: 'networkidle' });
  await page.getByText('Make this coworkspace yours.').waitFor();

  await page.locator('.fr-sec').filter({ hasText: 'Name your coworkspace' }).locator('input[type=text]').fill('Dogfood box');
  await page.locator('.fr-sec').filter({ hasText: 'What should Ronin call you?' }).locator('input[type=text]').fill('Dogfooder');
  const project = page.locator('.fr-sec').filter({ hasText: 'What would you like to work on first?' });
  await project.locator('input').nth(0).fill('dogfood');
  await project.locator('input').nth(1).fill('A clean-server first-install acceptance run');
  await project.locator('input').nth(2).fill(process.cwd());

  const reviewed = await page.locator('.fr-review-list').innerText();
  if (!reviewed.includes('Dogfood box') || !reviewed.includes('A clean-server first-install acceptance run')) {
    fail('the Save review did not reflect the live answers');
  }

  await Promise.all([
    page.waitForURL((u) => !u.searchParams.has('setup'), { timeout: 15_000 }),
    page.getByRole('button', { name: 'Save and open RoninCoWork' }).click(),
  ]);
  await page.waitForSelector('.tile', { timeout: 15_000 });

  const paths = new Set(writes.map((w) => `${w.method} ${w.path}`));
  for (const required of [
    'PUT /api/settei/machine', 'PUT /api/settei/owner', 'PUT /api/settei/agents',
    'PUT /api/session-max', 'POST /api/project-roots', 'PUT /api/settei/gbrain',
    'PUT /api/settei/setup', 'POST /api/launch',
  ]) if (!paths.has(required)) fail(`Save did not issue ${required}`);

  const launch = writes.find((w) => w.path === '/api/launch');
  if (launch?.body?.session_job !== 'Atarashi') fail('Save did not launch the Atarashi seat');
  await page.waitForFunction(() => document.querySelector('select.sess')?.value === 'setup-dogfood', null, { timeout: 10_000 });
  const state = await page.evaluate(() => ({ url: location.href, first: document.querySelector('select.sess')?.value }));
  if (state.first !== 'setup-dogfood') fail(`workspace first tile is ${JSON.stringify(state.first)}, wanted setup-dogfood`);

  console.log('cowork-setup-journey: ok — answers reviewed, saved, setup completed, Atarashi launched, returned tile deployed');
} finally {
  await page.unrouteAll({ behavior: 'wait' });
  await browser.close();
}
