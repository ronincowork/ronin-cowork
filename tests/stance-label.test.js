import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('w452: an unknown stance draws no words, never the raw key', async () => {
  const [home, roster, view] = await Promise.all([source('public/js/home.js'), source('public/js/roster.js'), source('public/js/cowork-view.js')]);
  assert.match(home, /unknown: '',/);
  assert.doesNotMatch(home, /home\.stance_unknown/);
  // Every place it is drawn drops an empty label.
  assert.match(roster, /if \(s\.stance && s\.stance !== 'unknown'\)/);
  assert.match(view, /live\.title = stanceLabel\(rows\.get\(member\.name\)\?\.stance\) \|\| '';/);
  assert.match(view, /lines: \[current\.text, stanceLabel\(row\.stance\),[^\]]*\]\.filter\(Boolean\)/);
});
