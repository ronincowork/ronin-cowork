import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyStatus } from '../src/status.js';
import { parsePrompt } from '../src/send.js';

test('Codex trust choice is a dialog, never a ready prompt', () => {
  const screen = 'Do you trust the contents of this directory?\n\n› 1. Yes, continue\n  2. No, quit';
  assert.equal(classifyStatus(screen), 'awaiting-input');
  assert.deepEqual(parsePrompt(screen), { found: true, text: null, menu: true });
});

test('Codex ready row is recognized and its dim suggestion is not owner text', () => {
  const plain = '› Use /skills to list available skills\n\n  gpt-5.6-sol default · ~/repo';
  const escaped = '\x1b[2m› Use /skills to list available skills\x1b[0m\n\n  gpt-5.6-sol default · ~/repo';
  assert.equal(classifyStatus(plain), 'ready');
  assert.deepEqual(parsePrompt(escaped), { found: true, text: null, menu: false });
});

test('Codex pending text is readable for submit verification', () => {
  assert.deepEqual(parsePrompt('› Build the startup brief\n'), {
    found: true,
    text: 'Build the startup brief',
    menu: false,
  });
});
