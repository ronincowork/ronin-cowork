import test from 'node:test';
import assert from 'node:assert/strict';
import { messageSender } from '../src/message-sender.js';

test('message sender resolves a shared viewer pane to its base session identity', async () => {
  assert.equal(await messageSender('', '%42', async () => 'desk_source_finish'), 'desk_source_finish');
  assert.equal(await messageSender('explicit_agent', '%42', async () => 'ignored'), 'explicit_agent');
  assert.equal(await messageSender('', '%42', async () => 'grid_viewer'), 'Agent');
});
