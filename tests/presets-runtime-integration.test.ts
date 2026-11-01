import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

const box = await mkdtemp(path.join(os.tmpdir(), 'ronin-presets-runtime-'));
process.env.RONIN_USER_ROOT = path.join(box, 'ronin');
process.env.RONIN_CATALOGS_DIR = path.join(box, 'ronin', 'catalogs');

const runtime = await import('../src/setup-runtime.js');
const { measureProviders } = await import('../src/provider-summary.js');
const { launchPresetPlan } = await import('../public/js/preset-launch.js');

const available = [{ id: 'codex', label: 'Codex', get: '', parked: '', cmd: 'codex', installed: true, path: '/bin/codex' }];

test('Presets consumes real provider lifecycle and dependency facts', async () => {
  const live = new Set<string>();
  const activated: Array<[string, string]> = [];
  const ops: runtime.ProviderSessionOps = {
    exists: async (name) => live.has(name),
    open: async (_provider, name) => { live.add(name); },
    close: async (name) => { live.delete(name); },
  };
  await runtime.openProviderLogin('codex', ops, available);
  const login = await runtime.setupRuntimeAnswer({}, await measureProviders({}, { availability: available, signedIn: async () => false }), ops, {
    cowork: { release: null, commit: '', dirty: false, startedAt: '' },
    services: { parts: ['gbrain'], loaded: ['gbrain'], parked: [], installed: true, restart_needed: false, activated: true, stage: 'active', switched_on: true },
    routines: [],
  });
  assert.deepEqual(login.providers.find((provider) => provider.id === 'codex')?.attachment, { type: 'session', key: 'provider_setup_codex', team: 'provider_setup', temporary: true });
  assert.deepEqual(login.gbrain, { installed: true, active: true });
  assert.equal(login.services.active, true);
  await runtime.completeProviderLogin('codex', ops, () => '2026-09-05T15:00:00.000Z', async (provider, at) => { activated.push([provider, at]); });
  assert.deepEqual(activated, [['codex', '2026-09-05T15:00:00.000Z']]);
  assert.equal(live.size, 0);
});

test('Morning Brief launch persists and returns a real JIKAN job', async () => {
  const send = async (url: string, options: { json?: Record<string, any> } = {}) => {
    if (url === '/api/templates/teams') return { ok: true, data: [{ name: 'morning_brief', label: 'Morning Brief', objective: 'Brief.', agents: [{ name: 'writer' }] }] };
    if (url.startsWith('/api/workspaces/')) return { ok: true, data: { workspace: options.json } };
    if (url === '/api/team-rosters' || url === '/api/launch') return { ok: true, data: url.endsWith('launch') ? { name: 'writer' } : options.json };
    if (url === '/api/setup/morning-brief/schedules') return { ok: true, data: { schedule: await runtime.createMorningBriefSchedule(options.json || {}) } };
    throw new Error(`unexpected ${url}`);
  };
  const result = await launchPresetPlan({ template: { shelf: 'teams', name: 'morning_brief' }, user_message: 'Prepare it.', inputs: { schedule: 'daily 08:00', delivery: 'team lead', active: true } }, send);
  assert.equal(result.ok, true);
  assert.equal(result.data.schedule.job.to, 'lead');
  assert.equal(result.data.schedule.job.state, 'active');
  const { listJobs } = await import('../src/jikan.js');
  assert.deepEqual((await listJobs(result.data.team)).map((job) => job.id), [result.data.schedule.job.id]);
});

test.after(async () => { await rm(box, { recursive: true, force: true }); });
