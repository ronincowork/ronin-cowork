/**
 * THE WATERFALL (owner, 25 Nov): Campaign → Workspace → Team → Agent, one rule for every setting.
 * A Workspace, Team or Agent copies its parent's settings as they are at the moment it is made.
 * After that it changes only on its own Configuration, never because a parent changed. The
 * parent is the nearest level above: an Agent's is its Team, else its Workspace, else the
 * Campaign; a Team's is its Workspace, else the Campaign. Model defaults are the Campaign's
 * (Models > Defaults). docs/architecture/brief.md, Layers and brief settings.
 */
import { teamAgentDefaults, type LaunchMode, type TeamAgentDefaults } from './agent-defaults.js';
import type { BriefSettings } from './brief-record.js';
import { briefSettings } from './brief-settings.js';
import { readCampaign } from './campaigns.js';
import { readAgentsSection } from './machine-state.js';

export interface ModelPair { provider: string; model: string }
/** The model a new Agent gets, and the one a new Team lead gets. */
export interface Models { default: ModelPair; lead: ModelPair }
export type Level = 'campaign' | 'workspace' | 'team';
/** What every level holds and hands down. */
export interface LevelSettings {
  brief: BriefSettings;
  integrations: string[];
  pm?: boolean;
  agent_defaults: TeamAgentDefaults;
  launch_mode: LaunchMode;
  models: Models;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, 120) : '');
const pair = (v: unknown): ModelPair => {
  const r = v && typeof v === 'object' ? v as Record<string, unknown> : {};
  return { provider: text(r.provider), model: text(r.model) };
};
export const modelsOf = (v: unknown): Models => {
  const r = v && typeof v === 'object' ? v as Record<string, unknown> : {};
  return { default: pair(r.default), lead: pair(r.lead) };
};
export const launchModeOf = (v: unknown): LaunchMode => (v === 'configured' ? 'configured' : 'live_dangerously');

/** A level's own settings, from its record. A Workspace's integrations are rows; their providers are the names. */
export function settingsOf(record: {
  brief: BriefSettings; integrations: Array<string | { provider: string }>; pm?: boolean;
  agent_defaults: TeamAgentDefaults; launch_mode: LaunchMode; models: Models;
}): LevelSettings {
  return {
    brief: structuredClone(record.brief),
    integrations: record.integrations.map((row) => (typeof row === 'string' ? row : row.provider)),
    ...(typeof record.pm === 'boolean' ? { pm: record.pm } : {}),
    agent_defaults: structuredClone(record.agent_defaults),
    launch_mode: record.launch_mode,
    models: structuredClone(record.models),
  };
}

/** The Campaign's settings: its record, Jira when its Jira part is on, and Models > Defaults. */
async function campaignSettings(campaignId: string): Promise<LevelSettings> {
  const campaign = campaignId ? await readCampaign(campaignId) : null;
  const c = campaign?.config;
  const models = modelsOf((await readAgentsSection()).sessions);
  return {
    brief: briefSettings(c?.brief),
    integrations: [...new Set([...(c?.integrations ?? []), ...(c?.services.parts.jira === true ? ['jira'] : [])])],
    ...(typeof c?.pm === 'boolean' ? { pm: c.pm } : {}),
    agent_defaults: teamAgentDefaults(c?.defaults),
    launch_mode: launchModeOf(c?.defaults.launch_mode),
    models,
  };
}

/** The parent of a level about to be made: the nearest of its Team, its Workspace and its Campaign. */
export async function parentSettings(campaignId: string, under: { workspace?: Parameters<typeof settingsOf>[0] | null; team?: Parameters<typeof settingsOf>[0] | null } = {}): Promise<{ level: Level; settings: LevelSettings }> {
  if (under.team) return { level: 'team', settings: settingsOf(under.team) };
  if (under.workspace) return { level: 'workspace', settings: settingsOf(under.workspace) };
  return { level: 'campaign', settings: await campaignSettings(campaignId) };
}
