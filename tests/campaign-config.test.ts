import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-machine-settings-campaigns-'));
process.env.RONIN_CONFIG_DIR = root;
process.env.RONIN_CATALOGS_DIR = path.join(root, 'catalogs');

const {
  archiveCampaign,
  createCampaign,
  initialCampaign,
  isValidCampaignId,
  listCampaigns,
  readCampaign,
  writeCampaign,
} = await import('../src/campaigns.js');

test('campaign ids remain safe stable tokens', () => {
  assert.equal(isValidCampaignId('home_machine'), true);
  for (const id of ['', '../x', 'two words', '.hidden', 'A']) {
    assert.equal(isValidCampaignId(id), false);
  }
});

test('campaigns share the machine configuration document', async () => {
  const created = await createCampaign({
    id: 'alpha',
    title: 'Alpha',
    description: 'First body of work',
    config: { cowork_defaults: { arrangement: 'two' } },
  });
  assert.equal((await readCampaign('alpha'))?.title, 'Alpha');

  await writeCampaign('alpha', { description: 'Current body of work' });
  const edited = await readCampaign('alpha');
  assert.equal(edited?.description, 'Current body of work');
  assert.deepEqual(edited?.config.cowork_defaults, { arrangement: 'two' });
  assert.equal(edited?.created_at, created.created_at);

  const document = JSON.parse(
    await fs.readFile(path.join(root, 'machine_settings.json'), 'utf8'),
  ) as Record<string, unknown>;
  assert.ok((document.campaigns as Record<string, unknown>).alpha);
  assert.deepEqual((await fs.readdir(root)).filter((name) => name.endsWith('.json')), [
    'machine_settings.json',
  ]);
});

test('campaign list order and archive state are deterministic', async () => {
  await createCampaign({ id: 'beta', title: 'Beta' });
  assert.deepEqual((await listCampaigns()).map((campaign) => campaign.id), ['alpha', 'beta']);
  await archiveCampaign('alpha');
  assert.equal((await readCampaign('alpha'))?.state, 'archived');
  assert.equal((await initialCampaign())?.id, 'alpha');
});

test('unknown campaign edits report the missing record', async () => {
  await assert.rejects(() => writeCampaign('missing', { title: 'Missing' }), /does not exist/);
});

test.after(async () => fs.rm(root, { recursive: true, force: true }));
