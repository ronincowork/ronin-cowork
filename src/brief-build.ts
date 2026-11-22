/**
 * BUILDING A BRIEF (docs/architecture/brief.md, The work record is the source of truth; Layers and brief settings; The brief).
 *
 * One invariant. The New Agent path (`composeBrief`) resolves every input once — user, machine,
 * Campaign, Workspace, Team, Agent — into the complete brief document, which Ronin writes on the
 * work record as its `brief` key. `buildBrief` is a pure function of that document and the
 * catalogs: birth, the New Agent preview and the Configuration all render through it. The
 * Configuration edits the document (src/agent-configuration.ts) and calls the same builder.
 * Nothing else is an input: no machine setting, default, receipt, snapshot or other work-record key.
 */
import type { BriefRecord, BriefSettings, SessionType } from './brief-record.js';
import { cascade, LAYERS, layerOf, readUserLayer, resolveBrief, type Cascade, type Layer, type Resolved } from './brief-settings.js';
import { renderBrief } from './brief.js';
import { catalogIntegrations, readCatalogs, type Catalog } from './catalog.js';
import type { CampaignSettings } from './campaigns.js';
import { availableTo, readMcpRecords, type McpRecord } from './mcp-records.js';
import { isHostedOffice, officePeople } from './office-people.js';
import { listTeamRosters } from './team-rosters.js';
import { briefFacts } from './facts.js';
import type { LaunchFacts, SpawnForm } from './spawn.js';
import { mandate } from './agent-defaults.js';
import { listDeskRecords } from './desks/registry.js';
import type { WorkRecordBrief } from './tegami.js';

/** The Agent's own layer, as a launch body or a Configuration carries it. */
export interface AgentBrief { brief: BriefSettings; integrations: string[]; pm?: boolean }

/** The MCP server and web API records available to a Campaign: its pickers list them, and a
 * layer's integrations switch turns one on (KAN-607). A record named as a curated bridge is that
 * bridge's way through the broker, not a record of its own. */
export async function availableRecords(campaign: string, catalog?: Pick<Catalog, 'behaviours'>): Promise<McpRecord[]> {
  const bridges = new Set(catalogIntegrations(catalog ?? await readCatalogs()).map((row) => row.name));
  return (await readMcpRecords()).filter((record) => !bridges.has(record.name) && availableTo(record, campaign));
}

/** The Campaign's layer: its own settings, and Jira when its Jira part is on. Jira is an
 * integration set at the Campaign and Workspace only; it never decides project management, which
 * is its own setting, on at the Campaign by default (KAN-608). The switch, not the live pairing.
 * A record available to the Campaign is not on here unless the Campaign's own integrations name it. */
export async function campaignLayer(campaign: { id: string; config: Pick<CampaignSettings, 'integrations'> & { services?: { parts?: Record<string, unknown> } } } | null | undefined): Promise<Layer> {
  if (!campaign) return layerOf('campaign', {});
  const jira = campaign.config.services?.parts?.jira === true ? ['jira'] : [];
  return layerOf('campaign', { ...campaign.config, integrations: [...campaign.config.integrations, ...jira] });
}

/** The layers widest first: user, Campaign, Workspace, Team, Agent. */
export async function briefLayers(facts: Pick<LaunchFacts, 'campaign' | 'workspace' | 'roster'>, agent: AgentBrief): Promise<Layer[]> {
  return [
    await readUserLayer(),
    await campaignLayer(facts.campaign),
    layerOf('workspace', facts.workspace ?? {}),
    layerOf('team', facts.roster ?? {}),
    layerOf('agent', agent),
  ];
}

const sessionType = (form: SpawnForm): SessionType =>
  form.house_seat === 'mika' ? 'mika' : form.session_type === 'bare_metal_agent' ? 'bare' : 'cowork';

export type LaunchIdentity = { provider?: string; model?: string; harness?: string; launch_mode?: BriefRecord['agent']['launch_mode'] };

/** Birth only: every value the brief depends on, read where it lives (docs/architecture/brief.md,
 * The work record is the source of truth). Integrations, pm, the MCP servers and web APIs on and a lead's
 * Team integrations are left for `buildBrief`, which works them out from the layers. */
