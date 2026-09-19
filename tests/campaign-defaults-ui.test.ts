import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('Campaign defaults use ask() and Output keeps multi-select semantics', async () => {
  const [source, css] = await Promise.all([
    fs.readFile(new URL('../public/js/campaign-defaults.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/css/campaign-home.css', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(source, /controls\.output\.multiple\s*=\s*true/);
  assert.doesNotMatch(source, /controls\.output\.size\s*=/);
  assert.match(source, /const questions = ask\(/);
  assert.match(source, /key: 'output'.*many: true/);
  for (const key of ['reach', 'recruit', 'output']) {
    assert.match(source, new RegExp(`key: '${key}'.*options: CHOICES\\.${key}\\.map`));
  }
  assert.doesNotMatch(source, /ruledRows\('(reach|recruit|output)'/, 'mandates are icon-free rectangles');
  assert.doesNotMatch(source, /key: 'dial'|ruledRows\('dial'|default_dial/, 'the legacy Control default has no surface');
  assert.doesNotMatch(source, /key: 'features'/);
  assert.match(source, /key: 'behaviours'.*many: true/);
  assert.match(source, /paint\(\);[\s\S]*?request\(`\/api\/campaign-default-options/,
    'saved defaults paint before their small option catalogs arrive');
  assert.doesNotMatch(source, /\/api\/launch-seed/, 'defaults do not assemble an Agent launch');
  assert.match(source, /shape: 'tall'/);
  assert.doesNotMatch(source, /textarea/);
  assert.match(source, /trayHost: questionsRow/, 'the launch-mode tray drops below the row, so neighbouring groups stay anchored');
  assert.match(css, /\.cv-defaults-form > \.ask,[\s\S]*?\.cv-defaults-form > \.cv-default-field \{ grid-column: 1 \/ -1; \}/, 'the question row spans the card');
});
