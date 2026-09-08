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
const { resolveLaunchDesks } = await import('../src/launch-desks.js');
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

test('Develop Project launch aggregates real managed work-location facts', async () => {
  await runtime.ensureInstalledRoots();
  let sequence = 0;
  let roster: Record<string, any> | null = null;
  const send = async (url: string, options: { json?: Record<string, any> } = {}) => {
    if (url === '/api/templates/teams') return { ok: true, data: [{ name: 'develop_new_project', label: 'Develop', agents: [] }] };
    if (url === '/api/team-rosters') { roster = options.json || null; return { ok: true, data: options.json }; }
    if (url === '/api/launch') {
      const name = `feature_${++sequence}`;
      // The root rides the Team record, as the New Team form sends it; the server reads it from the roster.
      const resolved = await resolveLaunchDesks({ session: name, team: 'develop_project', project_root: options.json?.project_root || roster?.project_root, agent: true, control: true });
      return { ok: true, data: { name, receipt: { project_root: resolved.assignment?.project_root, work_locations: resolved.repositories, desks: resolved.assignment?.desks || [] } } };
    }
    throw new Error(`unexpected ${url}`);
  };
  const result = await launchPresetPlan({ template: { shelf: 'teams', name: 'develop_new_project' }, inputs: { root: 'ronin_project_1', features: ['frontend', 'backend'] } }, send);
  assert.equal(result.ok, true);
  assert.equal(result.data.receipts.length, 2);
  assert.ok(result.data.receipts.every((receipt: any) => receipt.project_root === 'ronin_project_1'));
  assert.ok(result.data.receipts.every((receipt: any) => receipt.work_locations[0]?.mode === 'managed'));
  assert.ok(result.data.receipts.every((receipt: any) => receipt.desks[0]?.line === 'team/develop_project/dev'));
});

test('Morning Brief launch persists and returns a real JIKAN job', async () => {
  const send = async (url: string, options: { json?: Record<string, any> } = {}) => {
    if (url === '/api/templates/teams') return { ok: true, data: [{ name: 'morning_brief', label: 'Morning Brief', objective: 'Brief.', agents: [{ name: 'writer' }] }] };
    if (url === '/api/team-rosters' || url === '/api/launch') return { ok: true, data: url.endsWith('launch') ? { name: 'writer' } : options.json };
    if (url === '/api/setup/morning-brief/schedules') return { ok: true, data: { schedule: await runtime.createMorningBriefSchedule(options.json || {}) } };
    throw new Error(`unexpected ${url}`);
  };
  const result = await launchPresetPlan({ template: { shelf: 'teams', name: 'morning_brief' }, user_message: 'Prepare it.', inputs: { schedule: 'daily 08:00', delivery: 'team lead', active: true } }, send);
  assert.equal(result.ok, true);
  assert.equal(result.data.schedule.job.to, 'lead');
  assert.equal(result.data.schedule.job.state, 'active');
  const stored = await runtime.morningBriefSchedules(result.data.team);
  assert.deepEqual(stored.schedules.map((job) => job.id), [result.data.schedule.job.id]);
});

test.after(async () => { await rm(box, { recursive: true, force: true }); });
