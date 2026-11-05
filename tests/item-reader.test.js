// An item's reading (owner, 2026-11-05): the launch forms' format — a head, then label-left
// steps — at the form tokens only, with Status an ERABI question that moves the item.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the reader is drawn as form steps, and Status is an ask() that posts the transition', async () => {
  const surface = await read('public/js/work-items-surface.js');
  const body = surface.slice(surface.indexOf('export function renderItemDetail'), surface.indexOf('/** A phalanx of item stones'));
  assert.match(body, /el\('div', 'ntf-form wi-form'\)/);
  // w297: every step folds with the form steps' own fold, and the fold is kept between items.
  assert.match(body, /createStep\(\{ key: id, title, onToggle: \(\) => \{ FOLDS\.set\(id, !\(FOLDS\.get\(id\) \?\? true\)\); paint\(\); \} \}\)/);
  assert.match(body, /one\.setCollapsed\(!\(FOLDS\.get\(id\) \?\? true\), meta\(\), true\)/);
  assert.match(surface, /const FOLDS = new Map\(\[\['done', false\]\]\);/, 'Done starts folded');
  // w297: the Done Subtasks have their own section; the open ones stay in Subtasks.
  assert.match(body, /const open = children\.filter\(\(child\) => !isDone\(child\)\);/);
  assert.match(body, /step\('done', t\('work_items\.done_n', 'Done \(\{n\}\)', \{ n: done\.length \}\)/);
  // w297: the comment box posts to the work-item comment route and says who it reached.
  assert.match(body, /\/comment`, \{ method: 'POST', json: \{ text \} \}/);
  assert.match(body, /result\.data\?\.notified/);
  assert.match(body, /ask\(\[\{ fields: \[\{ key: 'status'/);
  assert.match(body, /\/transition`, \{ method: 'POST', json: \{ status: next \} \}/);
  assert.match(body, /else \{ question\.set\('status', was\)/, 'a refused move puts the answer back');
  assert.doesNotMatch(body, /el\('h3'/, 'section names are the steps\', not bare headings');
  // Any status to any status, the item's own kept when its space names another.
  const choices = new Function(`${surface.match(/export const ITEM_STATUSES = [^;]+;/)[0].replace('export ', '')}
    ${surface.match(/export const statusChoices = [^\n]+/)[0].replace('export ', '')} return statusChoices;`)();
  assert.deepEqual(choices({ status: 'In Review' }), ['To Do', 'In Progress', 'In Review', 'Done']);
  assert.deepEqual(choices({ status: 'Blocked' }), ['To Do', 'In Progress', 'In Review', 'Done', 'Blocked']);
});

test('every size in the reader is a token, and the tile overlay reads in the UI face', async () => {
  const css = await read('public/css/launch-forms.css');
  const rules = css.split('\n').filter((line) => /^\s*\.wi-/.test(line));
  assert.ok(rules.length > 5);
  for (const rule of rules) assert.doesNotMatch(rule, /font-size:\s*\d/, rule);
  const style = await read('public/style.css');
  assert.match(style, /\.tile-body > \.work-overlay \{[^}]*font-family: var\(--font-ui\)/);
  assert.match(await read('public/js/tilehead.js'), /await overTile\(tile, '', \(box\) =>/, 'the reader\'s head carries the key: no second title');
});
