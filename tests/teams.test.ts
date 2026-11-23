/**
 * Teams: each Team shown by what it is (w900, KAN-780). The Teams page's stones (the Epic stones'
 * grammar: name, lead, ⚑ and open count, the shared lifecycle line; no Show question), its selector (a card per Team, no Agent's own card), one Team's
 * bar, a bar per Agent and its Epics and Configuration as lines that expand (its Epics without New Epic) and No Team, which is
 * there only while an Agent is outside every Team and opens its Agents.
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
  for (const [name, lead] of [['ana', true], ['ben', false]] as const) {
    const launched = await ronin.api('/api/launch', { body: { name, provider: 'anthropic', prompt: 'Work the shop.', team: 'shop', team_lead: lead } });
    assert.equal(launched.status, 200, JSON.stringify(launched.body));
  }
  const make = async (body: Record<string, unknown>) => {
    const made = await ronin.api('/api/work-items', { body });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    return made.body.item.id as string;
  };
  const epic = await make({ title: 'Ship the shop', kind: 'Epic', team: 'shop' });
  await make({ title: 'Price list', status: 'In Review', parent: epic, session: 'ben' });
  await make({ title: 'Shop sign', status: 'Done', parent: epic, session: 'ben' });

  // The Team API carries each item's status, level, flag and holder: the stone's lifecycle line and
  // its needs-you line read them.
  const rosters = (await ronin.api('/api/team-rosters')).body;
  const shop = (Array.isArray(rosters) ? rosters : rosters.rosters).find((row: { name: string }) => row.name === 'shop');
  const sign = shop.items.find((one: { title: string }) => one.title === 'Shop sign');
  assert.deepEqual(sign, { title: 'Shop sign', status: 'Done', level: 0, flagged: false, holder: 'agent:ben' });
  assert.equal(shop.items.find((one: { title: string }) => one.title === 'Ship the shop').level, 1);

  const browser = await pw.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(15_000);
  const errors: string[] = [];
  page.on('pageerror', (error: Error) => errors.push(error.message));

  await page.goto(`${ronin.base}/#/cowork`);
  const stone = '.team-roster-phalanx [data-sws-id="shop"]';
  await page.waitForSelector(`${stone} .sws-state`);
  assert.equal(await page.textContent(`${stone} .sws-label`), 'Shop');
  // The Epic stones' grammar: name, the lead, no amber line; ⚑ only while something open is
  // flagged (nothing is), and the open count small and grey (Price list: 1).
  assert.equal(await page.$(`${stone} .sws-secondary`), null, 'no amber line');
  assert.equal(await page.isVisible(`${stone} .stone-flag`), false, 'nothing flagged');
  assert.equal(await page.textContent(`${stone} .stone-size`), '1', 'one open item');
  assert.match(await page.textContent(`${stone} .sws-state`) || '', /^人 Ana$/, 'the lead');
  assert.equal(await page.$(`${stone} .teams-launch`), null, 'Launch is the opened Team\'s, not the stone\'s');
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

  // One Team: its bar, a bar per Agent, then Agents, Epics and Configuration as lines that expand (Agents open).
  await page.click(stone);
  const agentsView = '.league-team-detail .league-team-view-agents';
  await page.waitForSelector(`${agentsView} .team-agent-stone`);
  // Its bar, an Epic's: the name, Launch, the concept in full, the shared lifecycle line.
  assert.equal(await page.textContent('.league-team-detail .team-bar-title'), 'Shop');
  assert.equal(await page.textContent('.league-team-detail .team-bar-objective'), 'Run the shop.');
  assert.equal(await page.getAttribute('.league-team-detail .team-bar .lifecycle-line', 'data-band'), '4');
  assert.equal(await page.$('.league-team-detail .team-bar-coverage'), null, 'no facts line');
  assert.equal(await page.$('.league-team-detail .league-team-add'), null, 'no New Agent here');
  // The Agents as the Epic stones: lead first; Ben's line over what he holds and his open count.
  const agentStone = (who: string) => `${agentsView} [data-sws-id="${who}"]`;
  assert.deepEqual(await page.$$eval(`${agentsView} .team-agent-stone`, (rows) => rows.map((row) => (row as HTMLElement).dataset.swsId)), ['ana', 'ben'], 'lead first');
  const line = `${agentStone('ben')} .lifecycle.lifecycle-line`;
  await page.waitForSelector(`${line}[data-empty="false"]`, { state: 'attached' });
  assert.equal(await page.getAttribute(line, 'data-band'), '4');
  assert.equal(await page.textContent(`${agentStone('ben')} .stone-size`), '1', 'Ben holds one open item');
  assert.equal(await page.textContent(`${agentStone('ana')} .stone-size`), '0');
  // Pressed, an Agent opens beside its rail: its Work items and its Configuration.
  await page.click(agentStone('ben'));
  await page.waitForSelector(`${agentsView} .team-agent-open .team-fold-agent-config`);
  await page.keyboard.press('Escape');
  // No view switch: Epics and Configuration are lines, closed until pressed.
  assert.equal(await page.$('.league-team-detail .league-team-toggle'), null, 'no view switch');
  assert.equal(await page.isVisible('.league-team-detail .league-team-view-config'), false);
  await page.click('.league-team-detail .team-fold-epics > summary');
  await page.waitForSelector(`.league-team-detail .league-team-view-epics [data-sws-id="${epic}"]`);
  assert.equal(await page.$('.league-team-detail .league-team-view-epics [data-sws-id="!new-epic"]'), null, 'no New Epic inside a Team');
  await page.click('.league-team-detail .team-fold-config > summary');
  assert.ok(await page.isVisible('.league-team-detail .league-team-view-config'));
  await page.click('.league-team-detail .team-fold-config > summary');
  assert.equal(await page.isVisible('.league-team-detail .league-team-view-config'), false, 'pressed again, it collapses');

  // An Agent outside every Team: No Team appears, and opens one Team workbench of its own.
  const solo = await ronin.api('/api/launch', { body: { name: 'solo', provider: 'anthropic', prompt: 'On my own.' } });
  assert.equal(solo.status, 200, JSON.stringify(solo.body));
  await page.waitForSelector('.team-roster-phalanx [data-sws-id=" unassigned"]');
  assert.equal(await page.textContent('.team-roster-phalanx [data-sws-id=" unassigned"] .sws-label'), 'No Team');
  await page.click('.team-roster-phalanx [data-sws-id=" unassigned"]');
  await page.waitForSelector('.league-team-detail .league-team-view-agents [data-sws-id="solo"]');
  assert.equal(await page.textContent('.league-team-detail .team-bar-title'), 'No Team');
  assert.equal(await page.$('.league-team-detail .team-fold'), null, 'No Team has its Agents only');
  assert.deepEqual(errors, []);
});
