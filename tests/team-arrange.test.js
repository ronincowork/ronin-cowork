import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDraft, createArranger } from '../public/js/team-arrange.js';

/** A draft names only what changes; what it omits stays. The parser refuses, never guesses. */

test('a draft line becomes a draft; omitted parts are absent, not defaulted', () => {
  const { draft, errors } = parseDraft(['workspace1=me', 'workspace2=commons:docs:wip/handoffs/X.md'], 'view_mgr');
  assert.deepEqual(errors, []);
  assert.deepEqual(draft, {
    workspace1: { session: 'view_mgr' },
    workspace2: { commons: true, tab: 'docs', doc: 'wip/handoffs/X.md' },
  });
  assert.equal('order' in draft, false);
  assert.equal('hidden' in draft, false);
});

test('columns: order, hidden, shown, roster=hidden, hidden=none', () => {
  assert.deepEqual(parseDraft(['order=workspace2,roster,workspace1']).draft, { order: ['workspace2', 'roster', 'workspace1'] });
  assert.deepEqual(parseDraft(['roster=hidden']).draft, { hidden: ['roster'] });
  assert.deepEqual(parseDraft(['hidden=roster,workspace2']).draft, { hidden: ['roster', 'workspace2'] });
  assert.deepEqual(parseDraft(['hidden=none']).draft, { shown: ['workspace1', 'roster', 'workspace2'] });
  assert.deepEqual(parseDraft(['workspace1=commons:config']).draft.workspace1, { commons: true, tab: 'team-configuration', doc: '' });
  assert.deepEqual(parseDraft(['workspace1=terminal', 'workspace2=empty']).draft, { workspace1: { terminal: true }, workspace2: { empty: true } });
});

test('unknown words are refused with the word named', () => {
  const { draft, errors } = parseDraft(['workspace3=x', 'order=left', 'workspace1=commons:mail', 'roster=big', 'nonsense', 'workspace2=']);
  assert.deepEqual(draft, {});
  assert.deepEqual(errors, [
    'workspace3: not a draft key',
    'order: no column "left"',
    'workspace1: no commons tab "mail"',
    'roster: hidden or shown',
    'nonsense: not key=value',
    'workspace2: say what goes there',
  ]);
});

test('the arranger runs a draft through the page\'s own verbs, columns first, and says what it did', () => {
  const calls = [];
  const verbs = {
    showColumn: (n) => calls.push(['show', n]),
    hideColumn: (n) => calls.push(['hide', n]),
    moveColumn: (n, i) => calls.push(['move', n, i]),
    putSession: (n, ws) => { calls.push(['session', n, ws]); return n !== 'ghost'; },
    putCommons: (ws, tab, doc) => calls.push(['commons', ws, tab, doc]),
    putTerminal: (ws) => calls.push(['terminal', ws]),
    emptySeat: (ws) => calls.push(['empty', ws]),
  };
  const { apply } = createArranger(verbs);
  const did = apply(parseDraft(['workspace2=commons:docs:a.md', 'order=workspace2,workspace1', 'roster=hidden', 'workspace1=ghost']).draft);
  assert.deepEqual(calls, [
    ['move', 'workspace2', 0], ['move', 'workspace1', 1], ['hide', 'roster'],
    ['session', 'ghost', 'workspace1'], ['commons', 'workspace2', 'docs', 'a.md'],
  ]);
  assert.deepEqual(did, ['order workspace2→0', 'order workspace1→1', 'hide roster', 'workspace1: no session ghost', 'workspace2 commons:docs']);
  assert.deepEqual(apply({}), [], 'an empty draft does nothing');
});
