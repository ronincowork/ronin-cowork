import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * THE GATE IS INSTALLED, YES OR NO (owner, 2026-09-19). Ronin Services cannot be
 * installed without a registration, so installed means it works. Nothing downstream asks
 * a second question, and no tab invents its own sentence about why a feature is missing.
 */

test('the Stats tab is unselectable only when its service is not installed', async () => {
  const [commons, state] = await Promise.all([source('public/js/cowork-commons.js'), source('public/js/state.js')]);
  // serviceOff takes a PANE name; this tab's id is `health` and the pane is `stats`.
  assert.match(state, /PANE_SERVICE = \{[^}]*stats: 'counting'/);
  assert.match(commons, /c\.id === 'health' && serviceOff\('stats'\)/);
  // The same test and the same words the Account rows beside it already use.
  assert.match(commons, /disabled: true, title: t\('commons\.tab_off'/);
  assert.match(commons, /if \(serviceOff\(r\.id\)\) \{/);
  // No second question about entitlement, and no helper of its own to ask it with.
  assert.doesNotMatch(commons, /capabilityOn|entitle/i);
  assert.doesNotMatch(state, /capabilityOn/);
});

test('the Stats room reports what the machine said, never a guess of its own', async () => {
  const stats = await source('public/js/stats.js');
  assert.match(stats, /body\.textContent=r\.message\|\|'Stats could not be read\.'/);
  // 'Not available on this install yet' read as 'we have not built it', so the honest
  // response was to wait when the truth was a switch.
  assert.doesNotMatch(stats, /not available on this install/i);
});

test('the tab set already carries an unavailable tab, so nothing new was invented', async () => {
  const tabs = await source('public/js/workspace-tabs.js');
  assert.match(tabs, /button\.disabled = !!declared\.disabled;/);
  assert.match(tabs, /function setAvailable\(id, state = \{\}\) \{/);
  // A tab that cannot be chosen never becomes the selected one.
  assert.match(tabs, /const open = tabs\.filter\(\(tab\) => tab && !tab\.hidden && !tab\.disabled\);/);
});
