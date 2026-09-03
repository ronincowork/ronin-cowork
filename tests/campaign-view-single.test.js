import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the Campaign page has one switch for offering New Campaign', async () => {
  const source = await readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8');
  const campaigns = await readFile(new URL('../public/js/campaigns.js', import.meta.url), 'utf8');
  assert.match(campaigns, /export const MULTIPLE_CAMPAIGNS_ENABLED = false;/);
  assert.match(source, /if \(MULTIPLE_CAMPAIGNS_ENABLED\) add\(\{ type: TYPES\.create/);
  assert.match(source, /MULTIPLE_CAMPAIGNS_ENABLED \|\| type !== TYPES\.create/);
  for (const type of ['identity', 'profile', 'routines', 'defaults', 'templates']) {
    assert.match(source, new RegExp(`add\\(\\{ type: TYPES\\.${type}`));
  }
});

test('the home page renders the Campaign as a fixed door', async () => {
  const source = await readFile(new URL('../public/js/campaign-home.js', import.meta.url), 'utf8');
  assert.match(source, /key: 'campaign', route: 'campaign'/);
  assert.doesNotMatch(source, /\bcreateCampaign\b|campaignSelection|campaign_ids|archiveCampaign|New Campaign/);
});

test('the fixed Campaign identity does not render its id', async () => {
  const source = await readFile(new URL('../public/js/campaign-surfaces.js', import.meta.url), 'utf8');
  assert.match(source, /const id = MULTIPLE_CAMPAIGNS_ENABLED/);
  assert.match(source, /if \(id\) id\.control\.value/);
});
