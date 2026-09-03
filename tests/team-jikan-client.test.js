import test from 'node:test';
import assert from 'node:assert/strict';
import { whenPreviewText } from '../public/js/team-jikan.js';

test('a one-off preview renders the server moment once, without substituting now', () => {
  const picked = new Date(2026, 8, 4, 9, 0).toISOString();
  const shown = whenPreviewText([picked]);
  const expected = new Date(picked).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  assert.equal(shown, `Next: ${expected}`);
  assert.doesNotMatch(shown, / · /);
});