async function birthRecord(form: SpawnForm, facts: LaunchFacts, launch: LaunchIdentity, catalog: Pick<Catalog, 'behaviours'>): Promise<BriefRecord> {
  const held = mandate(form.mandate ?? {
    reach: facts.parentSeed?.seeds.reach.value,
    recruit: facts.parentSeed?.seeds.recruit.value,
    output: facts.parentSeed?.seeds.output.value,
  });
  const role = form.role ?? (form.team_lead ? 'lead' : 'coworker');
  const campaignId = facts.campaign?.id ?? '';
  const newOwner = !(await listTeamRosters()).some((roster) => roster.campaign_id === campaignId && roster.state !== 'archived');
  const person = form.person;
  return {
    session: {
      name: facts.name,
      title: '',
      type: sessionType(form),
      template: form.template ?? '',
      task: form.prompt?.trim() ?? '',
    },
    user: {
      name: person?.name ?? '',
      email: person?.email ?? '',
      first_name: person?.first_name ?? '',
      last_name: person?.last_name ?? '',
      nickname: person?.nickname ?? '',
      role: person ? person.role ?? '' : 'owner',
      organization: person?.organization ?? '',
      job_title: person?.job_title ?? '',
      time_zone: person?.time_zone ?? '',
      language: person?.language ?? '',
      planned_use: person?.planned_use ?? [],
      planned_use_other: person?.planned_use_other ?? '',
      technical_level: person?.technical_level ?? '',
      ai_experience: person?.ai_experience ?? '',
      about: person?.about ?? '',
      new_owner: newOwner,
      account: '',
    },
    people: officePeople().map((p) => ({ ...p, role: p.role ?? '' })),
    office: await briefFacts(),
    setting: {
      hosted: isHostedOffice(),
      campaign: campaignId,
      workspace: facts.workspace?.name ?? '',
      instructions: facts.workspace?.instructions ?? '',
      integrations: [],
      available: (await availableRecords(campaignId, catalog)).map((record) => ({ name: record.name, kind: record.kind, description: record.description, ...(record.needs ? { needs: record.needs } : {}) })),
      mcp: [],
      api: [],
      pm: false,
      services: facts.installations.filter((row) => row.enabled).map((row) => row.name),
    },
    agent: {
      role,
      team: form.team ?? '',
      lead: !!form.team && !!form.team_lead,
      wipeboard: facts.roster?.wipeboard ?? form.team ?? '',
      team_objective: facts.roster?.objective ?? '',
      team_integrations: [],
      reach: held.reach,
      recruit: held.recruit,
      output: held.output,
      provider: launch.provider ?? '',
      model: launch.model ?? '',
      harness: launch.harness ?? '',
      launch_mode: launch.launch_mode ?? 'live_dangerously',
    },
    work: {
      repos: facts.repositories.map((repo) => repo.name),
      where: facts.repositories.map((repo) => ({ repo: repo.name, held: repo.managed ? 'desk' as const : 'checkout' as const })),
      repo_lines: facts.repositories.map((repo) =>
        `- ${repo.name} ${repo.dir} — ${repo.managed ? `worktree: \`worktree-desk open ${repo.name}\`` : 'shared checkout'}${repo.note ? ` (${repo.note})` : ''}`).join('\n'),
      folder_lines: facts.folders.map((folder) => `- ${folder.name} ${folder.dir}${folder.note ? ` — ${folder.note}` : ''}`).join('\n'),
      // A desk holds when one is cut for this Agent (its desk record), not when its repos could have one.
      desk: form.desk ?? (await listDeskRecords({ owner: facts.name }).catch(() => [])).length > 0,
      checkout: form.checkout ?? facts.arrangement === 'checkout',
    },
  };
}

/** The brief document on the work record (its `brief` key): the record, and each layer's settings as born. */
export type BriefDocument = BriefRecord & { brief_settings: Partial<Record<Layer['layer'], Omit<Layer, 'layer'>>> };

export interface BuiltBrief { doc: BriefDocument; layers: Layer[]; cascade: Cascade; resolved: Resolved; text: string }

// Jira is never told: an Agent never reaches past the bridge. It doesn't move pm either (KAN-608).
const told = (on: Cascade): string[] => Object.keys(on.integrations).filter((name) => name !== 'jira');

/** THE BRIEF BUILDER: the brief document and the catalogs, nothing else. Pure. */
export function buildBrief(doc: BriefDocument, catalog: Catalog): BuiltBrief {
  const layers = LAYERS.map((layer) => layerOf(layer, doc.brief_settings[layer] ?? {}));
  const on = cascade(layers);
  const teamOn = cascade(layers.filter((layer) => layer.layer !== 'agent'));
  // The records on for this Agent, by kind, as their lines say them.
  const enabled = (kind: 'mcp' | 'api') => (doc.setting.available ?? []).filter((row) => row.kind === kind && on.integrations[row.name])
    .map(({ name, description, needs }) => ({ name, description, ...(needs ? { needs } : {}) }));
  const built: BriefDocument = {
    ...doc,
    setting: { ...doc.setting, integrations: told(on), pm: on.pm.on, mcp: enabled('mcp'), api: enabled('api') },
    // The lead's brief says what its Team has on.
    agent: { ...doc.agent, team_integrations: doc.agent.team && doc.agent.role === 'lead' ? told(teamOn) : [] },
  };
  const resolved = resolveBrief(catalog, built, layers);
  return { doc: built, layers, cascade: on, resolved, text: renderBrief(doc.session.name, built, resolved) };
}

const settingsOf = (layer: Layer): Omit<Layer, 'layer'> => ({ brief: layer.brief, integrations: layer.integrations, ...(layer.pm !== undefined ? { pm: layer.pm } : {}) });

/** THE NEW AGENT PATH: resolve every input once into the brief document, then build it. */
export async function composeBrief(form: SpawnForm, facts: LaunchFacts, agent: AgentBrief, launch: LaunchIdentity = {}): Promise<BuiltBrief> {
  const catalog = await readCatalogs();
  const layers = await briefLayers(facts, agent);
  const record = await birthRecord(form, facts, launch, catalog);
  return buildBrief({ ...record, brief_settings: Object.fromEntries(layers.map((layer) => [layer.layer, settingsOf(layer)])) }, catalog);
}

/** The Agent's own layer from a launch body or a configuration: `brief`, `integrations`, `pm`. */
export function agentBriefOf(body: unknown): AgentBrief {
  const layer = layerOf('agent', body);
  return { brief: layer.brief, integrations: layer.integrations, ...(layer.pm !== undefined ? { pm: layer.pm } : {}) };
}
