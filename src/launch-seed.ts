import type { CampaignConfig } from './campaigns.js';
import type { BehaviourRow, InstallationRow } from './resource-adapters.js';
import { sessionsFor, type SessionsDefaults } from './launch-command.js';
import type { StatedBy } from './launch-profile.js';
import type { Workspace } from './workspaces.js';
import { availableBehaviours, resolveContributions, type ResolvedContribution } from './instruction-cascade.js';
import { teamRosterFile, type TeamRoster } from './team-rosters.js';

export type SeedField = 'kind' | 'branch' | 'provider' | 'model' | 'reach' | 'recruit' | 'output' | 'launch_mode' | 'behaviours';
export interface SeedValue<T = unknown> { value: T; stated_by: StatedBy[] }
export interface LaunchSeed {
  campaign_id: string; seeds: Record<SeedField, SeedValue>;
  behaviours: Array<{ name: string; label: string; blurb: string; reading: string; scope: BehaviourRow['scope']; requires: string[]; installation: string; on: boolean; required: boolean; available: boolean; stated_by: StatedBy[] }>;
  available: string[]; still_asked: Array<'session_type' | 'name' | 'instructions'>;
}
export interface LaunchSeedSources {
  campaign: CampaignConfig; roster: TeamRoster | null;
  /** The Team's Workspace: its Mode is its Agents'. */
  workspace: Workspace | null;
  sessions: SessionsDefaults | undefined; installations: InstallationRow[]; behaviours: BehaviourRow[];
  /** A Team lead's launch: the lead pair, when one is set. */
  lead?: boolean;
}
export function shownLaunchSeed(seed: LaunchSeed): LaunchSeed {
  const { ...seeds } = seed.seeds;
  return { ...seed, seeds };
}
const installation = (source: string): StatedBy[] => [{ layer: 'installation', source }];
const conditional = (source: string): StatedBy[] => [{ layer: 'conditional', source }];
const campaignBy = (id: string, field: string): StatedBy[] => [{ layer: 'campaign', source: `#/campaign (${id}: ${field})` }];
const teamBy = (roster: TeamRoster): StatedBy[] => [{ layer: 'team', source: teamRosterFile(roster.name, roster.campaign_id) }];

export function resolveLaunchSeed(s: LaunchSeedSources): LaunchSeed & { resolved_contributions: ResolvedContribution[]; undelivered: string[] } {
  const c = s.campaign.config.defaults;
  const t = s.roster;
  const teamSettled = !!t && Object.prototype.hasOwnProperty.call(t, 'behaviours');
  const campaignBehaviours = c.behaviours;
  const a = t ? { ...c, ...t.agent_defaults } : c;
  const teamSource = t ? teamBy(t) : null;
  const source = (field: string): StatedBy[] => teamSource ?? campaignBy(s.campaign.id, `defaults.${field}`);
  const available = availableBehaviours(s.installations, s.campaign.config.installations, s.behaviours);
  const selectedBehaviours = t ? t.behaviours?.selected ?? [] : campaignBehaviours;
  const required = new Set(teamSettled ? t?.behaviours?.required ?? [] : []);
  const cascade = resolveContributions(
    s.installations, s.campaign.config.installations, s.behaviours, available,
    campaignBehaviours, t ? [...new Set([...selectedBehaviours, ...required])] : undefined,
  );
  const pair = sessionsFor(s.sessions, !!s.lead).default;
  const pairSource = installation('Models > Defaults');
  const behaviourSource = t ? teamBy(t) : campaignBy(s.campaign.id, 'defaults.behaviours');
  return {
    campaign_id: s.campaign.id,
    seeds: {
      kind: { value: t?.kind ?? 'open', stated_by: conditional(t ? 'Team membership' : 'teamless Agent') },
      branch: { value: t?.branch ?? '', stated_by: conditional(t ? teamRosterFile(t.name, t.campaign_id) : 'branch default') },
      provider: { value: pair?.provider ?? '', stated_by: pairSource }, model: { value: pair?.model ?? '', stated_by: pairSource },
      reach: { value: a.reach, stated_by: source('reach') }, recruit: { value: a.recruit, stated_by: source('recruit') },
      output: { value: a.output, stated_by: source('output') },
      launch_mode: s.workspace
        ? { value: s.workspace.launch_mode, stated_by: [{ layer: 'team', source: `Workspace ${s.workspace.name}` }] }
        : { value: c.launch_mode, stated_by: campaignBy(s.campaign.id, 'defaults.launch_mode') },
      behaviours: { value: cascade.selected, stated_by: behaviourSource },
    },
    // The launch UI reads the complete resolved library from this one projection. Only
    // selected rows can be chosen; floor and conditional rows remain visible guidance.
    behaviours: s.behaviours.map((row) => ({ name: row.name, label: row.label, blurb: row.blurb, reading: row.page, scope: row.scope, requires: row.requires, installation: row.installation, on: cascade.selected.includes(row.name), required: required.has(row.name), available: row.scope === 'selected' && available.includes(row.name), stated_by: behaviourSource })),
    available, still_asked: ['session_type', 'name', 'instructions'],
    resolved_contributions: cascade.contributions, undelivered: cascade.undelivered,
  };
}
