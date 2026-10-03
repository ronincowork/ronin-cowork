import test from 'node:test';
import assert from 'node:assert/strict';

const { whoRows } = await import('../public/js/who-rows.js');

// The shape GET /api/collection answers (src/collection-read.ts).
const reading = {
  teams: [
    { name: 'surface', title: 'Surface', objective: 'Upgrade the UI UX', lead: 'surface_lead2', agents: ['a', 'b'], roots: ['ronin_cowork'], repos: [], boards: ['w1'], items: 2 },
    { name: 'ronin_helpers', title: 'Ronin Helpers', objective: '', lead: '', agents: ['mika_agent'], roots: [], repos: [], boards: [], items: 0 },
    { name: 'front-2', title: 'Front 2', objective: '', lead: '', agents: [], roots: ['ronin_cowork'], repos: [], boards: [], items: 0 },
  ],
  boards: [
    { id: 'w1', title: 'Upgrade', objective: 'o', stage: 'BUILD', holder: 'agent:surface_lead2', teams: ['surface'], roots: ['ronin_cowork'],
      stages: [{ stage: 'IDEA', items: [{ id: 'w10', title: 'Idea', stage: 'IDEA', holder: '' }] }, { stage: 'DONE', items: [{ id: 'w6', title: 'Done one', stage: 'DONE', holder: 'agent:items' }] }] },
    { id: 'w2', title: 'Unfiled', objective: '', stage: 'IDEA', holder: '', teams: [], roots: [], stages: [{ stage: 'PLAN', items: [{ id: 'w9', title: 'Loose', stage: 'PLAN', holder: '' }] }] },
  ],
  roots: [{ name: 'ronin_cowork', path: '/x', teams: ['surface', 'front-2'], boards: ['w1'] }],
};
const stageName = (key) => ({ IDEA: 'Idea', PLAN: 'Plan', BUILD: 'Build', DONE: 'Done' })[key] || key;

test('Who: one stone per Team in name order, the no-team stone carrying Unfiled, Ronin Helpers last', () => {
  const rows = whoRows(reading, { stageName, noTeamId: ' none', labels: { noTeam: 'Ronin: no team' } });
  assert.deepEqual(rows.map((row) => row.id), ['front-2', 'surface', ' none', 'ronin_helpers']);
  assert.deepEqual(rows.map((row) => row.kind), ['team', 'team', 'team', 'team']);
  const none = rows[2];
  assert.equal(none.label, 'Ronin: no team');
  assert.deepEqual(none.items.map((board) => board.id), ['w2']);
  assert.deepEqual(none.items[0].items.map((item) => item.id), ['w9']);
});

test('Who: a Team stone carries its boards as items, each board its items by stage, with counts and holders in the state', () => {
  const surface = whoRows(reading, { stageName, leadOf: (name) => (name === 'surface' ? 'Surface Lead2' : ''), labels: { agents: (n) => `${n} Agents`, items: (n) => `${n} items` } })
    .find((row) => row.id === 'surface');
  assert.equal(surface.label, 'Surface');
  assert.equal(surface.secondary, 'Upgrade the UI UX');
  assert.equal(surface.state, '2 Agents · 人 Surface Lead2');
  assert.deepEqual(surface.items.map((board) => [board.id, board.kind, board.label, board.state]), [['w1', 'board', 'Upgrade', '2 items · Build']]);
  assert.deepEqual(surface.items[0].items.map((item) => [item.id, item.kind, item.state]), [['w10', 'item', 'Idea'], ['w6', 'item', 'Done · @items']]);
});

test('Who: the lead falls back to the reading\'s session name, and a Team with no lead says only its count', () => {
  const rows = whoRows(reading, { stageName });
  assert.equal(rows.find((row) => row.id === 'surface').state, '2 Agents · 人 surface_lead2');
  assert.equal(rows.find((row) => row.id === 'front-2').state, '0 Agents');
});

test('Who: with a workspace filter the no-team stone is not offered (the server already narrowed the Teams)', () => {
  const narrowed = { ...reading, teams: reading.teams.filter((team) => team.roots.includes('ronin_cowork')), boards: reading.boards.filter((board) => board.roots.includes('ronin_cowork')) };
  const rows = whoRows(narrowed, { stageName, root: 'ronin_cowork' });
  assert.deepEqual(rows.map((row) => row.id), ['front-2', 'surface']);
});

test('Who: a missing or malformed reading draws no stones rather than throwing', () => {
  assert.deepEqual(whoRows(undefined, { stageName }).map((row) => row.id), [' unassigned']);
  assert.deepEqual(whoRows({ teams: null, boards: 'x' }, { root: 'r' }), []);
});
