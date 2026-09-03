import { readMachineSettingsSection, writeMachineSettings } from './machine-settings.js';
import { agentDefaults, type AgentDefaults } from './agent-defaults.js';
import { completeRoutineChoices } from './routines.js';

async function readCampaigns(): Promise<Record<string, unknown>> {
  return readMachineSettingsSection<Record<string, unknown>>('campaigns', {});
}

async function writeCampaigns(campaigns: Record<string, unknown>): Promise<void> {
  await writeMachineSettings('campaigns', { campaigns });
}

export interface CampaignSettings {
  agent_defaults: AgentDefaults;
  cowork_defaults: Record<string, unknown>;
  template_defaults: Record<string, unknown>;
}

export interface CampaignDeskSettings {
  skin: string;
  lexicon: string;
  theme: string;
  theme_mobile: string;
  rireki_view: string;
  team_arrangement: string[];
  defaults: Record<string, unknown>;
}

export interface CampaignConfig {
  id: string;
  title: string;
  description: string;
  desk_profile: string;
  desk: CampaignDeskSettings;
  state: CampaignState;
  created_at: string;
  config: CampaignSettings;
}

export type CampaignState = 'active' | 'archived';

export interface CampaignEdit {
  title?: string;
  description?: string;
  desk_profile?: string;
  desk?: Partial<CampaignDeskSettings>;
  state?: CampaignState;
  config?: {
    agent_defaults?: Partial<AgentDefaults>;
    cowork_defaults?: Record<string, unknown>;
    template_defaults?: Record<string, unknown>;
  };
}

export const isValidCampaignId = (s: string): boolean => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(s);

export const FRESH_CAMPAIGNS: ReadonlyArray<CampaignEdit & { id: string }> = Object.freeze([
  Object.freeze({
    id: 'home_machine',
    title: 'Ronin Home',
    description: '',
    desk_profile: '',
  }),
]);

export type SetupKind = 'open' | 'coding' | 'work' | 'personal' | 'household' | 'social' | 'school';
export type SetupRoutineBundle = 'nothing' | 'floor' | 'base' | 'worktrees' | 'services';

const KIND_BEHAVIOURS: Record<SetupKind, string[]> = {
  open: [],
  coding: ['sops:github', 'sops:ronin_methodology', 'sops:teams'],
  work: ['sops:teams'],
  personal: [],
  household: [],
  social: ['sops:teams'],
  school: [],
};

export async function populateHomeMachine(input: {
  title?: unknown;
  description?: unknown;
  desk_profile?: unknown;
  provider?: unknown;
  model?: unknown;
  provider_model?: unknown;
  kind?: unknown;
  routine_bundle?: unknown;
}): Promise<CampaignConfig> {
  const existing = await readCampaign('home_machine');
  const campaign = existing ?? await createCampaign({
    id: 'home_machine',
    title: str(input.title, TITLE_MAX) || 'Ronin Home',
    description: str(input.description, DESCRIPTION_MAX),
    desk_profile: str(input.desk_profile, DESK_PROFILE_MAX),
  });
  const kind = (['open', 'coding', 'work', 'personal', 'household', 'social', 'school'] as const)
    .includes(input.kind as SetupKind) ? input.kind as SetupKind : 'open';
  const bundle = (['nothing', 'floor', 'base', 'worktrees', 'services'] as const)
    .includes(input.routine_bundle as SetupRoutineBundle)
    ? input.routine_bundle as SetupRoutineBundle : 'base';
  const { listRoutines } = await import('./resource-adapters.js');
  const providerModel = bucket(input.provider_model);
  const routines = Object.fromEntries((await listRoutines()).map((row) =>
    [row.name, row.bundles.includes(bundle)]));
  return writeCampaign(campaign.id, {
    title: str(input.title, TITLE_MAX) || campaign.title,
    description: input.description === undefined ? campaign.description : str(input.description, DESCRIPTION_MAX),
    desk_profile: input.desk_profile === undefined ? campaign.desk_profile : str(input.desk_profile, DESK_PROFILE_MAX),
    config: { agent_defaults: {
      provider: str(input.provider ?? providerModel.provider, 120),
      model: str(input.model ?? providerModel.model, 120),
      reach: 'plan', recruit: 'propose agents', output: ['open'],
      routines,
      behaviours: KIND_BEHAVIOURS[kind],
      dial: 'write',
      launch_mode: 'live_dangerously',
    } },
  });
}

