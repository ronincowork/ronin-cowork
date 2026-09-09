import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MIKA_VIEW_TTL_MS, clearMikaViewsForTest, getMikaView, putMikaView, whereIsMika } from '../src/mika-context.js';

test('the source broker is wired to the verified current-generation opener', async () => {
  const source = await readFile(new URL('../src/mika-context.ts', import.meta.url), 'utf8');
  assert.match(source, /openMikaSourceAt\(mikaHomeDir\(\), ref\)/);
  assert.doesNotMatch(source, /mika-source-snapshots/);
});

test('Mika view reports only the small validated snapshot', () => {
  clearMikaViewsForTest();
  const at = 10_000;
  assert.ok(putMikaView('browser_1234', {
    workbench: 'team', team: 'mika-assit', selected: 'workspace2',
    workspaces: { workspace1: 'agent-1', workspace2: 'Team commons: Wipeboard', secret: 'no' },
    draft: 'must not enter', terminal: 'must not enter',
  }, at));
  assert.equal(whereIsMika('browser_1234', at), [
    'You are helping from the Team workbench “mika-assit”.',
    'Workspace 1 shows agent-1.',
    'Workspace 2 shows Team commons: Wipeboard.',
    'The selected workspace is 2.',
  ].join('\n'));
});

test('Mika view identity is exact, validated, and expires without a latest-tab fallback', () => {
  clearMikaViewsForTest();
  assert.equal(putMikaView('../bad', { workbench: 'team' }), null);
  assert.equal(putMikaView('browser_1234', { workbench: 'unknown' }), null);
  putMikaView('browser_1234', { workbench: 'cowork', selected: 'workspace1', workspaces: {} }, 1);
  assert.equal(getMikaView('someother_12', 2), null);
  assert.equal(getMikaView('browser_1234', MIKA_VIEW_TTL_MS + 2), null);
});
