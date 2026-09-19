// The ruled glyphs: one face per ruled word, product-wide (public/js/glyphs.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { GLYPHS, glyph, ruledRows } = await import('../public/js/glyphs.js');

test('every ruled mandate word and kind has one glyph, and an unknown word has none', () => {
  for (const axis of ['reach', 'recruit', 'output', 'kind']) for (const [word, face] of Object.entries(GLYPHS[axis])) assert.ok(face, `${axis}.${word}`);
  assert.equal(glyph('reach', 'plan'), '🗺');
  assert.equal(glyph('reach', 'nonsense'), '');
  assert.deepEqual(ruledRows('reach', ['open', 'plan'], (v) => v.toUpperCase()), [{ v: 'open', l: 'OPEN', glyph: '○' }, { v: 'plan', l: 'PLAN', glyph: '🗺' }]);
});

test('no consumer keeps its own glyph table for a ruled axis', async () => {
  const read = (file) => readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8').catch(() => '');
  for (const file of ['new-agent.js', 'new-team-form.js', 'team-agents.js', 'campaign-defaults.js', 'team-configuration.js', 'setup-surfaces.js']) {
    const source = await read(file);
    if (!source.includes("from './ask.js'")) continue;
    assert.doesNotMatch(source, /glyphs?: \[['"]/, `${file} reads glyphs from glyphs.js, not an inline list`);
  }
});
