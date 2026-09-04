// A hand-in reaches the team lead regardless of the lead's dial (owner law 2026-08-28).
// This pins the pure half: who the lead is, which team a line belongs to, and what the
// lead is told. The tmux read and the house sender are exercised by hand, not here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SEP, leadMessage, leadsFor, parseSessionRows, replyMessage, selfMessage, teamOfLine } from '../src/desks/lead.js';

const rows = parseSessionRows([
  ['comps', 'ronin_comps', 'ronin_comps'].join(SEP),
  ['comp_fable', 'ronin_comps', ''].join(SEP),
  ['league', 'ronin_comps,league_kit', 'league_kit'].join(SEP),
  ['grid_comp_fable_88e650_9', '', ''].join(SEP),
  ['koe', '', ''].join(SEP),
  '',
].join('\n'));

test('the lead is whoever @ronin-lead names for the team — hand-set, never derived from a role', () => {
  assert.deepEqual(leadsFor('ronin_comps', rows), ['comps']);
  assert.deepEqual(leadsFor('league_kit', rows), ['league']);
  assert.deepEqual(leadsFor('nobody', rows), []);
});

test('viewer sessions are never leads; blank lines are ignored', () => {
  assert.ok(rows.every((r) => !r.name.startsWith('grid_')));
  assert.equal(rows.length, 4);
});

test('a line names its team; dev and solo lines have none', () => {
  assert.equal(teamOfLine('team/ronin_comps/dev'), 'ronin_comps');
  assert.equal(teamOfLine('dev'), null);
  assert.equal(teamOfLine('solo/rireki'), null);
  assert.equal(teamOfLine('team/ronin_comps/comp_fable'), null);
});

test('the lead is told what happened and what to do, in one line', () => {
  const ok = leadMessage({ team: 'ronin_comps', line: 'team/ronin_comps/dev', session: 'comp_fable', receiptId: 'hi_1', result: 'accepted', lineSha: '3474fd1f74abcdef' });
  assert.match(ok, /hand-in hi_1 by comp_fable is on team\/ronin_comps\/dev \(3474fd1f74\)/);
  assert.match(ok, /bin\/ronin-promote ronin_comps/);
  const bad = leadMessage({ team: 'ronin_comps', line: 'team/ronin_comps/dev', session: 'comp_fable', receiptId: 'hi_2', result: 'conflict', files: ['a.ts', 'b.ts'] });
  assert.match(bad, /CONFLICTS with team\/ronin_comps\/dev on a\.ts, b\.ts/);
  assert.match(bad, /adjudicate/);
});

test('with no lead, the reply is one plain sentence', () => {
  const ok = selfMessage({ team: 'ronin_comps', line: 'team/ronin_comps/dev', session: 'comp_fable', receiptId: 'hi_1', result: 'accepted' });
  assert.equal(ok, "this didn't work for promotion: team ronin_comps has no lead; ask the owner to mark one on the Team page.");
  const bad = selfMessage({ team: 'ronin_comps', line: 'team/ronin_comps/dev', session: 'comp_fable', receiptId: 'hi_2', result: 'conflict', files: ['a.ts'] });
  assert.equal(bad, ok);
});

test('a lead reply is visibly bound to its hand-in receipt', () => {
  assert.equal(
    replyMessage('hi_123', 'comps', 'split the oversized module and hand in again'),
    'lead reply on hand-in hi_123 from comps: split the oversized module and hand in again',
  );
});
