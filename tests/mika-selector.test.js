import assert from 'node:assert/strict';
import test from 'node:test';

const { mikaViewContext } = await import('../public/js/mika-context.js');

test('Mika context names only visible workspaces in workbench order', () => {
  assert.equal(mikaViewContext('Team Forge', {
    selected: 'workspace2',
    order: ['workspace1', 'selector', 'workspace2', 'workspace3'],
    hidden: ['workspace3'],
    workspaces: {
      workspace1: { holds: 'session', session: 'lead' },
      workspace2: { holds: 'team.commons' },
      workspace3: { holds: 'document' },
    },
  }), 'Context only—do not reply: Team Forge; selected workspace2; visible workspace1=session:lead, workspace2=team.commons.');
});

test('Mika context has an honest empty fallback', () => {
  assert.equal(mikaViewContext('', {}), 'Context only—do not reply: Ronin; selected workspace1; visible none.');
});
