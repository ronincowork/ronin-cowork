import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('Campaign Output defaults collapse into a dropdown without losing multi-select semantics', async () => {
  const source = await fs.readFile(new URL('../public/js/campaign-defaults.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /controls\.output\.multiple\s*=\s*true/);
  assert.doesNotMatch(source, /controls\.output\.size\s*=/);
  assert.match(source, /name === 'output' \? multiSelectOf/);
  assert.match(source, /output:\s*controls\.output\.values\(\)/);
});
