import test from 'node:test';
import assert from 'node:assert/strict';
import { taskAtHand } from '../public/js/shingo.js';

test('the focus work item supplies the task at hand, and no item falls back to the record objective', () => {
  const item = { id: 'w2', title: 'Board', objective: 'Render one board.', stage: 'BUILD', status: 'yellow', exit: 'agent', ladder: [], trail: [] };
  assert.deepEqual(taskAtHand({ objective: 'record fallback', item }), { objective: 'Render one board.', item });
  assert.deepEqual(taskAtHand({ objective: 'record fallback', item: null }), { objective: 'record fallback', item: null });
});
