/**
 * CAMPAIGN_CONFIG — the durable record of one body of work, and the only writer of it.
 *
 * `ronin-lab/wip/buildouts/CAMPAIGN_SCOPING.md` is the plan this implements. Its ruling in
 * one sentence: a Campaign is the missing durable object, it owns the presentation and
 * defaults that vary with a body of work, and it owns NO LISTS — the records that belong
 * to it (team_rosters, project_roots, sessions, templates) point back with `campaign_id`
 * and are never embedded here. That asymmetry is the whole design: one Campaign has many
 * of each, a durable object has exactly one Campaign, and a UI VIEW selects several
 * without owning any of them.
 *
 * WHY THIS FILE IS THE ONE WRITER. Before it, the install's single implicit Campaign lived
 * in `ronin.json` as `settei.campaign` (name + description) with `settei.desk.profile`
 * beside it — two keys describing a body of work, in the file that also describes the
 * MACHINE. The plan's rule is *there must not be two writable Campaign records*, so the
 * legacy SETTEI accessors are re-pointed onto this store rather than kept in parallel:
 * `src/settei.ts`, `src/routes/settei-api.ts` and `src/desk-profiles.ts` now read and
 * write a Campaign through here, and `ronin.json`'s old keys are read exactly once more,
 * by `ensureInitialCampaign()`, to seed the record. The dependency runs one way — this
 * module reads `user-config.ts`, never the reverse — which is what keeps `check-modules`
 * happy and what makes "one writer" a structural fact instead of a convention.
 *
 * WHAT STAYS GLOBAL, and the plan names it: owner and authentication, the machine and its
 * health, release and Services entitlement, provider availability and credentials, the
 * session maximum, Hotwords, Koshi and gbrain. A Campaign is a body of work, not a box.
 * Only what semantically varies with the work moved: the Campaign's own name and
 * description, and the `desk_profile` that decides its vocabulary, skin and templates.
 *
 * `created_at` IS PROVENANCE AND ORDER, NOT A SETTING (owner's lead, 2026-08-29). It is
 * stamped once at create and never edited. It exists because the compatibility window has
 * to be able to NAME the Campaign that the migration seeded — `initialCampaignId()` — and
 * the two alternatives are both worse: re-deriving the id from the title drifts the moment
 * anyone renames the Campaign (the id is immutable, the title is not), and a stored
 * "which one is default" pointer would be exactly the second mutable record this file
 * exists to prevent. It is ordering and history, and no surface may read it as a default.
 */
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './stores.js';
import { readSection } from './user-config.js';
import { agentDefaults, type AgentDefaults } from './agent-defaults.js';
import { completeRoutineChoices } from './routines.js';

/** The typed bucket — a Campaign's own defaults, never a dump of all SETTEI. The three
 *  sub-buckets are the plan's, and they are the whole vocabulary: a fourth is a plan
 *  change, not a field somebody adds in passing. Nothing reads them yet, by design. */
export interface CampaignSettings {
  agent_defaults: AgentDefaults;
  cowork_defaults: Record<string, unknown>;
  template_defaults: Record<string, unknown>;
}

/** The Campaign's effective desk settings. A catalog desk_profile is only a template
 * copied here; surfaces read this object and never dereference mutable catalog data. */
export interface CampaignDeskSettings {
  skin: string;
  lexicon: string;
  theme: string;
  rireki_view: string;
  team_arrangement: string[];
  defaults: Record<string, unknown>;
}

export interface CampaignConfig {
  /** Stable lowercase token — storage and URL identity. IMMUTABLE in the first cut. */
  id: string;
  /** Readable and editable. The id does not follow it, deliberately. */
  title: string;
  description: string;
  /** Decides this Campaign's vocabulary, skin and offered templates. Stored as typed and
   *  never checked for existence — a desk_profile can be removed after it was chosen, and
   *  `src/desk-profiles.ts` already answers null for that rather than throwing. */
  desk_profile: string;
  desk: CampaignDeskSettings;
  /** `archived` hides by default and KILLS NOTHING — no Agent stops, no desk is dropped. */
  state: CampaignState;
  /** Stamped once at create, never edited. Provenance and order only. */
  created_at: string;
  config: CampaignSettings;
}

export type CampaignState = 'active' | 'archived';

