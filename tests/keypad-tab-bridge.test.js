import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * THE KEYPAD BRIDGE. `mountPad` moves the pad's card out of its own sheet and into the
 * Keypad tab. From that moment the sheet's state is no longer the truth about whether the
 * keypad is on screen — the tab is — so both pad hooks have to answer from the tab set.
 * Leaving padpanel.js's sheet hooks in place after the card has moved reports a detached
 * sheet that can never open.
 */

test('the pad hooks answer from the tab set, and only once the card has moved', async () => {
  const commons = await source('public/js/cowork-commons.js');
  const mountPad = commons.slice(commons.indexOf('const mountPad = ()'), commons.indexOf('const enterAll'));
  // The card moves first; the hooks are rebuilt in the same step, never before it.
  assert.ok(mountPad.indexOf('keypad.append(card)') < mountPad.indexOf('S.padPanel.open'),
    'the hooks are rebuilt only after the card has moved into the tab');
  assert.match(mountPad, /S\.padPanel\.open = \(\) => \{ surface\?\.select\('keypad'\); \}/);
  assert.match(mountPad, /S\.padPanel\.isOpen = showing\('keypad'\)/);
  // An early return leaves the sheet's own hooks standing, which is right while the card
  // is still in the sheet.
  assert.match(mountPad, /if \(!card \|\| keypad\.contains\(card\)\) return !!card;/);
  // The never-assigned indirection that used to sit between them stays deleted.
  assert.doesNotMatch(commons, /showCoworkCommons/);
});

test('padpanel keeps its own sheet hooks for the pre-mount case', async () => {
  const pad = await source('public/js/padpanel.js');
  assert.match(pad, /S\.padPanel = \{ open, close, isOpen, hit,/);
  assert.match(pad, /const isOpen = dlg\.isOpen;/);
});

test('isOpen is false unless the Keypad tab is the one showing, on a surface on screen', async () => {
  const commons = await source('public/js/cowork-commons.js');
  const line = commons.split('\n').find((l) => l.includes('const showing = (id) =>'));
  assert.ok(line, 'the predicate the bridge hands to isOpen');
  // Every clause matters: a surface between placements, or one inside a hidden workspace,
  // is not showing the keypad however its tab set is selected.
  for (const clause of ['!!surface', 'surface.el.isConnected', "!surface.el.closest('[hidden]')", 'surface.current() === id']) {
    assert.ok(line.includes(clause), `showing() must test ${clause}`);
  }
});

test('select is the one path, so the pad reaches the tab exactly as a click does', async () => {
  const tabs = await source('public/js/workspace-tabs.js');
  // `open()` calls select, which enters the panel and scrolls the tab into view — the pad
  // gets the same treatment as a pointer, with no second route into the strip.
  assert.match(tabs, /button\.addEventListener\('click', \(\) => select\(id\)\)/);
  assert.match(tabs, /if \(entered \|\| live\) chosen\.service\?\.enter\?\.\(context\)/);
  assert.match(tabs, /current: \(\) => current/);
});
