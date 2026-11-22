/**
 * The item lifecycle (KAN-785): the one contract every Epic, Team, Agent and Workspace summary
 * uses. Its numbering, counts, mean, bands and shares here; its drawing and reading on the pages in
 * epics.test.ts (an Epic) and teams.test.ts (a Team and an Agent).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './helpers/ronin.js';

const life = await import(pathToFileURL(path.join(ROOT, 'public/js/item-lifecycle.js')).href);
const epic = await import(pathToFileURL(path.join(ROOT, 'public/js/epic-stage.js')).href);

const item = (status: string, extra: Record<string, unknown> = {}) => ({ level: 0, status, ...extra });

test('a status\'s family and number: To Do 1, In Progress 2, In Review 3, Done 4; anything else To Do', () => {
  assert.deepEqual(life.LIFECYCLE, ['todo', 'progress', 'review', 'done']);
  assert.deepEqual({ ...life.LIFECYCLE_SCORE }, { todo: 1, progress: 2, review: 3, done: 4 });
  assert.equal(life.statusKey('In Review'), 'review');
  assert.equal(life.statusKey('Doing'), 'progress');
  assert.equal(life.statusKey('Closed'), 'done');
  assert.equal(life.statusKey('Backlog'), 'todo');
  assert.equal(life.statusKey(undefined), 'todo');
});

test('counts over level-0 items only; mean, band and shares', () => {
  const none = life.lifecycle([]);
  assert.deepEqual(none, { counts: { todo: 0, progress: 0, review: 0, done: 0 }, n: 0, score: 0, band: 0, shares: { todo: 0, progress: 0, review: 0, done: 0 } });
  // An Epic is the summary and a Subtask a step of its Task: neither is counted. No level is counted.
  const mixed = life.lifecycle([{ level: 1, status: 'To Do' }, { level: -1, status: 'To Do' }, item('In Review'), { status: 'Done' }]);
  assert.deepEqual(mixed.counts, { todo: 0, progress: 0, review: 1, done: 1 });
  assert.equal(mixed.n, 2);
  assert.equal(mixed.score, 3.5);
  assert.deepEqual(mixed.shares, { todo: 0, progress: 0, review: 0.5, done: 0.5 });
  const band = (statuses: string[]) => life.lifecycle(statuses.map((s) => item(s))).band;
  assert.equal(band(['To Do', 'To Do']), 1);
  assert.equal(band(['To Do', 'In Progress']), 2, '1.5 is band 2');
  assert.equal(band(['In Progress', 'In Review']), 3, '2.5 is band 3');
  assert.equal(band(['Done', 'Done', 'Done', 'To Do']), 4, '3.25 is band 4');
});

test('an Epic only names the shared band and adds Done and Icebox; it does not count on its own', () => {
  const items = [item('In Progress'), item('In Review'), item('Done', { flagged: true })];
  const shared = life.lifecycle(items);
  const stage = epic.epicStage({ status: 'In Progress', holder: 'team:shop' }, items);
  for (const key of ['counts', 'n', 'score', 'band', 'shares']) assert.deepEqual(stage[key], shared[key], key);
  assert.equal(stage.stage, 'maturing');
  assert.equal(epic.epicStage({ status: 'Done', holder: 'team:shop' }, items).stage, 'done');
  assert.equal(epic.epicStage({ status: 'To Do', holder: 'workspace:shop' }, items).stage, 'icebox');
});
