/**
 * CAMPAIGN_CONFIG — the durable record of one body of work.
 *
 * The build-out's leg-1 gate, as tests: create/read/edit/archive round-trips, ids
 * validate, and there is ONE canonical Campaign writer. What this file guards hardest is
 * the pair of immutables — `id` and `created_at` — because every `campaign_id` on a
 * roster, root, template and live Agent points at the first, and the compatibility window
 * identifies the migrated Campaign by the second.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-campaigns-test-'));
process.env.RONIN_CAMPAIGNS_DIR = temp;
const ROUTINES_OFF = {
  ronin_base: false, ronin_worktrees: false, ronin_services: false, ronin_host: false, gbrain: false,
};

const {
  archiveCampaign,
  campaignIdFrom,
  createCampaign,
  initialCampaign,
  isValidCampaignId,
  listCampaigns,
  populateHomeMachine,
  readCampaign,
  writeCampaign,
} = await import('../src/campaign-config.js');

test('Atarashi writes a complete home_machine Campaign and consumes kind as a preset', async () => {
  const c = await populateHomeMachine({
    title: 'Home machine', description: 'The work on this box.', desk_profile: 'terminal',
    provider: 'openai', model: 'gpt-5.6-terra', kind: 'coding', routine_bundle: 'control',
  });
  assert.equal(c.id, 'home_machine');
  assert.equal(c.title, 'Home machine');
  assert.equal(c.description, 'The work on this box.');
  assert.equal(c.desk_profile, 'terminal');
  assert.deepEqual(c.config.agent_defaults, {
    provider: 'openai', model: 'gpt-5.6-terra',
    reach: 'plan', recruit: 'propose agents', output: ['open'],
    routines: {
      ronin_base: true, ronin_worktrees: true, ronin_services: false,
      ronin_host: false, gbrain: false,
    },
    behaviours: ['sops:github', 'sops:ronin_methodology', 'sops:teams'],
    dial: 'write', launch_mode: 'live_dangerously',
  });
  assert.equal('kind' in c, false, 'the setup intent is consumed and the Campaign stays kindless');
  await fs.unlink(path.join(temp, 'home_machine.json'));
});

test('create → read: the record round-trips, and every field lands as typed', async () => {
  const c = await createCampaign({
    title: 'Ronin',
    description: 'Build and operate Ronin Cowork.',
    desk_profile: 'professional',
  });
  assert.equal(c.id, 'ronin', 'the id is derived from the title');
  assert.equal(c.title, 'Ronin');
  assert.equal(c.description, 'Build and operate Ronin Cowork.');
  assert.equal(c.desk_profile, 'professional');
  assert.equal(c.state, 'active', 'a new Campaign is in play');
  assert.ok(c.created_at, 'created_at is stamped at create');
  assert.deepEqual(c.config, {
    agent_defaults: {
      provider: '', model: '', reach: 'plan', recruit: 'propose agents', output: ['open'],
      routines: ROUTINES_OFF, behaviours: [], dial: 'write', launch_mode: 'live_dangerously',
    },
    cowork_defaults: {}, template_defaults: {},
  });

  assert.deepEqual(await readCampaign('ronin'), c, 'read gives back exactly what create wrote');
});

test('the id is stored as the FILENAME and never in the body — one home for one fact', async () => {
  const raw = JSON.parse(await fs.readFile(path.join(temp, 'ronin.json'), 'utf8')) as Record<string, unknown>;
  assert.equal(raw.id, undefined, 'a body carrying its own id could disagree with its filename');
  assert.equal(raw.title, 'Ronin');
});

test('an id validates, and nothing that could escape the store is one', async () => {
  for (const ok of ['ronin', 'ice-cream', 'health_2', 'a', '0']) {
    assert.equal(isValidCampaignId(ok), true, `${ok} is a usable id`);
  }
  for (const bad of ['', 'Ronin', '-leading', 'has space', '../escape', 'a/b', 'a.b', 'x'.repeat(65)]) {
    assert.equal(isValidCampaignId(bad), false, `${bad} must be refused`);
  }
  assert.equal(await readCampaign('../escape'), null, 'an invalid id is never turned into a path read');
});

test('a title that yields no token falls back to ronin — the plan’s own fallback', () => {
  assert.equal(campaignIdFrom('Ice Cream Vending'), 'ice-cream-vending');
  assert.equal(campaignIdFrom('  Health & Fitness!  '), 'health-fitness');
  assert.equal(campaignIdFrom(''), 'ronin');
  assert.equal(campaignIdFrom('!!!'), 'ronin', 'punctuation alone is not a name');
});

test('edit touches only what it states, and the id does not follow the title', async () => {
  const r = await writeCampaign('ronin', { title: 'Ronin Cowork' });
  assert.equal(r.title, 'Ronin Cowork');
  assert.equal(r.id, 'ronin', 'the id is immutable — every campaign_id pointing at it still resolves');
  assert.equal(r.description, 'Build and operate Ronin Cowork.', 'unstated fields survive');
  assert.equal(r.desk_profile, 'professional');

  const cleared = await writeCampaign('ronin', { description: '' });
  assert.equal(cleared.description, '', 'clearing a field is a blank, not a mark standing for one');
  assert.equal(cleared.title, 'Ronin Cowork');
});

test('created_at survives every edit — it is provenance, not a setting', async () => {
  const before = (await readCampaign('ronin'))!.created_at;
  const after = await writeCampaign('ronin', { title: 'Ronin', description: 'Build and operate Ronin Cowork.' });
  assert.equal(after.created_at, before);
});

test('config merges per sub-bucket, so a caller cannot drop a bucket it never heard of', async () => {
  await writeCampaign('ronin', { config: { agent_defaults: { model: 'x' } } });
  await writeCampaign('ronin', { config: { cowork_defaults: { branch: 'dev' } } });
  const c = (await readCampaign('ronin'))!;
  assert.deepEqual(c.config.agent_defaults, {
    provider: '', model: 'x', reach: 'plan', recruit: 'propose agents', output: ['open'],
    routines: ROUTINES_OFF, behaviours: [], dial: 'write', launch_mode: 'live_dangerously',
  }, 'the first bucket survived the second write as a complete typed record');
  assert.deepEqual(c.config.cowork_defaults, { branch: 'dev' });
  assert.deepEqual(c.config.template_defaults, {});
});

test('a desk profile is applied as a template, then the Campaign owns editable settings', async () => {
  const applied = await writeCampaign('ronin', { desk_profile: 'terminal' });
  assert.equal(applied.desk_profile, 'terminal', 'the template name remains provenance');
  assert.equal(applied.desk.skin, 'mono');
  assert.equal(applied.desk.lexicon, 'terminal_en');
  assert.equal(applied.desk.theme, 'dark');

  const customized = await writeCampaign('ronin', { desk: { theme: 'light', skin: 'stock' } });
  assert.equal(customized.desk_profile, 'terminal', 'customizing does not pretend it is another template');
  assert.equal(customized.desk.theme, 'light');
  assert.equal(customized.desk.skin, 'stock');
  assert.equal(customized.desk.lexicon, 'terminal_en', 'unstated effective settings survive');

  const reapplied = await writeCampaign('ronin', { desk_profile: 'terminal' });
  assert.equal(reapplied.desk.theme, 'dark', 'reapply explicitly overwrites customization');
  assert.equal(reapplied.desk.skin, 'mono');
});

test('a legacy profile reference is copied once into the Campaign record', async () => {
  await fs.writeFile(path.join(temp, 'legacy.json'), JSON.stringify({
    title: 'Legacy', desk_profile: 'professional', state: 'active', created_at: '2020-01-01T00:00:00.000Z',
  }), 'utf8');
  const migrated = (await readCampaign('legacy'))!;
  assert.equal(migrated.desk.skin, 'stock');
  assert.equal(migrated.desk.theme, 'light');
  const raw = JSON.parse(await fs.readFile(path.join(temp, 'legacy.json'), 'utf8'));
  assert.deepEqual(raw.desk, migrated.desk, 'resolved values persist instead of being recomputed by each view');
  await fs.unlink(path.join(temp, 'legacy.json'));
});

test('a pre-Atarashi Campaign receives the stock Routine map once', async () => {
  const file = path.join(temp, 'pre_atarashi.json');
  await fs.writeFile(file, JSON.stringify({
    title: 'Old', created_at: '2020-01-02T00:00:00.000Z',
    config: { agent_defaults: { provider: 'openai' } },
  }));
  const first = await readCampaign('pre_atarashi');
  assert.deepEqual(first?.config.agent_defaults.routines, { ronin_base: true, ronin_worktrees: true });
  const stored = JSON.parse(await fs.readFile(file, 'utf8'));
  stored.config.agent_defaults.routines.future_routine = false;
  await fs.writeFile(file, JSON.stringify(stored));
  const second = await readCampaign('pre_atarashi');
  assert.deepEqual(second?.config.agent_defaults.routines, {
    ronin_base: true, ronin_worktrees: true, future_routine: false,
  }, 'an existing map is not recomputed or reached down into');
  await fs.unlink(file);
});

test('creating over an existing Campaign is refused — editing is a different intent', async () => {
  await assert.rejects(() => createCampaign({ id: 'ronin', title: 'Other' }), /already exists/);
});

test('a second Campaign is legal — the selector must be able to prove one/many/all', async () => {
  await createCampaign({ id: 'health', title: 'Health', desk_profile: 'home' });
  await createCampaign({ id: 'ice-cream', title: 'Ice Cream', desk_profile: 'league' });
  assert.equal((await listCampaigns()).length, 3, 'nothing blocks a second or third Campaign');
});

test('list order is created_at, then id to break a tie — and it is not filesystem order', async () => {
  // Written by hand with known stamps: created_at at real speed can tie inside one
  // millisecond, and an order that depends on how fast the box is is not an order. `zebra`
  // is oldest and `apple` newest, so any answer that looks alphabetical or looks like
  // readdir order is the bug this test exists to catch.
  const stamp = async (id: string, created_at: string) =>
    fs.writeFile(path.join(temp, `${id}.json`),
      JSON.stringify({ title: id, description: '', desk_profile: '', state: 'active', created_at }), 'utf8');
  await stamp('zebra', '2020-01-01T00:00:00.000Z');
  await stamp('apple', '2020-01-03T00:00:00.000Z');
  // Two in the SAME millisecond — the tie-break is the id, and it is the only thing left.
  await stamp('mango', '2020-01-02T00:00:00.000Z');
  await stamp('banana', '2020-01-02T00:00:00.000Z');

  const ordered = (await listCampaigns()).map((c) => c.id);
  assert.deepEqual(
    ordered.filter((id) => ['zebra', 'apple', 'mango', 'banana'].includes(id)),
    ['zebra', 'banana', 'mango', 'apple'],
    'oldest first; banana before mango on the same stamp',
  );
  for (const id of ['zebra', 'apple', 'mango', 'banana']) await fs.unlink(path.join(temp, `${id}.json`));
});

test('archive hides by default and kills nothing; un-archiving is the same door', async () => {
  const a = await archiveCampaign('health');
  assert.equal(a.state, 'archived');
  assert.equal(a.title, 'Health', 'archiving changed one field and nothing else');

  const active = (await listCampaigns()).filter((c) => c.state === 'active').map((c) => c.id);
  assert.equal(active.includes('health'), false, 'hidden from the ordinary list');
  assert.equal((await listCampaigns()).map((c) => c.id).includes('health'), true, 'still a record');

  const back = await writeCampaign('health', { state: 'active' });
  assert.equal(back.state, 'active', 'reversible');
  await archiveCampaign('health');
});

test('the initial Campaign is the earliest, ARCHIVED ONES INCLUDED', async () => {
  // The lead's ruling, 2026-08-29: earliest created_at identifies the Campaign the
  // migration seeded even if the owner later archives it — it is provenance, and it must
  // not become a second mutable "default Campaign" that archiving could move.
  assert.equal((await initialCampaign())!.id, 'ronin');
  await archiveCampaign('ronin');
  assert.equal((await initialCampaign())!.id, 'ronin', 'archiving the initial Campaign does not move it');
  assert.equal((await initialCampaign())!.state, 'archived');
  await writeCampaign('ronin', { state: 'active' });
});

test('editing or archiving a Campaign that does not exist is refused, not invented', async () => {
  await assert.rejects(() => writeCampaign('nope', { title: 'x' }), /does not exist/);
  await assert.rejects(() => archiveCampaign('nope'), /does not exist/);
  assert.equal(await readCampaign('nope'), null);
});

test('a half-written record degrades to a readable Campaign instead of taking a surface down', async () => {
  await fs.writeFile(path.join(temp, 'broken.json'), '{ not json', 'utf8');
  assert.equal(await readCampaign('broken'), null, 'unparseable is null, never a throw');
  assert.equal((await listCampaigns()).some((c) => c.id === 'broken'), false, 'and it is skipped in the list');

  await fs.writeFile(path.join(temp, 'thin.json'), JSON.stringify({ state: 'nonsense', config: [] }), 'utf8');
  const thin = (await readCampaign('thin'))!;
  assert.equal(thin.title, 'thin', 'a missing title falls back to the id');
  assert.equal(thin.state, 'active', 'an unknown state is not archived');
  assert.deepEqual(thin.config, {
    agent_defaults: {
      provider: '', model: '', reach: 'plan', recruit: 'propose agents', output: ['open'],
      routines: { ronin_base: true, ronin_worktrees: true }, behaviours: [], dial: 'write', launch_mode: 'live_dangerously',
    },
    cowork_defaults: {}, template_defaults: {},
  }, 'an array is not a bucket and receives the typed stock defaults');
  await fs.unlink(path.join(temp, 'thin.json'));
  await fs.unlink(path.join(temp, 'broken.json'));
});
