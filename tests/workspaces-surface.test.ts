/**
 * Workspaces: across Workspaces and inside one (KAN-780; KAN-784). Normal-size stones and no Agent
 * hints on the Workspaces page; one Workspace's Work (its Teams or Epics beside its document) or
 * Config (its record, no document); its Teams and Epics opened from there; its own page,
 * `#/workspace/<name>`, stacking life over document on a narrow screen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootRonin, ROOT } from './helpers/ronin.js';

const { loadPlaywright } = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/ui-host.mjs')).href);

test('the Workspaces page and one Workspace, as a person reads and presses them', async (t) => {
  const pw = await loadPlaywright();
  assert.ok(pw, 'Playwright for the page checks (scripts/lib/ui-host.mjs)');
  const ronin = await bootRonin('workspaces-surface');
  t.after(() => ronin.stop());
  const ok = async (route: string, init: { method?: string; body?: unknown }) => {
    const answer = await ronin.api(route, init);
    assert.equal(answer.status, 200, `${route}: ${JSON.stringify(answer.body)}`);
    return answer.body;
  };
  await ok('/api/workspaces/project_one', { method: 'PUT', body: { title: 'Project One', objective: 'The shop website.', repos: [], folders: [] } });
  await ok('/api/workspaces/ronin_lab', { method: 'PUT', body: { title: 'Ronin Lab', repos: [], folders: [] } });
  await ok('/api/team-rosters', { body: { name: 'shop', title: 'Shop', objective: 'Run the shop.', workspace: 'project_one' } });
  await ok('/api/team-rosters', { body: { name: 'lab', title: 'Lab', objective: 'Think first.', workspace: 'ronin_lab' } });
  for (const name of ['ana', 'ben']) await ok('/api/launch', { body: { name, provider: 'anthropic', prompt: 'Work.' } });
  await ok('/api/sessions/ana/teams', { method: 'PUT', body: { teams: ['shop'] } });
  await ok('/api/sessions/ana/team_lead', { body: { teams: ['shop'] } });
  await ok('/api/sessions/ben/teams', { method: 'PUT', body: { teams: ['lab'] } });
  const ours = (await ok('/api/work-items', { body: { title: 'Ship the shop', kind: 'Epic', objective: 'The shop sells online.', team: 'shop' } })).item.id as string;
  await ok('/api/work-items', { body: { title: 'Pay button', parent: ours, session: 'ana' } });
  const theirs = (await ok('/api/work-items', { body: { title: 'Read papers', kind: 'Epic', team: 'lab' } })).item.id as string;

  const browser = await pw.chromium.launch();
  t.after(() => browser.close());
  const errors: string[] = [];
  const open = async (viewport: { width: number; height: number }) => {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (error: Error) => errors.push(error.message));
    return page;
  };
  const page = await open({ width: 1400, height: 900 });

  // Layer 1: a stone per Workspace at the normal size, the Teams in it; no Agent hints.
  await page.goto(`${ronin.base}/#/workspaces`);
  const stone = '.workspace-record-stones [data-sws-id="project_one"]';
  await page.waitForSelector(stone);
  const box = await page.locator(stone).boundingBox();
  assert.ok(box && box.height >= box.width * 0.9, `a normal-size stone, not a short one: ${JSON.stringify(box)}`);
  assert.equal((await page.textContent(`${stone} .stone-size`))?.trim(), '1', 'how many Teams work in it');
  assert.equal(await page.$('[data-workspace-view="workspaces"] .terminal-hints'), null, 'no Agent vocabulary or Session controls');

  // One Workspace: Work first, its life beside its document; Config holds the record and no document.
  await page.click(stone);
  await page.waitForSelector('.workspace-toggle');
  const pressed = async () => page.$$eval('.workspace-toggle [aria-pressed="true"]', (nodes) => nodes.map((node) => node.textContent?.trim()));
  assert.deepEqual(await pressed(), ['Work']);
  assert.ok(await page.isVisible('.workspace-work .workspace-life'), 'its Teams or Epics');
  assert.ok(await page.isVisible('.workspace-work .workspace-doc-pane'), 'its document, in Work');
  await page.click('.workspace-toggle button:has-text("Config")');
  assert.deepEqual(await pressed(), ['Config']);
  assert.equal(await page.$('.workspace-doc-pane'), null, 'no document in Config');
  assert.match(await page.textContent('.workspace-form') || '', /Folders/);
  assert.ok(await page.isVisible('.workspace-bar-actions .wk-action:has-text("Save")'), 'Save only in Config');
  await page.click('.workspace-toggle button:has-text("Work")');

  // Its Teams: the Teams stones, Shop only; pressed, its bar with Launch.
  const team = '.workspace-teams [data-sws-id="shop"]';
  await page.waitForSelector(team);
  assert.equal(await page.$('.workspace-teams [data-sws-id="lab"]'), null, 'another Workspace\'s Team is not here');
  await page.click(team);
  await page.waitForSelector('.workspace-teams .team-bar [data-launch="true"]');

  // Its Epics: the Epics stones themselves, only this Workspace's, with their progress line; pressed, the Epic.
  await page.click('.workspace-life .ask-opt:has-text("Epics")');
  const epic = `.workspace-life .epic-record-stones [data-sws-id="${ours}"]`;
  await page.waitForSelector(epic);
  assert.equal(await page.$(`.workspace-life [data-sws-id="${theirs}"]`), null, 'another Workspace\'s Epic is not here');
  assert.ok(await page.$(`${epic} .lifecycle-line`), 'the shared progress line');
  assert.doesNotMatch(await page.textContent(epic) || '', /To Do/, 'no raw Epic Status on the stone');
  await page.click(`${epic} .sws-label, ${epic}`);
  await page.waitForSelector('.workspace-life .epic-bar');

  // The document: Edit, Save, written to the one file.
  await page.click('.workspace-doc-pane .wk-action:has-text("Edit")');
  await page.fill('.workspace-doc-text', '# Project One\n\n## Summary\n\nThe shop website.\n');
  await page.click('.workspace-doc-pane .wk-action:has-text("Save")');
  await page.waitForSelector('.workspace-doc-pane .wk-action:has-text("Edit")');
  assert.match((await ok('/api/workspaces/project_one/doc', {})).text, /The shop website\./);

  // Its own page: the same surface; on a narrow screen its document under its life.
  await page.goto(`${ronin.base}/#/workspace/project_one`);
  await page.waitForSelector('.workspace-route .workspace-toggle');
  assert.match(await page.textContent('.workspace-route .workspace-doc') || '', /The shop website\./);
  const narrow = await open({ width: 402, height: 800 });
  await narrow.goto(`${ronin.base}/#/workspace/project_one`);
  await narrow.waitForSelector('.workspace-route .workspace-doc-pane');
  const life = await narrow.locator('.workspace-route .workspace-life').boundingBox();
  const doc = await narrow.locator('.workspace-route .workspace-doc-pane').boundingBox();
  assert.ok(life && doc && doc.y >= life.y + life.height - 1, 'stacked: the document under its life');
  assert.ok((await narrow.evaluate(() => document.documentElement.scrollWidth)) <= 402, 'no sideways scroll');
  assert.deepEqual(errors, []);
});
