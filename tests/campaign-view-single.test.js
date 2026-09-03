import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the Campaign page has one switch for offering New Campaign', async () => {
  const source = await readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8');
  assert.match(source, /const MULTIPLE_CAMPAIGNS_ENABLED = false;/);
  assert.match(source, /if \(MULTIPLE_CAMPAIGNS_ENABLED\) add\(\{ type: TYPES\.create/);
  assert.match(source, /MULTIPLE_CAMPAIGNS_ENABLED \|\| type !== TYPES\.create/);
  for (const type of ['identity', 'profile', 'routines', 'defaults', 'templates']) {
    assert.match(source, new RegExp(`add\\(\\{ type: TYPES\\.${type}`));
  }
});
