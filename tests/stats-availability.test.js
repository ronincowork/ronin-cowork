import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * ONE GATE, NOT CHECKS DOWN THE STREET (owner, 2026-09-19). Ronin Services cannot be
 * installed without a registration, and a capability cannot be switched on unless it is
 * installed — so ON MEANS IT WORKS. A surface asks that one question and takes the
 * answer; no room behind a tab re-tests the box's entitlement, and no tab invents its own
 * sentence about why a feature is missing.
 */

test('a capability is on or it is not, and one helper answers', async () => {
  const state = await source('public/js/state.js');
  assert.match(state, /export const capabilityOn = \(name\) =>\s*!!S\.installedServices\?\.capabilities\?\.running\?\.includes\(name\)/);
  // Not being in the running list is the whole of being off: no fallback for an older
  // answer shape, and nothing to migrate.
  assert.doesNotMatch(state, /capabilityOn[\s\S]{0,200}: true/);
});

test('the Stats tab is unselectable when Stats is not switched on', async () => {
  const commons = await source('public/js/cowork-commons.js');
  assert.match(commons, /import \{ S, serviceOff, capabilityOn \} from '\.\/state\.js'/);
  assert.match(commons, /c\.id === 'health' && !capabilityOn\('usage_stats'\)/);
  // Installed and unusable: the tab keeps its place and names what is missing.
  assert.match(commons, /disabled: true, title: t\('cowork\.tab_health_off'/);
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
