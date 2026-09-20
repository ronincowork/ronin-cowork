import test from 'node:test';
import assert from 'node:assert/strict';
import { agentDefaults } from '../src/agent-defaults.js';
import { resolveLaunchSeed, shownLaunchSeed } from '../src/launch-seed.js';
import type { CampaignConfig } from '../src/campaigns.js';
import type { BehaviourRow, InstallationRow } from '../src/resource-adapters.js';
import type { TeamRoster } from '../src/team-rosters.js';

const contribution = { label: '', blurb: '', origin: 'stock', shadowed: false, reading: [], reading_off: [], tools: [], parts: [] } as const;
const installations: InstallationRow[] = [
  { ...contribution, name: 'ronin_services', effect: 'system', provides: [], requires: [], reading_off: ['routine/ronin_services/OFF.md'] },
  { ...contribution, name: 'gbrain', effect: 'provider', provides: ['gbrain'], requires: [] },
];
const behaviours: BehaviourRow[] = [
  { ...contribution, name: 'gbrain', installation: 'gbrain', page: '/gbrain.md', scope: 'selected', requires: [] },
  { ...contribution, name: 'write_it_down', installation: '', page: '/write_it_down.md', scope: 'selected', requires: [] },
  { ...contribution, name: 'mandates', installation: '', page: '/mandates.md', scope: 'floor', requires: [] },
];
const campaign = { id: 'home_machine', config: {
  installations: { ronin_services: false, gbrain: true },
  defaults: agentDefaults({ provider: 'openai', model: 'gpt', behaviours: ['gbrain', 'mandates'] }),
  cowork_defaults: {}, template_defaults: {},
} } as CampaignConfig;
const team = { name: 'alpha', campaign_id: 'home_machine', kind: 'coding', project_root: 'work', branch: 'dev',
  behaviours: { selected: ['write_it_down', 'mandates'], required: ['mandates'] },
  agent_defaults: { provider: 'anthropic', model: 'opus', reach: 'execute', recruit: 'nobody', output: ['code'], launch_mode: 'configured' },
} as TeamRoster;
const sources = (roster: TeamRoster | null) => ({ campaign, roster, roots: [{ name: 'home', dir: '/home', archived: false }],
  sessions: { default: { provider: 'anthropic', model: 'sonnet' } }, installations, behaviours });

test('teamless seed exposes available behaviours and the fixed residue', () => {
  const seed = resolveLaunchSeed(sources(null));
  assert.deepEqual(seed.available, ['gbrain', 'write_it_down']);
  assert.deepEqual(seed.seeds.behaviours.value, ['gbrain']);
  assert.equal(seed.behaviours.find((row) => row.name === 'gbrain')?.reading, '/gbrain.md');
  assert.equal(seed.resolved_contributions.find((row) => row.name === 'ronin_services')?.reading[0], 'routine/ronin_services/OFF.md');
  assert.equal(seed.resolved_contributions[0]?.stated_by, 'installation');
  assert.deepEqual(seed.still_asked, ['session_type', 'name', 'instructions']);
});

test('Team complete elective lists replace Campaign defaults while floor guidance remains visible', () => {
  const seed = resolveLaunchSeed(sources(team));
  assert.deepEqual(seed.seeds.behaviours.value, ['write_it_down']);
  assert.equal(seed.seeds.behaviours.stated_by[0]?.layer, 'team');
  assert.equal(seed.seeds.project_root.stated_by[0]?.layer, 'conditional');
  const mandates = seed.behaviours.find((row) => row.name === 'mandates');
  assert.equal(mandates?.scope, 'floor');
  assert.equal(mandates?.on, false, 'floor guidance is visible but never part of the Team elective list');
});

test('an unavailable requested behaviour is reported, never refused', () => {
  const off = { ...campaign, config: { ...campaign.config, installations: { ronin_services: false, gbrain: false } } };
  const seed = resolveLaunchSeed({ ...sources(null), campaign: off });
  assert.deepEqual(seed.available, ['write_it_down']);
  assert.deepEqual(seed.undelivered, ['gbrain']);
});

test('unsettled Campaign and Team inputs seed no elective behaviours', () => {
  const oldCampaign = { ...campaign, config: {
    defaults: agentDefaults({ behaviours: [] }), cowork_defaults: {}, template_defaults: {},
  } } as CampaignConfig;
  const oldTeam = { ...team } as unknown as TeamRoster;
  delete (oldTeam as unknown as Record<string, unknown>).behaviours;
  const seed = resolveLaunchSeed({ ...sources(oldTeam), campaign: oldCampaign });
  assert.deepEqual(seed.seeds.behaviours.value, []);
});
