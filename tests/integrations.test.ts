/**
 * Integrations, the common way (KAN-337/338/339): the index, the Workspace field, and Connect /
 * Disconnect writing one `.env` per provider per Campaign, mode 0600, for any provider.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(tmpdir(), 'ronin-integrations-'));
process.env.RONIN_USER_ROOT = root;
process.env.RONIN_DATA_ROOT = path.join(root, '.data');
const { listIntegrations, listInstallations } = await import('../src/resource-adapters.js');
const { connectIntegration, disconnectIntegration, integrationsState, IntegrationBadInput } = await import('../src/integrations.js');
const { normalizeWorkspace, saveWorkspace } = await import('../src/workspaces.js');
const parts = { onDisk: ['jira'], loaded: [] };

test('the index holds the integrations; Ronin Services is not one of them', async () => {
  const names = (await listIntegrations()).map((row) => row.name).sort();
  assert.deepEqual(names, ['gbrain', 'jira', 'netlify', 'perplexity']);
  assert.deepEqual((await listInstallations()).map((row) => row.name), ['ronin_services']);
  const jira = (await listIntegrations()).find((row) => row.name === 'jira')!;
  assert.equal(jira.token, 'jira-{campaign}.json');
  assert.equal(jira.bridge, 'jira');
  const netlify = (await listIntegrations()).find((row) => row.name === 'netlify')!;
  assert.equal(netlify.token, 'netlify-{campaign}.env');
  assert.deepEqual(netlify.keys, ['NETLIFY_AUTH_TOKEN']);
});

test('a record an Agent adds in the owner store joins the index', async () => {
  await mkdir(path.join(root, 'catalogs', 'integrations'), { recursive: true });
  await writeFile(path.join(root, 'catalogs', 'integrations', 'supabase.md'), '# Supabase\n- **label:** Supabase\n- **blurb:** A database.\n- **keys:** SUPABASE_ACCESS_TOKEN\n');
  const row = (await listIntegrations()).find((one) => one.name === 'supabase');
  assert.equal(row?.origin, 'user');
  assert.equal(row?.bridge, '');
});

test('a Workspace keeps its integrations, with facts a bridge reads', () => {
  const w = normalizeWorkspace('c1', 'site', { integrations: [{ provider: 'Netlify', site: 'my-site', note: 'the docs' }, 'jira', { provider: 'netlify' }, { nope: 1 }] });
  assert.deepEqual(w.integrations, [{ site: 'my-site', note: 'the docs', provider: 'netlify' }, { provider: 'jira' }]);
  assert.deepEqual(normalizeWorkspace('c1', 'site', {}).integrations, []);
});

test('nothing connected says what is missing; Connect writes the .env 0600; Disconnect removes it', async () => {
  await saveWorkspace({ ...normalizeWorkspace('c1', 'site', {}), integrations: [{ provider: 'netlify', site: 'my-site' }] });
  let netlify = (await integrationsState('c1', parts)).find((row) => row.name === 'netlify')!;
  assert.equal(netlify.connected, false);
  assert.deepEqual(netlify.missing, ['NETLIFY_AUTH_TOKEN']);
  assert.deepEqual(netlify.workspaces, ['site']);

  const file = await connectIntegration('c1', 'netlify', { NETLIFY_AUTH_TOKEN: 'secret-1' });
  assert.equal(file, path.join(root, 'services_secrets', 'netlify-c1.env'));
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  await connectIntegration('c1', 'netlify', { NETLIFY_SITE_ID: 'abc' });
  assert.equal(await readFile(file, 'utf8'), 'NETLIFY_AUTH_TOKEN=secret-1\nNETLIFY_SITE_ID=abc\n');
  netlify = (await integrationsState('c1', parts)).find((row) => row.name === 'netlify')!;
  assert.equal(netlify.connected, true);
  assert.deepEqual(netlify.set, ['NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID']);
  assert.deepEqual(netlify.missing, []);
  assert.ok(!JSON.stringify(netlify).includes('secret-1'), 'a value never comes back');

  await disconnectIntegration('c1', 'netlify');
  await assert.rejects(stat(file));
  await disconnectIntegration('c1', 'netlify'); // gone already is fine
});

test('Connect refuses a malformed key or value, and Jira connects in its own panel', async () => {
  await assert.rejects(connectIntegration('c1', 'perplexity', { 'bad key': 'x' }), IntegrationBadInput);
  await assert.rejects(connectIntegration('c1', 'perplexity', { KEY: 'a\nB=c' }), IntegrationBadInput);
  await assert.rejects(connectIntegration('c1', 'jira', { TOKEN: 'x' }), /own panel/);
  const jira = (await integrationsState('c1', parts)).find((row) => row.name === 'jira')!;
  assert.equal(jira.bridge_state, 'parked');
  assert.equal(jira.token_file, path.join(root, 'services_secrets', 'jira-c1.json'));
});

test('Mika indexes the integrations README, never a record, stock or an Agent\'s', async () => {
  const { compileMikaKnowledgeAt } = await import('../src/mika-knowledge.js');
  const owner = path.join(root, 'catalogs');
  for (let n = 0; n < 40; n++) await writeFile(path.join(owner, 'integrations', `provider${n}.md`), `# P${n}\n- **label:** P${n}\n- **blurb:** ${'x'.repeat(200)}.\n`);
  const built = await compileMikaKnowledgeAt(await mkdtemp(path.join(tmpdir(), 'ronin-mika-')), { ownerRoots: {
    docs: '', 'ronin_catalogs/behaviours': '', ronin_catalogs: owner, ronin_session_boot: '', ronin_library: '',
  } });
  const ids = built.entries.map((row) => row.id).filter((id) => id.includes('/integrations/'));
  assert.deepEqual(ids, ['ronin_catalogs/integrations/README.md']);
});
