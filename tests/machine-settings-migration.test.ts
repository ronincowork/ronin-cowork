import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-machine-import-'));
const configuration = path.join(root, 'config');
const campaigns = path.join(root, 'campaigns');
process.env.RONIN_CONFIG_DIR = configuration;
process.env.RONIN_CAMPAIGNS_DIR = campaigns;
process.env.RONIN_SERVICES_SECRETS_DIR = path.join(root, 'credentials');
process.env.RONIN_CATALOGS_DIR = path.join(root, 'catalogs');

await mkdir(configuration, { recursive: true });
await mkdir(campaigns, { recursive: true });
await writeFile(path.join(configuration, 'ronin.json'), JSON.stringify({
  owner: { name: 'Mori' },
  sessions: { max: 7 },
  agents: { sessions: { default: { provider: 'openai', model: 'gpt-test' } } },
  auth: { hash: 'private' },
}));
await writeFile(path.join(campaigns, 'work.json'), JSON.stringify({
  title: 'Work', state: 'active', created_at: '1', config: {},
}));

const { readMachineSettings } = await import('../src/machine-settings.js');

test('an absent machine record imports the previous machine and Campaign stores once', async () => {
  const record = await readMachineSettings();
  assert.equal((record.set.owner as { name: string }).name, 'Mori');
  assert.equal((record.set.sessions as { max: number }).max, 7);
  assert.equal(((record.set.campaigns as Record<string, { title: string }>).work).title, 'Work');

  const stored = JSON.parse(await readFile(path.join(configuration, 'machine_settings.json'), 'utf8'));
  assert.equal(stored.owner.name, 'Mori');
  assert.equal(stored.campaigns.work.title, 'Work');
  assert.equal(stored.auth, undefined);
  const credential = JSON.parse(await readFile(path.join(root, 'credentials', 'auth.json'), 'utf8'));
  assert.equal(credential.hash, 'private');
});
