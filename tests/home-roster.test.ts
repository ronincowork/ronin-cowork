import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivityCache } from '../src/status.js';

test('unchanged activity keeps the last classification without another capture', async () => {
  let captures = 0;
  const classify = createActivityCache(async (session: string) => {
    captures++;
    return `${session}:${captures}`;
  });

  assert.equal(await classify('agent', 100), 'agent:1');
  assert.equal(await classify('agent', 100), 'agent:1');
  assert.equal(captures, 1);
  assert.equal(await classify('agent', 101), 'agent:2');
  assert.equal(captures, 2);
});

test('a failed changed capture keeps the prior classification and retries later', async () => {
  let fail = false;
  let captures = 0;
  const classify = createActivityCache(async () => {
    captures++;
    if (fail) throw new Error('pane disappeared');
    return 'ready';
  });

  assert.equal(await classify('agent', 100), 'ready');
  fail = true;
  assert.equal(await classify('agent', 101), 'ready');
  assert.equal(await classify('agent', 101), 'ready');
  assert.equal(captures, 3, 'the failed activity stamp remains eligible for retry');
});
