import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-machine-home-campaign-'));
const configuration = path.join(root, 'config');
process.env.RONIN_CONFIG_DIR = configuration;
process.env.RONIN_CATALOGS_DIR = path.join(root, 'catalogs');
process.env.RONIN_SERVICES_SECRETS_DIR = path.join(root, 'credentials');

await mkdir(configuration, { recursive: true });
await writeFile(path.join(configuration, 'machine_settings.json'), JSON.stringify({
  campaigns: {
    z_home: {
      title: 'Home campaign',
      description: 'The first campaign',
      desk_profile: 'home',
      created_at: '2026-01-01T00:00:00.000Z',
      config: {},
    },
    a_later: {
      title: 'Alphabetically first',
      description: 'Created later',
      desk_profile: 'professional',
      created_at: '2026-02-01T00:00:00.000Z',
      config: {},
    },
  },
}));

const { readMachineSettings } = await import('../src/machine-settings.js');

test('machine settings reads campaign values from the home campaign', async () => {
  const record = await readMachineSettings();
  assert.equal((record.set.campaign as { name: string }).name, 'Home campaign');
  assert.equal((record.set.desk as { profile: string }).profile, 'home');
});

test.after(async () => {
  const { rm } = await import('node:fs/promises');
  await rm(root, { recursive: true, force: true });
});
