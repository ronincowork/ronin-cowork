import type { StatedBy } from './launch-profile.js';
import type { Level, LevelSettings } from './waterfall.js';
import { teamRosterFile, type TeamRoster } from './team-rosters.js';

/** What the New Agent form starts from. What the Agent is told is the brief's (src/brief-settings.ts). */
export type SeedField = 'branch' | 'provider' | 'model' | 'reach' | 'recruit' | 'output' | 'launch_mode';
export interface SeedValue<T = unknown> { value: T; stated_by: StatedBy[] }
export interface LaunchSeed {
  campaign_id: string; seeds: Record<SeedField, SeedValue>;
  still_asked: Array<'session_type' | 'name' | 'instructions'>;
}
export interface LaunchSeedSources {
  campaign_id: string;
  /** The Agent's parent, the nearest of its Team, Workspace and Campaign, and its name (src/waterfall.ts). */
  parent: { level: Level; name: string; settings: LevelSettings };
  roster: TeamRoster | null;
  /** A Team lead's launch: the lead model, when the parent has one. */
  lead?: boolean;
}
export function shownLaunchSeed(seed: LaunchSeed): LaunchSeed {
  return { ...seed, seeds: { ...seed.seeds } };
}
const conditional = (source: string): StatedBy[] => [{ layer: 'conditional', source }];

/** A NEW AGENT COPIES ITS PARENT (src/waterfall.ts): what to do, recruit and produce, Mode and the model. */
export function resolveLaunchSeed(s: LaunchSeedSources): LaunchSeed {
  const { agent_defaults: a, launch_mode, models } = s.parent.settings;
  const from: StatedBy[] = [{ layer: s.parent.level, source: s.parent.name }];
  const pair = s.lead && models.lead.provider ? models.lead : models.default;
  const t = s.roster;
  return {
    campaign_id: s.campaign_id,
    seeds: {
      branch: { value: t?.branch ?? '', stated_by: conditional(t ? teamRosterFile(t.name, t.campaign_id) : 'branch default') },
      provider: { value: pair.provider, stated_by: from }, model: { value: pair.model, stated_by: from },
      reach: { value: a.reach, stated_by: from }, recruit: { value: a.recruit, stated_by: from },
      output: { value: a.output, stated_by: from },
      launch_mode: { value: launch_mode, stated_by: from },
    },
    still_asked: ['session_type', 'name', 'instructions'],
  };
}
