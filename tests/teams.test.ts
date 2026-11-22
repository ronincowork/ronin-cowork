/**
 * Teams: each Team shown by what it is (w900, KAN-780). The Teams page's stones (concept, lead,
 * progress line, no Show question), its selector (a card per Team, no Agent's own card), one Team's
 * three views (Agents, Epics, Configuration; its Epics without New Epic) and No Team, which is
 * there only while an Agent is outside every Team and opens one Team workbench of its own.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootRonin, ROOT } from './helpers/ronin.js';

const { loadPlaywright } = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/ui-host.mjs')).href);

test('the Teams page and one Team, as a person reads and presses them', async (t) => {
  const pw = await loadPlaywright();
  assert.ok(pw, 'Playwright for the page checks (scripts/lib/ui-host.mjs)');
  const ronin = await bootRonin('teams');
  t.after(() => ronin.stop());
  assert.equal((await ronin.api('/api/team-rosters', { body: { name: 'shop', title: 'Shop', objective: 'Run the shop.' } })).status, 200);
  for (const name of ['ana', 'ben']) {
    const launched = await ronin.api('/api/launch', { body: { name, provider: 'anthropic', prompt: 'Work the shop.', tags: ['shop'] } });
    assert.equal(launched.status, 200, JSON.stringify(launched.body));
  }
  assert.equal((await ronin.api('/api/sessions/ana/team_lead', { body: { teams: ['shop'] } })).status, 200);
  const make = async (body: Record<string, unknown>) => {
    const made = await ronin.api('/api/work-items', { body });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    return made.body.item.id as string;
  };
  const epic = await make({ title: 'Ship the shop', kind: 'Epic', team: 'shop' });
  await make({ title: 'Price list', status: 'In Review', parent: epic, session: 'ben' });
  await make({ title: 'Shop sign', status: 'Done', parent: epic, session: 'ben' });

  // The Team API carries each item's status and level: the stone's progress line reads them.
  const rosters = (await ronin.api('/api/team-rosters')).body;
  const shop = (Array.isArray(rosters) ? rosters : rosters.rosters).find((row: { name: string }) => row.name === 'shop');
  const sign = shop.items.find((one: { title: string }) => one.title === 'Shop sign');
  assert.deepEqual(sign, { title: 'Shop sign', status: 'Done', level: 0 });
  assert.equal(shop.items.find((one: { title: string }) => one.title === 'Ship the shop').level, 1);

  const browser = await pw.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (error: Error) => errors.push(error.message));

  await page.goto(`${ronin.base}/#/cowork`);
  const stone = '.team-roster-phalanx [data-sws-id="shop"]';
  await page.waitForSelector(`${stone} .sws-state`);
  assert.equal(await page.textContent(`${stone} .sws-label`), 'Shop');
  assert.equal(await page.textContent(`${stone} .sws-secondary`), 'Run the shop.', 'the concept');
  assert.match(await page.textContent(`${stone} .sws-state`) || '', /^人 Ana$/, 'the lead');
  // The stone's line is the shared item lifecycle over the Team's items: the Epic itself is not
  // counted, so Price list (In Review) and Shop sign (Done) are half each, band 4 (score 3.5).
  const line = `${stone} .lifecycle.lifecycle-line.team-progress-line`;
  await page.waitForSelector(`${line}[data-empty="false"]`, { state: 'attached' });
  assert.equal(await page.getAttribute(line, 'data-band'), '4');
  assert.deepEqual(await page.$$eval(`${line} > i`, (parts) => parts.map((part) => [(part as HTMLElement).dataset.status, (part as HTMLElement).style.flexGrow])),
    [['todo', '0'], ['progress', '0'], ['review', '0.5'], ['done', '0.5']]);
  await page.click(line);
  assert.match(await page.textContent('.lifecycle-reading') || '', /In Review 1.*Done 1/s);
  await page.keyboard.press('Escape');
  assert.equal(await page.$('.lifecycle-reading'), null);
  assert.doesNotMatch(await page.textContent('.team-roster-surface .sws-header') || '', /Show/, 'no Show question');
  assert.match(await page.textContent('.team-roster-surface .sws-header') || '', /Workspace/);
  assert.equal(await page.$('.team-roster-phalanx [data-sws-id=" unassigned"]'), null, 'every Agent is on a Team: no No Team');

  // The selector: a card per Team, no Agent's own card.
  assert.ok(await page.$('[data-workbench-offer-type="team.profile"][data-workbench-offer-resource="shop"]'), 'a card for Shop');
  assert.equal(await page.$('[data-workbench-offer-type="session.terminal"]'), null, 'no Agent card on the Teams selector');

  // One Team: Agents, then Epics, then Configuration, one toggle.
  await page.click(stone);
  const toggle = '.league-team-detail .league-team-toggle';
  await page.waitForSelector(toggle);
  assert.equal(await page.getAttribute(toggle, 'data-view'), 'agents');
  assert.deepEqual(await page.$$eval('.league-team-detail .league-team-view-agents .league-team-agent', (rows) => rows.map((row) => (row as HTMLElement).dataset.session)), ['ana', 'ben'], 'lead first');
  // Ben's bar is the same shared drawing over the items he holds; Ana holds nothing and has none.
  const bar = '.league-team-detail .league-team-agent[data-session="ben"] .lifecycle.lifecycle-bar';
  await page.waitForSelector(`${bar}[data-empty="false"]`, { state: 'attached' });
  assert.equal(await page.getAttribute(bar, 'data-band'), '4');
  assert.equal(await page.$('.league-team-detail .league-team-agent[data-session="ana"] .lifecycle'), null);
  assert.equal(await page.$('.league-team-detail button.league-team-agent'), null, 'an Agent row is a reading, not a launch');
  await page.click(toggle);
  assert.equal(await page.getAttribute(toggle, 'data-view'), 'epics');
  await page.waitForSelector(`.league-team-detail .league-team-view-epics [data-sws-id="${epic}"]`);
  assert.equal(await page.$('.league-team-detail .league-team-view-epics [data-sws-id="!new-epic"]'), null, 'no New Epic inside a Team');
  await page.click(toggle);
  assert.equal(await page.getAttribute(toggle, 'data-view'), 'config');
  assert.ok(await page.isVisible('.league-team-detail .league-team-view-config'));
  await page.click(toggle);
  assert.equal(await page.getAttribute(toggle, 'data-view'), 'agents', 'past Configuration, back to Agents');

  // An Agent outside every Team: No Team appears, and opens one Team workbench of its own.
  const solo = await ronin.api('/api/launch', { body: { name: 'solo', provider: 'anthropic', prompt: 'On my own.' } });
  assert.equal(solo.status, 200, JSON.stringify(solo.body));
  await page.waitForSelector('.team-roster-phalanx [data-sws-id=" unassigned"]');
  assert.equal(await page.textContent('.team-roster-phalanx [data-sws-id=" unassigned"] .sws-label'), 'No Team');
  await page.goto(`${ronin.base}/#/team/%20unassigned`);
  await page.waitForFunction(() => document.body.innerText.includes('Solo'));
  assert.match(await page.textContent('body') || '', /No Team/);
  assert.deepEqual(errors, []);
});
