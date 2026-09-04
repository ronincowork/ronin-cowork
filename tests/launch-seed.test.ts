import test from 'node:test';
import assert from 'node:assert/strict';
import { agentDefaults } from '../src/agent-defaults.js';
import { resolveLaunchSeed } from '../src/launch-seed.js';
import type { CampaignConfig } from '../src/campaigns.js';
import type { RoutineRow } from '../src/resource-adapters.js';
import type { TeamRoster } from '../src/team-rosters.js';

const routine = (name: string): RoutineRow => ({
  name, label: name, blurb: '', origin: 'stock', shadowed: false,
  reading: [], sops: [], macros: [], actions: [], tools: [], mcp: [], parts: [], requires: [],
});
const campaign = {
  id: 'home_machine',
  config: { agent_defaults: agentDefaults({
    provider: 'openai', model: 'gpt', reach: 'plan', recruit: 'propose agents', output: 'open',
    routines: { ronin_base: true, gbrain: true }, behaviours: ['ways:plan'], dial: 'write', launch_mode: 'live_dangerously', gbrain_mode: 'disconnected',
  }) },
} as CampaignConfig;
const team = {
  name: 'alpha', campaign_id: 'home_machine', kind: 'coding', project_root: 'work', branch: 'dev',
  routines: { ronin_base: false }, behaviours: { books: ['ways:cut'], required: false },
  agent_defaults: {
    provider: 'anthropic', model: 'opus', reach: 'execute', recruit: 'nobody', output: 'code', dial: 'read', launch_mode: 'configured', gbrain_mode: 'connected',
  },
} as TeamRoster;
const sources = (roster: TeamRoster | null) => ({
  campaign, roster,
  roots: [{ name: 'home', dir: '/home', archived: false }],
  sessions: { default: { provider: 'anthropic', model: 'sonnet' } },
  routines: [routine('ronin_base'), routine('gbrain')],
  desk: 'own' as const,
});

test('rōnin seed reads Campaign and reports the frozen residue', () => {
  const seed = resolveLaunchSeed(sources(null));
  assert.equal(seed.seeds.model.value, 'gpt');
  assert.equal(seed.seeds.model.stated_by[0]?.layer, 'campaign');
  assert.deepEqual(seed.still_asked, ['session_type', 'name', 'instructions']);
  assert.equal(seed.routines.find((r) => r.name === 'gbrain')?.on, true);
});

test('rōnin seed chooses only from the Campaign-scoped roots supplied by its route', () => {
  const seed = resolveLaunchSeed({
    ...sources(null),
    roots: [{ name: 'home-machine-root', dir: '/home-machine', archived: false, campaign_id: 'home_machine' }],
  });
  assert.equal(seed.seeds.project_root.value, 'home-machine-root');
});

test('Team seed reads its complete map with no live Campaign inherit', () => {
  const seed = resolveLaunchSeed(sources(team));
  assert.equal(seed.seeds.dial.value, 'read');
  assert.equal(seed.seeds.dial.stated_by[0]?.layer, 'team');
  assert.equal(seed.seeds.launch_mode.value, 'configured');
  assert.equal(seed.seeds.launch_mode.stated_by[0]?.layer, 'team');
  assert.equal(seed.seeds.gbrain_mode.value, 'connected');
  assert.equal(seed.seeds.gbrain_mode.stated_by[0]?.layer, 'team');
  assert.equal(seed.routines.find((r) => r.name === 'ronin_base')?.on, false);
  assert.equal(seed.routines.find((r) => r.name === 'gbrain')?.on, false);
});
