/**
 * Epics: what a person reads across Epics and inside one (KAN-780; w897, w898, w899). The
 * epic-stage rules, the Epics phalanx (its order, what needs the person, when it moved, New
 * Epic) and one Epic's own page (the Team's Epics board without its strip).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootRonin, ROOT } from './helpers/ronin.js';

const rules = await import(pathToFileURL(path.join(ROOT, 'public/js/epic-stage.js')).href);
const { loadPlaywright } = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/ui-host.mjs')).href);

const item = (status: string, extra: Record<string, unknown> = {}) => ({ level: 0, status, holder: 'agent:ana', ...extra });
const stage = (items: unknown[], epic: Record<string, unknown> = { status: 'In Progress', holder: 'team:shop' }) => rules.epicStage(epic, items);

test('epic-stage: the mean of level-0 items, bands without overlap at their exact edges', () => {
  assert.equal(stage([]).stage, 'empty');
  assert.equal(stage([item('To Do'), item('To Do')]).stage, 'starter');
  assert.equal(stage([item('To Do'), item('In Progress')]).stage, 'working', '1.5 is Working');
  assert.equal(stage([item('In Progress'), item('In Review')]).stage, 'maturing', '2.5 is Maturing');
  assert.equal(stage([item('In Review'), item('In Review'), item('In Review'), item('In Review'), item('Done')]).stage, 'maturing', '3.2 is Maturing');
  assert.equal(stage([item('Done'), item('Done'), item('Done'), item('To Do')]).stage, 'aging', '3.25 is Aging');
  assert.equal(stage([item('Done'), item('Done')]).stage, 'aging', 'all Done waits to be marked Done');
  // A Subtask is a step of its Task: it neither counts nor moves the score.
  const withSub = stage([item('Done'), { level: -1, status: 'To Do' }]);
  assert.deepEqual(withSub.counts, { todo: 0, progress: 0, review: 0, done: 1 });
  assert.equal(withSub.stage, 'aging');
  assert.deepEqual(stage([item('To Do'), item('In Progress'), item('In Review'), item('Done'), item('Done')]).counts, { todo: 1, progress: 1, review: 1, done: 2 });
});

test('epic-stage: the Epic\'s own Status counts only when Done; an Icebox has none', () => {
  assert.equal(stage([item('To Do')], { status: 'Done', holder: 'team:shop' }).stage, 'done');
  assert.equal(stage([item('Done')], { status: 'To Do', holder: 'team:shop' }).stage, 'aging', 'a stale To Do Status is ignored');
  assert.equal(stage([item('To Do')], { status: 'To Do', holder: 'workspace:shop' }).stage, 'icebox');
  assert.equal(rules.isOpenEpic({ status: 'Done', holder: 'team:shop' }), false);
  assert.equal(rules.isOpenEpic({ status: 'To Do', holder: 'workspace:shop' }), false);
  assert.equal(rules.isOpenEpic({ status: 'To Do', holder: 'team:shop' }), true);
});

test('the phalanx: needs-you means In Review, flagged or open work no Agent holds; those first, then most progressed', () => {
  assert.deepEqual(rules.epicAttention([item('In Review')]), { review: true, flagged: false, unassigned: false });
  assert.deepEqual(rules.epicAttention([item('To Do', { flagged: true })]), { review: false, flagged: true, unassigned: false });
  assert.deepEqual(rules.epicAttention([item('To Do', { holder: 'team:shop' })]), { review: false, flagged: false, unassigned: true });
  assert.deepEqual(rules.epicAttention([item('Done', { holder: '', flagged: true })]), { review: false, flagged: false, unassigned: false }, 'Done work needs nobody');
  assert.equal(rules.epicMoved({ moved: '2026-11-01T00:00:00Z' }, [{ moved: '2026-11-03T00:00:00Z' }, { moved: '' }]), '2026-11-03T00:00:00Z');
  const row = (id: string, score: number, needs: boolean, moved = '2026-11-01') => ({ id, score, moved, attention: { review: needs, flagged: false, unassigned: false } });
  assert.deepEqual(rules.orderEpics([row('quiet-aging', 3.5, false), row('needs-starter', 1, true), row('needs-working', 2, true), row('quiet-working', 2, false)]).map((r: { id: string }) => r.id),
    ['needs-working', 'needs-starter', 'quiet-aging', 'quiet-working']);
});

test('the Epics page and one Epic\'s page, as a person reads and presses them', async (t) => {
  const pw = await loadPlaywright();
  assert.ok(pw, 'Playwright for the page checks (scripts/lib/ui-host.mjs)');
  const ronin = await bootRonin('epics');
  t.after(() => ronin.stop());
  assert.equal((await ronin.api('/api/team-rosters', { body: { name: 'shop', objective: 'Run the shop.' } })).status, 200);
  const launched = await ronin.api('/api/launch', { body: { name: 'ana', provider: 'anthropic', prompt: 'Work the shop.' } });
  assert.equal(launched.status, 200, JSON.stringify(launched.body));
  const make = async (body: Record<string, unknown>) => {
    const made = await ronin.api('/api/work-items', { body });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    return made.body.item.id as string;
  };
  const under = async (parent: string, statuses: string[], holder: Record<string, unknown> = { session: 'ana' }) => {
    for (const [n, status] of statuses.entries()) await make({ title: `${status} ${n}`, status, parent, ...holder });
  };
  // Aging, nothing for the person: 3.25 exactly, all held by Ana.
  const aging = await make({ title: 'Ship the shop', kind: 'Epic', objective: 'The shop sells online.', team: 'shop' });
  await under(aging, ['Done', 'Done', 'Done', 'In Progress']);
  // Working, an item In Review.
  const review = await make({ title: 'Stock the shelves', kind: 'Epic', objective: 'Every shelf is full.', team: 'shop' });
  await under(review, ['In Review', 'To Do']);
  // Starter, work only a Team holds.
  const toAssign = await make({ title: 'Open the doors', kind: 'Epic', objective: 'The doors open at nine.', team: 'shop' });
  await under(toAssign, ['To Do', 'To Do'], { team: 'shop' });
  const done = await make({ title: 'Paint the sign', kind: 'Epic', team: 'shop' });
  assert.equal((await ronin.api(`/api/work-items/${done}/transition`, { body: { status: 'Done' } })).status, 200);

  const browser = await pw.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (error: Error) => errors.push(error.message));

  await page.goto(`${ronin.base}/#/epics`);
  await page.waitForSelector(`.epic-record-stones [data-sws-id="${aging}"]`);
  const stones = await page.$$eval('.epic-record-stones .sws-grid > [data-sws-id]', (nodes) => nodes.map((node) => ({
    id: (node as HTMLElement).dataset.swsId, needs: node.querySelector('.sws-secondary')?.textContent || '', last: node.querySelector('.sws-state')?.textContent || '',
    line: Boolean(node.querySelector('.lifecycle-line')),
  })));
  assert.deepEqual(stones.map((s) => s.id), [review, toAssign, aging, '!new-epic'], 'needing you first, then most progressed; no Done Epic; New Epic last');
  assert.equal(stones[0].needs, 'Needs review', 'an item In Review');
  assert.equal(stones[1].needs, 'Work to assign');
  assert.equal(stones[2].needs, '', 'nothing needs you: no line');
  for (const one of stones.slice(0, 3)) {
    assert.match(one.last, /moved \S+ ago/);
    assert.ok(one.line, 'a progress line on every Epic stone');
  }
  assert.doesNotMatch(await page.textContent('.epic-record-stones') || '', /Aging|Working|Starter|Maturing/, 'no epic-stage name on a stone');
  // The line's press reads the epic-stage and counts; it does not open the Epic.
  await page.click(`.epic-record-stones [data-sws-id="${aging}"] .lifecycle-line`);
  const reading = await page.textContent('.lifecycle-reading');
  assert.match(reading || '', /Aging/);
  assert.match(reading || '', /In Progress 1/);
  assert.match(reading || '', /Done 3/);
  await page.keyboard.press('Escape');
  assert.equal(await page.$('.epic-record-stones .sws-detail .epic-bar'), null);
  // New Epic opens an Epic's shape to fill in, and asks for a title first.
  await page.click('.epic-record-stones [data-sws-id="!new-epic"]');
  await page.click('.epic-new-create');
  assert.match(await page.textContent('.epic-new .epic-bar-said') || '', /title/);
  assert.equal(await page.$('[data-workspace-view="epics"] .terminal-hints'), null, 'no Agent vocabulary or Session controls on Epics');

  // One Epic's own page: the Team's Epics board without its strip; its items grouped by status.
  await page.goto(`${ronin.base}/#/epic/${review}`);
  await page.waitForSelector('.epic-route .epics-board .epic-group');
  assert.equal(await page.$('.epic-route .epic-strip'), null, 'no row of Epic stones');
  assert.deepEqual(await page.$$eval('.epic-route .epic-group-heading', (nodes) => nodes.map((node) => node.textContent)), ['To Do · 1', 'In Review · 1']);
  assert.equal(await page.$('.epic-route .epic-launch'), null, 'on its own page, no Launch');
  assert.deepEqual(errors, []);
});
