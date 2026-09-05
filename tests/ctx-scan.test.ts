/**
 * The ⛽ line is SCRAPED off the pane, and the model is whatever follows " · " on it.
 * Claude Code pads that line to the pane width and may right-align other text on the
 * same row, so the model must be read up to the first run of two or more spaces, not
 * only up to the end of the line. Seen on dohyo, 2026-09-05: a session whose pane
 * printed `⛽ ctx 36% · Fable 5.1      /rc` reported no model at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanContext, scanModel } from '../src/ctx.js';

test('model alone at the end of the ⛽ line', () => {
  assert.equal(scanModel('❯ \n⛽ ctx 42% · Opus 5\n'), 'Opus 5');
  assert.equal(scanContext('❯ \n⛽ ctx 42% · Opus 5\n'), 42);
});

test('model followed by right-aligned text on the same row', () => {
  const text = '❯ \n  ⛽ ctx 36% · Fable 5.1                                               /rc\n  ⏵⏵ bypass permissions on\n';
  assert.equal(scanModel(text), 'Fable 5.1');
  assert.equal(scanContext(text), 36);
});

test('a line with a percentage and no model reads no model', () => {
  assert.equal(scanModel('⛽ ctx 12%\n'), null);
});
