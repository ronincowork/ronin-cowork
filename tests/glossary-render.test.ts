import test from 'node:test';
import assert from 'node:assert/strict';
import { renderGlossary } from '../src/session-boot.js';
import { activeDeskProfileName, listDeskProfiles } from '../src/desk-profiles.js';
import { resolveLexicon } from '../src/lexicons.js';

const TEMPLATE = [
  '<!-- RENDERED_FOR:START -->',
  '> template note',
  '<!-- RENDERED_FOR:END -->',
  '| `wipeboard` | **wipeboard**<!--g:glossary.wipeboard--> | one line |',
  '| team (`@ronin-tags`) | **Team**<!--g:glossary.team--> | one line |',
].join('\n');

test('the glossary renders its keyed cells from the desk words and drops the markers', async () => {
  const profileName = await activeDeskProfileName();
  const profile = profileName ? (await listDeskProfiles()).find((row) => row.name === profileName) : undefined;
  const words = profile?.lexicon ? (await resolveLexicon(profile.lexicon))?.words || {} : {};
  const out = await renderGlossary(TEMPLATE);
  assert.ok(!out.includes('<!--g:'), 'markers are dropped');
  assert.ok(out.includes(`| **${words['glossary.wipeboard'] || 'wipeboard'}** |`), 'wipeboard uses the effective desk word');
  assert.ok(out.includes(`| **${words['glossary.team'] || 'Team'}** |`), 'Team uses the effective desk word');
  assert.ok(!out.includes('> template note'), 'the header slot is rewritten');
  assert.ok(/Rendered for/.test(out), 'the header says what it was rendered for');
});
