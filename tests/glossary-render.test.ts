import test from 'node:test';
import assert from 'node:assert/strict';
import { renderGlossary } from '../src/session-boot.js';

const TEMPLATE = [
  '<!-- RENDERED_FOR:START -->',
  '> template note',
  '<!-- RENDERED_FOR:END -->',
  '| `wipeboard` | **wipeboard**<!--g:glossary.wipeboard--> | one line |',
  '| team (`@ronin-tags`) | **Team**<!--g:glossary.team--> | one line |',
].join('\n');

test('the glossary renders its keyed cells from the desk words and drops the markers', async () => {
  // No profile is chosen in the test environment (RONIN_* stores are the repo's defaults),
  // so the render is stock: the template's own words, no markers, a header that says so.
  const out = await renderGlossary(TEMPLATE);
  assert.ok(!out.includes('<!--g:'), 'markers are dropped');
  assert.ok(out.includes('| **wipeboard** |'), 'stock keeps the literal');
  assert.ok(out.includes('| **Team** |'), 'stock keeps the literal');
  assert.ok(!out.includes('> template note'), 'the header slot is rewritten');
  assert.ok(/Rendered for/.test(out), 'the header says what it was rendered for');
});