/** What a create or an edit may state. `id` and `created_at` are absent on purpose:
 *  neither is editable, so neither is offerable. */
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

const dir = (): string => storeDir('campaigns');

/**
 * A Campaign id obeys the same rule as a team name — lowercase, boring, typeable — and for
 * the same reason: it is a filename and a URL segment before it is anything else. The
 * pattern excludes `/`, `.` and whitespace, so no id can address a path outside the store.
 */
export const isValidCampaignId = (s: string): boolean => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(s);

export const campaignFile = (id: string): string => path.join(dir(), `${id}.json`);

/**
 * A title becomes an id ONCE — at migration, and at create when the caller names no id.
 * After that the id is frozen and the title is free to change; this is never re-run over
 * an existing record. Anything that cannot yield a token falls back to `ronin`, which is
 * the plan's own fallback and the ordinary answer for an install that never named itself.
 */
/**
 * THE FRESH-INSTALL CAMPAIGNS. This is the declarative birth payload, not a SETTEI
 * setting and not a mutable "default Campaign" pointer. Atarashi reads the resulting
 * durable Campaign through SETTEI; it does not invent one itself.
 *
 * It is a collection because installation data should be data, even while the product
 * deliberately ships one Campaign. Adding another row later would be an explicit product
 * decision rather than another bootstrap code path.
 */
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

/**
 * ATARASHI'S ONE WRITE. The setup surface sends only answers; this writer turns them
 * into the complete first Campaign record. `kind` is consumed as a preset and is never
 * stored on the Campaign. Routine definitions are read here so a newly installed
 * specialized Routine receives an explicit false instead of becoming an absent key.
 */
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
    ? input.routine_bundle as SetupRoutineBundle : 'worktrees';
  const { readDefinitions } = await import('./definitions.js');
  const providerModel = bucket(input.provider_model);
  const routineNames = (await readDefinitions('routines')).map((row) => row.name);
  const routines = Object.fromEntries(routineNames.map((name) => [name,
    bundle === 'services'
      ? true
      : name === 'ronin_base'
        ? bundle === 'base' || bundle === 'worktrees'
        : name === 'ronin_worktrees' && bundle === 'worktrees',
  ]));
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

/** A stored string, trimmed and capped. A blank is a blank, never the mark that stands
 *  for one — the team_roster store learned that the hard way on 2026-08-26. */
const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 500;
const DESK_PROFILE_MAX = 64;
const DESK_VALUE_MAX = 120;

/** A plain object, or an empty one. Never an array, never null — both parse as objects in
 *  JavaScript and neither is a settings bucket. */
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
  ...(edit.rireki_view !== undefined ? { rireki_view: str(edit.rireki_view, DESK_VALUE_MAX) } : {}),
  ...(edit.team_arrangement !== undefined ? { team_arrangement: stringList(edit.team_arrangement) } : {}),
  ...(edit.defaults !== undefined ? { defaults: bucket(edit.defaults) } : {}),
});

async function settingsFromTemplate(name: string): Promise<CampaignDeskSettings> {
  if (!name) return emptyDeskSettings();
  // Dynamic to keep campaign_config the storage owner while desk-profiles retains its
  // compatibility active-name reader back into this module.
  const { listDeskProfiles } = await import('./desk-profiles.js');
  const p = (await listDeskProfiles()).find((row) => row.name === name);
  if (!p) return emptyDeskSettings();
  return deskSettings(p);
}

/**
 * Parse one record. Every field is coerced rather than trusted: the file is under the
 * user's own root, a person may edit it, and a half-typed JSON must degrade to a readable
 * Campaign instead of taking a surface down. The id comes from the FILENAME, never from
 * the body — a body that disagrees with its own filename cannot be allowed to decide.
 */
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
  await mkdir(dir(), { recursive: true });
  const target = campaignFile(c.id);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  // The id is the filename and is not repeated in the body — one home for one fact.
  const { id: _id, ...body } = c;
  await writeFile(tmp, JSON.stringify(body, null, 2) + '\n', 'utf8');
  await rename(tmp, target);
  return c;
}

async function completeAgentDefaults(value: unknown): Promise<AgentDefaults> {
  const defaults = agentDefaults(value);
  const { listRoutines } = await import('./definitions.js');
  defaults.routines = completeRoutineChoices(await listRoutines(), defaults.routines);
  return defaults;
}

