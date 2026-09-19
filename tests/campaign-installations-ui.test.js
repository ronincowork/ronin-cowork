import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Campaign Installations is the shared stone surface with the Setup Services and gbrain pages', async () => {
  const source = await readFile(new URL('../public/js/campaign-installations.js', import.meta.url), 'utf8');
  const campaign = await readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8');
  assert.match(source, /createStoneWorkSurface/);
  assert.match(source, /\['ronin_services', 'gbrain', 'trello', 'perplexity'\]/);
  assert.match(source, /createStatusMarker\(installation\.maturity\)/);
  assert.doesNotMatch(source, /INSTALLATION_STATUS/);
  assert.match(source, /context\.createInstallationSurface\?\.\(installation\.id, sharedContext\)/);
  assert.match(campaign, /createInstallationSurface: \(id, shared\) => id === 'ronin_services' \? createServicesSurface\(shared\) : id === 'gbrain' \? createGbrainSurface\(shared\) : null/);
  assert.match(source, /key: 'available'.*switch: \[t\('campaign_view\.on', 'On'\), t\('campaign_view\.off', 'Off'\)\]/);
  assert.match(source, /key: 'defaultForAll'.*switch: \[t\('campaign_view\.on', 'On'\), t\('campaign_view\.off', 'Off'\)\]/);
  assert.match(source, /turn Available on first/);
  assert.match(source, /control\.disabled = off/);
  assert.match(source, /availableControl\.disabled = Boolean\(reason\)/);
  assert.match(source, /installationControls: controls/);
  assert.match(source, /installation\.effect === 'provider'/);
  assert.match(source, /saveCampaign\(row\.id, \{ config: \{ installations \} \}\)/);
  assert.match(source, /saveCampaign\(row\.id, \{ config: \{ defaults \} \}\)/);
  assert.doesNotMatch(source, /shape: 'square'|shape_all|answer === 'all'/);
  assert.match(source, /stoneSurface\.select\('ronin_services'\)/);
  assert.match(source, /Ronin Services required/);
  assert.match(source, /name === 'trello' \|\| name === 'perplexity'/);
  assert.match(source, /values\.ronin_services === true.*installed\?\.services\?\.parts/);
  assert.doesNotMatch(source, /servicesSell|installBlock|cv-choice|type = 'checkbox'|Available to Teams and Agents/);
});

test('the Campaign imports the exact exported Setup page builders', async () => {
  const setup = await readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
  assert.match(setup, /export function createServicesSurface\(context\)/);
  assert.match(setup, /export function createGbrainSurface\(context\)/);
  for (const id of ['task_manager', 'usage_stats', 'project_coordinator', 'local_weights']) {
    assert.match(setup, new RegExp(`id: '${id}',[^}]+status: 'beta'`));
  }
  for (const id of ['terminal_transcript', 'voice_hotwords']) {
    assert.match(setup, new RegExp(`id: '${id}',[^}]+status: 'comingSoon'`));
  }
});
