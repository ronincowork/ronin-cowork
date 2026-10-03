import test from 'node:test';
import assert from 'node:assert/strict';

const { whoRows, whoMove } = await import('../public/js/who-rows.js');

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

test('Who: one stone per Team in name order, Ronin Helpers last, and no stone for "no team" (Unfiled says nothing)', () => {
  const rows = whoRows(reading);
  assert.deepEqual(rows.map((row) => row.id), ['front-2', 'surface', 'ronin_helpers']);
  assert.deepEqual(rows.map((row) => row.kind), ['team', 'team', 'team']);
  assert.ok(!rows.some((row) => row.items.some((board) => board.id === 'w2')), 'the Unfiled board is under no stone');
});

test('Who: a Team stone is its name and lead; its boards stack under it, each board its items by stage, every bar its title alone', () => {
  const surface = whoRows(reading, { leadOf: (name) => (name === 'surface' ? 'Surface Lead2' : '') })
    .find((row) => row.id === 'surface');
  assert.equal(surface.label, 'Surface');
  assert.equal(surface.secondary, undefined);
  assert.equal(surface.state, '人 Surface Lead2');
  assert.deepEqual(surface.items.map((board) => [board.id, board.kind, board.label, board.state]), [['w1', 'board', 'Upgrade', undefined]]);
  assert.deepEqual(surface.items[0].items.map((item) => [item.id, item.kind, item.label, item.state]), [['w10', 'item', 'Idea', undefined], ['w6', 'item', 'Done one', undefined]]);
});

test('Who: the lead falls back to the reading\'s session name, and a Team with no lead says nothing', () => {
  const rows = whoRows(reading);
  assert.equal(rows.find((row) => row.id === 'surface').state, '人 surface_lead2');
  assert.equal(rows.find((row) => row.id === 'front-2').state, '');
});

test('Who: under each Team, Agents instead of boards: the lead first and marked', () => {
  const members = { surface: [{ name: 'surface_lead2', title: 'Surface Lead2', lead: true }, { name: 'a', title: 'A', lead: false }] };
  const rows = whoRows(reading, { under: 'agents', membersOf: (name) => members[name] || [] });
  assert.deepEqual(rows.find((row) => row.id === 'surface').items.map((row) => [row.id, row.kind, row.label]), [['agent:surface_lead2', 'agent', '人 Surface Lead2'], ['agent:a', 'agent', 'A']]);
  assert.deepEqual(rows.find((row) => row.id === 'front-2').items, []);
});

test('Who: a narrowed reading (the server already filtered by workspace) draws only what it names', () => {
  const narrowed = { ...reading, teams: reading.teams.filter((team) => team.roots.includes('ronin_cowork')), boards: reading.boards.filter((board) => board.roots.includes('ronin_cowork')) };
  assert.deepEqual(whoRows(narrowed).map((row) => row.id), ['front-2', 'surface']);
});

test('Who: a missing or malformed reading draws no stones rather than throwing', () => {
  assert.deepEqual(whoRows(undefined), []);
  assert.deepEqual(whoRows({ teams: null, boards: 'x' }), []);
});

test('Who: what a drop means — item onto another board reparents, board or Agent onto another Team moves it, anything else nothing', () => {
  const team = { kind: 'team', id: 'surface' };
  const board = { kind: 'board', id: 'w1' };
  assert.equal(whoMove({ kind: 'item', id: 'w9', team: 'front-2', board: 'w2' }, board), 'reparent');
  assert.equal(whoMove({ kind: 'item', id: 'w6', team: 'surface', board: 'w1' }, board), '', 'already on that board');
  assert.equal(whoMove({ kind: 'board', id: 'w2', team: '', board: '' }, team), 'assign');
  assert.equal(whoMove({ kind: 'board', id: 'w1', team: 'surface', board: '' }, team), '', 'already that Team\'s');
  assert.equal(whoMove({ kind: 'agent', id: 'a', team: 'front-2', board: '' }, team), 'join');
  assert.equal(whoMove({ kind: 'agent', id: 'a', team: 'surface', board: '' }, team), '');
  assert.equal(whoMove({ kind: 'item', id: 'w9', team: '', board: 'w2' }, team), '', 'an item is not a Team\'s to take');
  assert.equal(whoMove({ kind: 'board', id: 'w2' }, board), '');
  assert.equal(whoMove(null, team), '');
});
