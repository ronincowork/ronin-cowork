import type { CampaignConfig } from './campaigns.js';
import type { RoutineRow } from './resource-adapters.js';
import type { SessionsDefaults } from './launch-command.js';
import type { StatedBy } from './launch-profile.js';
import type { ProjectRootInfo } from './project-roots.js';
import { resolveRoutines, routineChoices, type ResolvedRoutine } from './routines.js';
import { teamRosterFile, type TeamRoster } from './team-rosters.js';

export type SeedField =
  | 'kind' | 'project_root' | 'branch' | 'provider' | 'model'
  | 'reach' | 'recruit' | 'output' | 'dial' | 'launch_mode' | 'gbrain_mode' | 'desk' | 'behaviours';

export interface SeedValue<T = unknown> { value: T; stated_by: StatedBy[] }
export interface LaunchSeed {
  campaign_id: string;
  seeds: Record<SeedField, SeedValue>;
  routines: Array<{ name: string; on: boolean; stated_by: StatedBy[] }>;
  still_asked: Array<'session_type' | 'name' | 'instructions'>;
}

export interface LaunchSeedSources {
  campaign: CampaignConfig;
  roster: TeamRoster | null;
  roots: ProjectRootInfo[];
  sessions: SessionsDefaults | undefined;
  routines: RoutineRow[];
  desk: 'own' | 'none';
}

const install = (source: string): StatedBy[] => [{ layer: 'install', source }];
const campaignBy = (id: string, field: string): StatedBy[] =>
  [{ layer: 'campaign', source: `#/campaign (${id}: ${field})` }];
const teamBy = (roster: TeamRoster): StatedBy[] =>
  [{ layer: 'team', source: teamRosterFile(roster.name, roster.campaign_id) }];

/** The one parent resolver used by both launch and GET /api/launch-seed. */
export function resolveLaunchSeed(s: LaunchSeedSources): LaunchSeed & { resolved_routines: ResolvedRoutine[] } {
  const c = s.campaign.config.agent_defaults;
  const t = s.roster;
  const a = t ? { ...c, ...t.agent_defaults } : c;
  const teamSource = t ? teamBy(t) : null;
  const source = (field: string): StatedBy[] => teamSource ?? campaignBy(s.campaign.id, `agent_defaults.${field}`);
  const root = t?.project_root || s.roots.find((item) => !item.archived)?.name || '';
  const resolvedRoutines = resolveRoutines(
    s.routines,
    routineChoices(c.routines),
    t ? routineChoices(t.routines) : undefined,
  );
  const pair = c.provider && c.model ? c : s.sessions?.default;
  const pairSource = c.provider && c.model
    ? campaignBy(s.campaign.id, 'agent_defaults.provider/model')
    : install('⚙ Configuration (agents.sessions.default)');
  const seeds: Record<SeedField, SeedValue> = {
    kind: { value: t?.kind ?? 'open', stated_by: teamSource ?? install('team kind default') },
    project_root: { value: root, stated_by: t?.project_root ? teamSource! : install('PROJECT_ROOTS.md') },
    branch: { value: t?.branch ?? '', stated_by: teamSource ?? install('branch default') },
    provider: { value: pair?.provider ?? '', stated_by: pairSource },
    model: { value: pair?.model ?? '', stated_by: pairSource },
    reach: { value: a.reach, stated_by: source('reach') },
    recruit: { value: a.recruit, stated_by: source('recruit') },
    output: { value: a.output, stated_by: source('output') },
    dial: { value: a.dial, stated_by: source('dial') },
    launch_mode: { value: a.launch_mode, stated_by: source('launch_mode') },
    gbrain_mode: { value: a.gbrain_mode, stated_by: source('gbrain_mode') },
    desk: { value: s.desk, stated_by: install('⚙ Configuration (desks.new_project)') },
    behaviours: {
      value: t ? t.behaviours.books : c.behaviours,
      stated_by: teamSource ?? campaignBy(s.campaign.id, 'agent_defaults.behaviours'),
    },
  };
  return {
    campaign_id: s.campaign.id,
    seeds,
    routines: resolvedRoutines.map((routine) => ({
      name: routine.name,
      on: routine.enabled,
      stated_by: routine.stated_by === 'team' && t
        ? teamBy(t)
        : routine.stated_by === 'campaign'
          ? campaignBy(s.campaign.id, `agent_defaults.routines.${routine.name}`)
          : install(`routine dependency: ${routine.required_by.join(', ') || 'off'}`),
    })),
    still_asked: ['session_type', 'name', 'instructions'],
    resolved_routines: resolvedRoutines,
  };
}
