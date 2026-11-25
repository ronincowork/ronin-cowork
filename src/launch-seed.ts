import type { CampaignConfig } from './campaigns.js';
import { sessionsFor, type SessionsDefaults } from './launch-command.js';
import type { StatedBy } from './launch-profile.js';
import type { Workspace } from './workspaces.js';
import { teamRosterFile, type TeamRoster } from './team-rosters.js';

/** What the New Agent form starts from. What the Agent is told is the brief's (src/brief-settings.ts). */
export type SeedField = 'branch' | 'provider' | 'model' | 'reach' | 'recruit' | 'output' | 'launch_mode';
export interface SeedValue<T = unknown> { value: T; stated_by: StatedBy[] }
export interface LaunchSeed {
  campaign_id: string; seeds: Record<SeedField, SeedValue>;
  still_asked: Array<'session_type' | 'name' | 'instructions'>;
}
export interface LaunchSeedSources {
  campaign: CampaignConfig; roster: TeamRoster | null;
  /** The Team's Workspace: its Mode is its Agents'. */
  workspace: Workspace | null;
  sessions: SessionsDefaults | undefined;
  /** A Team lead's launch: the lead pair, when one is set. */
  lead?: boolean;
}
export function shownLaunchSeed(seed: LaunchSeed): LaunchSeed {
  return { ...seed, seeds: { ...seed.seeds } };
}
const installation = (source: string): StatedBy[] => [{ layer: 'installation', source }];
const conditional = (source: string): StatedBy[] => [{ layer: 'conditional', source }];
const campaignBy = (id: string, field: string): StatedBy[] => [{ layer: 'campaign', source: `#/campaign (${id}: ${field})` }];
const teamBy = (roster: TeamRoster): StatedBy[] => [{ layer: 'team', source: teamRosterFile(roster.name, roster.campaign_id) }];

export function resolveLaunchSeed(s: LaunchSeedSources): LaunchSeed {
  const c = s.campaign.config.defaults;
  const t = s.roster;
  const a = t ? { ...c, ...t.agent_defaults } : c;
  const teamSource = t ? teamBy(t) : null;
  const source = (field: string): StatedBy[] => teamSource ?? campaignBy(s.campaign.id, `defaults.${field}`);
  const pair = sessionsFor(s.sessions, !!s.lead).default;
  const pairSource = installation('Models > Defaults');
  return {
    campaign_id: s.campaign.id,
    seeds: {
      branch: { value: t?.branch ?? '', stated_by: conditional(t ? teamRosterFile(t.name, t.campaign_id) : 'branch default') },
      provider: { value: pair?.provider ?? '', stated_by: pairSource }, model: { value: pair?.model ?? '', stated_by: pairSource },
      reach: { value: a.reach, stated_by: source('reach') }, recruit: { value: a.recruit, stated_by: source('recruit') },
      output: { value: a.output, stated_by: source('output') },
      launch_mode: s.workspace
        ? { value: s.workspace.launch_mode, stated_by: [{ layer: 'team', source: `Workspace ${s.workspace.name}` }] }
        : { value: c.launch_mode, stated_by: campaignBy(s.campaign.id, 'defaults.launch_mode') },
    },
    still_asked: ['session_type', 'name', 'instructions'],
  };
}