export function campaignIdFrom(title: string): string {
  const slug = String(title ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return isValidCampaignId(slug) ? slug : 'ronin';
}

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 500;
const DESK_PROFILE_MAX = 64;
const DESK_VALUE_MAX = 120;

const bucket = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const settings = (v: unknown): CampaignSettings => {
  const c = bucket(v);
  return {
    agent_defaults: agentDefaults(c.agent_defaults),
    cowork_defaults: bucket(c.cowork_defaults),
    template_defaults: bucket(c.template_defaults),
  };
};

const stringList = (v: unknown): string[] => Array.isArray(v)
  ? v.map((x) => str(x, DESK_VALUE_MAX)).filter(Boolean)
  : [];

const deskSettings = (v: unknown): CampaignDeskSettings => {
  const d = bucket(v);
  return {
    skin: str(d.skin, DESK_VALUE_MAX),
    lexicon: str(d.lexicon, DESK_VALUE_MAX),
    theme: str(d.theme, DESK_VALUE_MAX),
    theme_mobile: str(d.theme_mobile, DESK_VALUE_MAX),
    rireki_view: str(d.rireki_view, DESK_VALUE_MAX),
    team_arrangement: stringList(d.team_arrangement),
    defaults: bucket(d.defaults),
  };
};

const emptyDeskSettings = (): CampaignDeskSettings => deskSettings({});

const mergeDeskSettings = (
  base: CampaignDeskSettings,
  edit: Partial<CampaignDeskSettings>,
): CampaignDeskSettings => ({
  ...base,
  ...(edit.skin !== undefined ? { skin: str(edit.skin, DESK_VALUE_MAX) } : {}),
  ...(edit.lexicon !== undefined ? { lexicon: str(edit.lexicon, DESK_VALUE_MAX) } : {}),
  ...(edit.theme !== undefined ? { theme: str(edit.theme, DESK_VALUE_MAX) } : {}),
  ...(edit.theme_mobile !== undefined ? { theme_mobile: str(edit.theme_mobile, DESK_VALUE_MAX) } : {}),
  ...(edit.rireki_view !== undefined ? { rireki_view: str(edit.rireki_view, DESK_VALUE_MAX) } : {}),
  ...(edit.team_arrangement !== undefined ? { team_arrangement: stringList(edit.team_arrangement) } : {}),
  ...(edit.defaults !== undefined ? { defaults: bucket(edit.defaults) } : {}),
});

async function settingsFromTemplate(name: string): Promise<CampaignDeskSettings> {
  if (!name) return emptyDeskSettings();
  const { listDeskProfiles } = await import('./desk-profiles.js');
  const p = (await listDeskProfiles()).find((row) => row.name === name);
  if (!p) return emptyDeskSettings();
  return deskSettings(p);
}

function parse(id: string, raw: string): CampaignConfig | null {
  let doc: Record<string, unknown>;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    doc = v as Record<string, unknown>;
  } catch {
    return null;
  }
  return {
    id,
    title: str(doc.title, TITLE_MAX) || id,
    description: str(doc.description, DESCRIPTION_MAX),
    desk_profile: str(doc.desk_profile, DESK_PROFILE_MAX),
    desk: deskSettings(doc.desk),
    state: doc.state === 'archived' ? 'archived' : 'active',
    created_at: typeof doc.created_at === 'string' && doc.created_at ? doc.created_at : '',
    config: settings(doc.config),
  };
}

async function writeRecord(c: CampaignConfig): Promise<CampaignConfig> {
  const { id: _id, ...body } = c;
  await writeCampaigns({ ...await readCampaigns(), [c.id]: body });
  return c;
}

async function completeAgentDefaults(value: unknown): Promise<AgentDefaults> {
  const defaults = agentDefaults(value);
  const { listRoutines } = await import('./resource-adapters.js');
  const catalog = await listRoutines();
  const stated = defaults.routines && Object.keys(defaults.routines).length > 0;
  defaults.routines = stated
    ? completeRoutineChoices(catalog, defaults.routines)
    : Object.fromEntries(catalog.map((row) => [row.name, row.bundles.includes('base')]));
  return defaults;
}

