import test from 'node:test';
import assert from 'node:assert/strict';
import { unpromotedAcceptedLines } from '../src/promotion/discovery.js';

test('historical, direct, and missing accepted rows cannot poison current promotion discovery', async () => {
  const accepted = [
    { repo: 'cowork', line: 'team/sea/dev' },
    { repo: 'shiwake', line: 'team/sea/dev' },
    { repo: 'lab', line: 'team/sea/dev' },
    { repo: 'removed', line: 'team/sea/dev' },
  ];
  const state = new Map([
    ['cowork', 'integrated'],
    ['shiwake', 'pending'],
    ['lab', 'direct'],
    ['removed', 'missing'],
  ]);
  const rows = await unpromotedAcceptedLines(accepted, async ({ repo }) => state.get(repo) === 'pending');
  assert.deepEqual(rows, [{ repo: 'shiwake', line: 'team/sea/dev' }]);
});
