import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('Campaign Output default is a dropdown that stores one launch-spec output', async () => {
  const source = await fs.readFile(new URL('../public/js/campaign-defaults.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /controls\.output\.multiple\s*=\s*true/);
  assert.doesNotMatch(source, /controls\.output\.size\s*=/);
  assert.match(source, /output:\s*\[controls\.output\.value\]/);
});
