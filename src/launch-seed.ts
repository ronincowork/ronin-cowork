import type { CampaignConfig } from './campaigns.js';
import type { BehaviourRow, InstallationRow } from './resource-adapters.js';
import type { SessionsDefaults } from './launch-command.js';
import type { StatedBy } from './launch-profile.js';
import type { ProjectRootInfo } from './project-roots.js';
import { availableBehaviours, resolveContributions, type ResolvedContribution } from './instruction-cascade.js';
import { teamRosterFile, type TeamRoster } from './team-rosters.js';

export type SeedField = 'kind' | 'project_root' | 'branch' | 'provider' | 'model' | 'reach' | 'recruit' | 'output' | 'launch_mode' | 'behaviours';
export interface SeedValue<T = unknown> { value: T; stated_by: StatedBy[] }
export interface LaunchSeed {
  campaign_id: string; seeds: Record<SeedField, SeedValue>;
  behaviours: Array<{ name: string; label: string; blurb: string; reading: string; scope: BehaviourRow['scope']; installation: string; on: boolean; required: boolean; available: boolean; stated_by: StatedBy[] }>;
  available: string[]; still_asked: Array<'session_type' | 'name' | 'instructions'>;
}
export interface LaunchSeedSources {
  campaign: CampaignConfig; roster: TeamRoster | null; roots: ProjectRootInfo[];
  sessions: SessionsDefaults | undefined; installations: InstallationRow[]; behaviours: BehaviourRow[];
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
  const root = t?.project_root || s.roots.find((item) => !item.archived)?.name || '';
  const available = availableBehaviours(s.installations, s.campaign.config.installations, s.behaviours);
  const selectedBehaviours = t ? t.behaviours?.selected ?? [] : campaignBehaviours;
  const required = new Set(teamSettled ? t?.behaviours?.required ?? [] : []);
  const cascade = resolveContributions(
    s.installations, s.campaign.config.installations, s.behaviours, available,
    campaignBehaviours, t ? [...new Set([...selectedBehaviours, ...required])] : undefined,
  );
  const pair = c.provider && c.model ? c : s.sessions?.default;
  const pairSource = c.provider && c.model ? campaignBy(s.campaign.id, 'defaults.provider/model') : installation('Model providers');
  const behaviourSource = t ? teamBy(t) : campaignBy(s.campaign.id, 'defaults.behaviours');
  return {
    campaign_id: s.campaign.id,
    seeds: {
      kind: { value: t?.kind ?? 'open', stated_by: conditional(t ? 'Team membership' : 'teamless Agent') },
      project_root: { value: root, stated_by: conditional(t?.project_root ? teamRosterFile(t.name, t.campaign_id) : 'Workspace Folder') },
      branch: { value: t?.branch ?? '', stated_by: conditional(t ? teamRosterFile(t.name, t.campaign_id) : 'branch default') },
      provider: { value: pair?.provider ?? '', stated_by: pairSource }, model: { value: pair?.model ?? '', stated_by: pairSource },
      reach: { value: a.reach, stated_by: source('reach') }, recruit: { value: a.recruit, stated_by: source('recruit') },
      output: { value: a.output, stated_by: source('output') },
      launch_mode: { value: a.launch_mode, stated_by: source('launch_mode') },
      behaviours: { value: cascade.selected, stated_by: behaviourSource },
    },
    behaviours: s.behaviours.filter((row) => row.scope === 'selected').map((row) => ({ name: row.name, label: row.label, blurb: row.blurb, reading: row.page, scope: row.scope, installation: row.installation, on: cascade.selected.includes(row.name), required: required.has(row.name), available: available.includes(row.name), stated_by: behaviourSource })),
    available, still_asked: ['session_type', 'name', 'instructions'],
    resolved_contributions: cascade.contributions, undelivered: cascade.undelivered,
  };
}
