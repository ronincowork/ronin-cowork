import test from 'node:test';
import assert from 'node:assert/strict';
import { agentDefaults } from '../src/agent-defaults.js';
import { resolveLaunchSeed } from '../src/launch-seed.js';
import type { CampaignConfig } from '../src/campaign-config.js';
import type { RoutineRow } from '../src/definitions.js';
import type { TeamRoster } from '../src/team-rosters.js';

const routine = (name: string): RoutineRow => ({
  name, label: name, blurb: '', origin: 'stock', shadowed: false, class: 'base',
  reading: [], sops: [], macros: [], actions: [], tools: [], mcp: [], requires: [],
});
const campaign = {
  id: 'home_machine',
  config: { agent_defaults: agentDefaults({
    provider: 'openai', model: 'gpt', reach: 'plan', recruit: 'propose agents', output: 'open',
    routines: { ronin_base: true, ronin_host: true }, behaviours: ['ways:plan'], dial: 'write', permissions: 'default',
  }) },
} as CampaignConfig;
const team = {
  name: 'alpha', campaign_id: 'home_machine', kind: 'coding', project_root: 'work', branch: 'dev',
  routines: { ronin_base: false }, behaviours: { books: ['ways:cut'], required: false },
  agent_defaults: {
    provider: 'anthropic', model: 'opus', reach: 'execute', recruit: 'nobody', output: 'code', dial: 'read', permissions: 'strict',
  },
} as TeamRoster;
const sources = (roster: TeamRoster | null) => ({
  campaign, roster,
  roots: [{ name: 'home', dir: '/home', archived: false }],
  sessions: { default: { provider: 'anthropic', model: 'sonnet' } },
  routines: [routine('ronin_base'), routine('ronin_host')],
  desk: 'own' as const,
});

test('rōnin seed reads Campaign and reports the frozen residue', () => {
  const seed = resolveLaunchSeed(sources(null));
  assert.equal(seed.seeds.model.value, 'gpt');
  assert.equal(seed.seeds.model.stated_by[0]?.layer, 'campaign');
  assert.deepEqual(seed.still_asked, ['session_type', 'name', 'instructions']);
  assert.equal(seed.routines.find((r) => r.name === 'ronin_host')?.on, true);
});

test('Team seed reads its complete map with no live Campaign inherit', () => {
  const seed = resolveLaunchSeed(sources(team));
  assert.equal(seed.seeds.dial.value, 'read');
  assert.equal(seed.seeds.dial.stated_by[0]?.layer, 'team');
  assert.equal(seed.routines.find((r) => r.name === 'ronin_base')?.on, false);
  assert.equal(seed.routines.find((r) => r.name === 'ronin_host')?.on, false);
});