/** One Campaign, or null when no such record exists. An invalid id is null and never a
 *  path read: the check happens before the filename is built. */
export async function readCampaign(id: string): Promise<CampaignConfig | null> {
  if (!isValidCampaignId(id)) return null;
  try {
    const raw = await readFile(campaignFile(id), 'utf8');
    const parsed = parse(id, raw);
    if (!parsed) return null;
    const doc = JSON.parse(raw) as Record<string, unknown>;
    const config = bucket(doc.config);
    const defaults = bucket(config.agent_defaults);
    if (!Object.prototype.hasOwnProperty.call(defaults, 'routines')) {
      // Existing Campaigns predate Atarashi's Routine map. Preserve their de-facto
      // launch once; later catalog additions remain absent and therefore resolve off.
      parsed.config.agent_defaults.routines = { ronin_base: true, ronin_worktrees: true };
      await writeRecord(parsed);
    }
    if (!Object.prototype.hasOwnProperty.call(doc, 'desk')) {
      // One-time, lossless migration: the old reference is resolved against the catalog
      // once and copied. Later catalog edits cannot silently repaint this Campaign.
      parsed.desk = await settingsFromTemplate(parsed.desk_profile);
      await writeRecord(parsed);
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Every Campaign, in ONE deterministic order — `created_at`, then `id` to break a tie
 * (the lead's ruling, 2026-08-29). Deterministic because two surfaces listing the same
 * install must agree, and a directory has no order of its own.
 *
 * Archived records are included by default and filtered by the CALLER, because "all
 * Campaigns" means all non-archived ones at READ TIME in the UI, while the compatibility
 * resolver below needs to see an archived initial Campaign. One reader, two questions.
 */
export async function listCampaigns(): Promise<CampaignConfig[]> {
  let names: string[];
  try {
    names = await readdir(dir());
  } catch {
    return []; // no store yet — the ordinary state before the first boot that seeds one
  }
  const out: CampaignConfig[] = [];
  for (const f of names) {
    if (!f.endsWith('.json') || f.startsWith('.')) continue;
    const c = await readCampaign(f.replace(/\.json$/, ''));
    if (c) out.push(c);
  }
  return out.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/**
 * CREATE. Refuses an id that already has a record — creating over a Campaign is a
 * different intent from editing one, and the refusal keeps them apart (the team_roster
 * store draws the same line for the same reason).
 *
 * The id is derived from the title unless the caller names one, and it is frozen here.
 */
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

/**
 * EDIT — only the keys the caller states. `id` and `created_at` are not in `CampaignEdit`
 * and cannot be reached from here: the id is the record's identity in storage, in URLs and
 * in every `campaign_id` pointing at it, so renaming one would be a migration, not a save.
 *
 * `config` merges per sub-bucket rather than replacing the whole bucket, so a caller that
 * knows about one bucket cannot silently drop another it has never heard of — the same
 * bargain `updateConfig` makes for `ronin.json`.
 */
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

/**
 * ARCHIVE — hides by default and kills nothing. No Agent stops, no desk is dropped, no
 * wipeboard is touched; the plan is explicit that a hidden Campaign keeps running, and
 * this store could not stop one if it wanted to. Reversible: `state: 'active'` un-archives.
 */
export const archiveCampaign = (id: string): Promise<CampaignConfig> =>
  writeCampaign(id, { state: 'archived' });

/* ------------------------------------------------ the initial Campaign, and its window */

/**
 * WHICH RECORD THE MIGRATION SEEDED — the compatibility window's one answer, and NOT a
 * "default Campaign" (the lead ruled that distinction explicitly, 2026-08-29).
 *
 * Earliest `created_at`, ties broken by id, **archived records included**: the Campaign an
 * install started with stays the one legacy unmarked records belong to even if the owner
 * later archives it. Nothing here is settable, so no surface can turn this into a second
 * mutable pointer — it is a fact about history, computed, never stored.
 *
 * This resolver is the seam a caller stamping unmarked records maps `campaign_id: ''`
 * through. It is deliberately a function rather than a file they read: their storage
 * formats stay theirs, and mine stays mine. `null` only before the first boot seeds one.
 */
export async function initialCampaign(): Promise<CampaignConfig | null> {
  const all = await listCampaigns();
  return all[0] ?? null;
}

/**
 * THE MIGRATION — additive, idempotent, and it never guesses among several Campaigns.
 *
 * Steps 1 and 2 of the plan's migration: preserve an install's current
 * `settei.campaign.name`, or populate a fresh install from `FRESH_CAMPAIGNS`, and create
 * its record. Stamping the id onto team_rosters,
 * project_roots, live Agents, templates and wipeboards is steps 3-6 and belongs to
 * `@campaign_scope`, which exports its own per-object stampers for the purpose.
 *
 * IDEMPOTENT BY EXISTENCE, NOT BY FLAG: if this install has ANY Campaign — archived ones
 * included — the migration has already happened and this returns the initial one
 * untouched. So it is safe on every boot forever, it cannot resurrect a Campaign the owner
 * archived, and it cannot manufacture a second one on a box that already has several.
 *
 * THE OLD KEYS ARE READ, NEVER WRITTEN, AND NEVER DELETED HERE. `ronin.json`'s `campaign`
 * and `desk` sections are this function's seed and nothing else's; after the seed they are
 * inert. Removing them is the plan's build-out leg 5, together with the old writable
 * surface — deleting the owner's data in the same release that stops reading it would
 * leave no way back if the seed were ever wrong.
 */
export async function ensureInitialCampaign(): Promise<CampaignConfig> {
  const existing = await initialCampaign();
  if (existing) return existing;

  const legacy = await readSection<{ name?: unknown; description?: unknown }>('campaign', {});
  const desk = await readSection<{ profile?: unknown }>('desk', {});
  // A legacy install keeps the Campaign it already named. A genuinely fresh install is
  // populated from the declared collection above; there is one row today by design.
  const named = str(legacy.name, TITLE_MAX);
  if (named) {
    return createCampaign({
      id: campaignIdFrom(named),
      title: named,
      description: str(legacy.description, DESCRIPTION_MAX),
      desk_profile: str(desk.profile, DESK_PROFILE_MAX),
    });
  }

  const [first] = FRESH_CAMPAIGNS;
  if (!first) throw new Error('Fresh Campaign catalog is empty.');
  return createCampaign(first);
}

/* ------------------------------------- the re-pointed SETTEI leaves: ONE writable record */

/**
 * THE CAMPAIGN LEAF SETTEI STILL SERVES. `set.campaign.{name,description}` keeps its shape
 * on `GET /api/settei` — `public/js/campaign.js` and `@campaign_ui`'s compatibility read
 * both depend on it — but the fact now comes from the initial Campaign's record rather
 * than from `ronin.json`. One record, two readers; not two records.
 *
 * `name` is the record's `title`. The wire name is SETTEI's and does not change, because
 * renaming a served key to match internal vocabulary would break a client for no gain.
 */
export async function readCampaignSection(): Promise<{ name?: string; description?: string }> {
  const c = await ensureInitialCampaign();
  return { name: c.title, description: c.description };
}

/**
 * The legacy write door, re-pointed. Seeds the record first, because a box whose owner
 * types a Campaign name before the boot seed has run must still land somewhere real —
 * and `ensureInitialCampaign` is idempotent, so this costs a read on every other call.
 */
export async function writeCampaignSection(v: { name?: string; description?: string }): Promise<void> {
  const c = await ensureInitialCampaign();
  await writeCampaign(c.id, {
    ...(v.name !== undefined ? { title: v.name } : {}),
    ...(v.description !== undefined ? { description: v.description } : {}),
  });
}

/**
 * THE DESK PROFILE, which is a Campaign's and not the install's (the plan's SETTEI
 * boundary: `desk_profile` controls vocabulary, skin and offered templates for ONE body of
 * work). Same shape `readDeskSection` had, so `src/desk-profiles.ts` and `src/settei.ts`
 * change an import and nothing else. `''` still means "as stock" everywhere.
 */
export async function readDeskSection(): Promise<{ profile?: string }> {
  const c = await ensureInitialCampaign();
  return { profile: c.desk_profile };
}

export async function writeDeskSection(v: { profile?: string }): Promise<void> {
  const c = await ensureInitialCampaign();
  if (v.profile !== undefined) await writeCampaign(c.id, { desk_profile: v.profile });
}