export async function readCampaign(id: string): Promise<CampaignConfig | null> {
  if (!isValidCampaignId(id)) return null;
  try {
    const campaigns = await readCampaigns();
    if (!Object.hasOwn(campaigns, id)) return null;
    const raw = JSON.stringify(campaigns[id]);
    const parsed = parse(id, raw);
    if (!parsed) return null;
    const doc = JSON.parse(raw) as Record<string, unknown>;
    const config = bucket(doc.config);
    const defaults = bucket(config.agent_defaults);
    if (!Object.prototype.hasOwnProperty.call(defaults, 'routines')) {
      const { listRoutines } = await import('./resource-adapters.js');
      parsed.config.agent_defaults.routines = Object.fromEntries(
        (await listRoutines()).map((row) => [row.name, row.bundles.includes('base')]));
      await writeRecord(parsed);
    }
    if (!Object.prototype.hasOwnProperty.call(doc, 'desk')) {
      parsed.desk = await settingsFromTemplate(parsed.desk_profile);
      await writeRecord(parsed);
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function listCampaigns(): Promise<CampaignConfig[]> {
  const campaigns = await readCampaigns();
  const out: CampaignConfig[] = [];
  for (const id of Object.keys(campaigns)) {
    const c = await readCampaign(id);
    if (c) out.push(c);
  }
  return out.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export async function createCampaign(edit: CampaignEdit & { id?: string }): Promise<CampaignConfig> {
  const title = str(edit.title, TITLE_MAX);
  const id = edit.id ? str(edit.id, 64) : campaignIdFrom(title);
  if (!isValidCampaignId(id)) {
    throw new Error(`"${id}" is not a usable Campaign id — lowercase letters, digits, - and _ only.`);
  }
  if (await readCampaign(id)) {
    throw new Error(`Campaign "${id}" already exists — edit it instead.`);
  }
  const profile = str(edit.desk_profile, DESK_PROFILE_MAX);
  return writeRecord({
    id,
    title: title || id,
    description: str(edit.description, DESCRIPTION_MAX),
    desk_profile: profile,
    desk: edit.desk === undefined
      ? await settingsFromTemplate(profile)
      : mergeDeskSettings(await settingsFromTemplate(profile), edit.desk),
    state: edit.state === 'archived' ? 'archived' : 'active',
    created_at: new Date().toISOString(),
    config: {
      ...settings(edit.config),
      agent_defaults: await completeAgentDefaults(settings(edit.config).agent_defaults),
    },
  });
}

export async function writeCampaign(id: string, edit: CampaignEdit): Promise<CampaignConfig> {
  const existing = await readCampaign(id);
  if (!existing) throw new Error(`Campaign "${id}" does not exist.`);
  const appliedDesk = edit.desk_profile !== undefined
    ? await settingsFromTemplate(str(edit.desk_profile, DESK_PROFILE_MAX))
    : existing.desk;
  const merged: CampaignConfig = {
    ...existing,
    ...(edit.title !== undefined ? { title: str(edit.title, TITLE_MAX) || existing.id } : {}),
    ...(edit.description !== undefined ? { description: str(edit.description, DESCRIPTION_MAX) } : {}),
    ...(edit.desk_profile !== undefined ? { desk_profile: str(edit.desk_profile, DESK_PROFILE_MAX) } : {}),
    desk: edit.desk === undefined ? appliedDesk : mergeDeskSettings(appliedDesk, edit.desk),
    ...(edit.state !== undefined ? { state: edit.state === 'archived' ? 'archived' : 'active' } : {}),
    ...(edit.config !== undefined
      ? {
          config: {
            agent_defaults: edit.config.agent_defaults === undefined
              ? existing.config.agent_defaults : await completeAgentDefaults(edit.config.agent_defaults),
            cowork_defaults: edit.config.cowork_defaults === undefined
              ? existing.config.cowork_defaults : bucket(edit.config.cowork_defaults),
            template_defaults: edit.config.template_defaults === undefined
              ? existing.config.template_defaults : bucket(edit.config.template_defaults),
          },
        }
      : {}),
  };
  return writeRecord(merged);
}

export const archiveCampaign = (id: string): Promise<CampaignConfig> =>
  writeCampaign(id, { state: 'archived' });

export async function initialCampaign(): Promise<CampaignConfig | null> {
  const all = await listCampaigns();
  return all[0] ?? null;
}

export async function ensureInitialCampaign(): Promise<CampaignConfig> {
  const existing = await initialCampaign();
  if (existing) return existing;

  const [first] = FRESH_CAMPAIGNS;
  if (!first) throw new Error('Fresh Campaign catalog is empty.');
  return createCampaign(first);
}

export async function readCampaignSection(): Promise<{ name?: string; description?: string }> {
  const c = await ensureInitialCampaign();
  return { name: c.title, description: c.description };
}

export async function writeCampaignSection(v: { name?: string; description?: string }): Promise<void> {
  const c = await ensureInitialCampaign();
  await writeCampaign(c.id, {
    ...(v.name !== undefined ? { title: v.name } : {}),
    ...(v.description !== undefined ? { description: v.description } : {}),
  });
}

export async function readDeskSection(): Promise<{ profile?: string }> {
  const c = await ensureInitialCampaign();
  return { profile: c.desk_profile };
}

export async function writeDeskSection(v: { profile?: string }): Promise<void> {
  const c = await ensureInitialCampaign();
  if (v.profile !== undefined) await writeCampaign(c.id, { desk_profile: v.profile });
}
