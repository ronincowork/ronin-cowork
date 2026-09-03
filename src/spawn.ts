import { existsSync } from 'node:fs';
import path from 'node:path';
import { mergeSessionDefaults, resolveLaunchCommand, type SessionsDefaults } from './launch-command.js';
import { REPO_ROOT } from './config.js';
import { bootFiles, ensureShelf } from './session-boot.js';
import { listProjectRoots, listSessionLaunchSpecs, USER_PROJECT_ROOTS_MD, type ProjectRootInfo } from './project-roots.js';
import { readAgentsSection, readDesksSection } from './user-config.js';
import { storeDir } from './stores.js';
import { findDefinition, listRoutines } from './definitions.js';
import { isCreatableTeamName as isTeamName, readTeamRoster, teamRosterFile, type TeamRoster } from './team-rosters.js';
import { resolveLaunchProfile, type Dial, type LaunchProfile, type StatedBy } from './launch-profile.js';
import { readCampaign } from './campaign-config.js';
import { primaryWorkLocation, renderDeskBlock, renderWorkLocations, resolveLaunchDesks, type DeskChoice } from './launch-desks.js';
import type { ResolvedWorktreesRepository } from './worktrees-resolution.js';
import type { Assignment } from './desks/schema.js';
import { mandate, type LaunchMode, type Mandate } from './agent-defaults.js';
import { resolveAgentRoutines, routineChoices, type ResolvedRoutine } from './routines.js';
import { initialCampaignId } from './campaign-scope.js';
import { resolveLaunchSeed } from './launch-seed.js';
import { resolveBehaviourBooks, type DeliveredBehaviour } from './behaviours.js';
import { templateProvenance } from './template-provenance.js';
import { profileDir, resolveHouseSeatProfile, type HouseSeat } from './house-seats.js';
export const routineReading = (routines: readonly { enabled: boolean; reading: string[]; reading_off: string[] }[]): string[] =>
  routines.flatMap((routine) => (routine.enabled ? routine.reading : routine.reading_off));
/**
 * The mechanical executor: a filled form in, a briefed session out.
 *
 * "Once the recipe is written, the cooking is mechanical" — spawning is Ronin's
 * own code, never an agent following tmux steps. Same shape in, same session out.
 * Nothing here calls a model: the smart fill (Koshi) is an upgrade that populates
 * this form, not a dependency of performing it.
 *
 * See co-working/user_repo/wip/buildouts/MACRO_LAUNCHER.md.
 */

/**
 * What the launcher sends: the two optional launch axes, plus whatever the user picked.
 * The field names are the three universal axes — the same keys that scope a memory and
 * address a macro, so one vocabulary spans the whole system.
 */
export interface SpawnForm {
  /** The birth path. This is the route key; session_role is never used to infer it. */
  session_type?: 'cowork_agent' | 'bare_metal_agent' | 'terminal';
  /** Server-owned house birth. Never accepted from the public launch body. */
  house_seat?: HouseSeat;
  /**
   * WHAT the session is doing right now. Optional and mutable — the session rewrites it
   * with `write_tegami` and the owner rewrites it from the tile, and either write
   * injects the new role's reading into the running session.
   *
   * A launch naming no session_role is not a catalog launch at all; the route hands it
   * to `launch_bare` instead of guessing.
   */
  session_role?: string;
  /**
   * THE TEAM this session is born onto — an existing team's name, or absent for a
   * rōnin (a session on no team, which is first-class). Joining rides the ordinary tag
   * machinery; what the team adds at birth is CONTEXT: its roster's root as the
   * project_root default and its objective in the brief.
   */
  team?: string;
  /**
   * BORN AS THE 人 of `team` (owner, 2026-08-26, the session door): the one case where
   * leadership is known before the session exists — the lobby's Go, or a lead raising
   * its successor. Designation still rides `@ronin-lead` exactly as the hand-set route
   * does (routes/sessions-api.ts); this only sets it at birth instead of a call later,
   * and carries the teams SOP into the birth reading the way a default_lead_role does.
   * Ignored when there is no team to lead.
   */
  team_lead?: boolean;
  /**
   * WHICH MODEL, BY NAME (owner, 2026-08-26: *"please open a fable five session"*). A
   * model name out of the launch table's own column — `fable`, `opus`, `gpt-5.6-sol` —
   * resolved to that row's command. One field: named, it is the model; blank, the
   * session's usual default applies. Naming a `cmd` as well is refused (a cmd already
   * carries its model). A name the table does not carry is refused with the names it
   * does; it is never guessed into a command string here, because the table is the one
   * place a model is a column.
   */
  model?: string;
  /**
   * WHICH PROVIDER, WITHOUT NAMING A MODEL (owner, 2026-08-29). Until this, naming a
   * vendor meant naming one of its models, so *"give me Anthropic"* had no spelling.
   * Resolves to that provider's preferred model (`agents.sessions.by_provider` in ⚙
   * Configuration), else its first column. With `model` it narrows; with `cmd` it is
   * refused, as `model` is.
   */
  provider?: string;
  /** How far this Cowork Agent may go, recruit, and what it hands back. */
  mandate?: Partial<Mandate>;
  /** Campaign whose Agent defaults apply. The route inherits this from the caller. */
  campaign_id?: string;
  /** Team-seeded launch classification; this launch may state a different answer. */
  kind?: string;
  /** Chosen birth books. Absent inherits the parent seed; an explicit [] chooses none. */
  behaviours?: string[]; template?: string; // preset is validated provenance only, never reapplied
  /** Per-Agent Routine overrides. Unnamed Routines retain the Team or Campaign answer. */
  routines?: Record<string, boolean>;
  /** Optional first instruction. Blank still launches a fully booted Agent. */
  prompt?: string;
  /** What the session is called. Blank is derived and de-duplicated. */
  name?: string;
  /** Explicit Control choice. Blank uses the resolved role default, then write. */
  dial?: Dial;
  project_root?: string;
  cmd?: string;
  launch_mode?: LaunchMode;
  /** Per-launch gbrain reach. `connected` preserves provider configuration;
   * `disconnected` appends the provider-declared launch tokens. */
  gbrain_mode?: 'connected' | 'disconnected';
  tags?: string[];
  /** Files/dirs to read before anything else. */
  seed?: string[];
  /** One-off instruction appended verbatim — the "and don't touch the CSS" case. */
  inject?: string;
  /**
   * A specific session this one is pointed at — to review, to fork from, to watch.
   * A group says "these people"; this says "that one". Expanded at spawn into the
   * session's name AND its directory, so the new agent doesn't have to rediscover
   * where the work it is looking at actually lives.
   */
  reference?: string;
  /**
   * THE DESK CONTROL of the launch box — *own desk · plain root* — pre-answered: absent
   * means by the resolved Ronin Worktrees Routine;
   * `own` asks for one regardless, `none` refuses one. Ignored for a plain terminal.
   */
  desk?: DeskChoice;
}

/** What the form resolves to once sentinels are filled from the catalogs. */
export interface Resolved {
  session_type: 'cowork_agent' | 'bare_metal_agent' | 'terminal';
  name: string;
  dir: string;
  cmd: string;
  tags: string[];
  dial: Dial;
  /** The axis as resolved, possibly ''. This is what TEGAMI is seeded with. */
  session_role: string;
  mandate: Mandate;
  /** The team joined at birth, '' for a rōnin. */
  team: string;
  /** Never '' — a session must be born somewhere, and the resolver refuses otherwise. */
  project_root: string;
  /** Managed repo desks, opened by the route before the CLI starts; null when none. */
  assignment: Assignment | null;
  /** The canonical capability × repository resolution, including direct checkouts. */
  work_locations: ResolvedWorktreesRepository[];
  brief: string;
  /**
   * False when the profile resolves `agent: none` — a plain terminal. `cmd` and `brief` are
   * both empty in that case and the caller must type NEITHER into the pane; this flag
   * says so out loud rather than leaving the caller to infer it from an empty string.
   */
  agent: boolean;
  /** `cap: exempt` — born even at the session max. It still counts once it is. */
  capExempt: boolean;
  /** What the provider command actually received for gbrain reach. */
  gbrain_mode: 'connected' | 'disconnected';
  /**
   * THE CLI ACTUALLY LAUNCHED — `claude`, `codex` — the first word of `cmd`, basenamed.
   * Empty for an `agent: none` kind, which launches nothing at all.
   *
   * Stamped onto the session as `@ronin-agent` (src/tmux.ts) because this is the only
   * moment it is known for certain: after the spawn, all tmux can say is what the pane's
   * process is called, and for Codex that is `node`.
   */
  launchAgent: string;
  launch_mode: LaunchMode;
  ack: boolean;
  opening: string;
  posture: string[];
  label: string;
  mcpAlways: boolean;
  mcpDefault: boolean;
  /** Durable Team context. Empty for a rōnin launch. */
  team_objective: string;
  team_branch: string;
  team_wipeboard: string;
  team_state: '' | 'active' | 'archived';
  /** Source files during resolution; the executor replaces them with the compiled README. */
  birth_reading: string[];
  /** The valid selected books handed over beside the Routine reading. */
  behaviours: DeliveredBehaviour[];
  /** Team-seeded kind, or the launch's own valid answer. */
  kind: string;
  /** Unusable selected books omitted while the birth continued. */
  ignored: string[];
  /** Campaign map after complete Team and sparse Agent overrides; sole Routine projection input. */
  routines: ResolvedRoutine[];
  /** Server-owned attribution for every resolved reading. The browser only renders it. */
  stated_by: Record<string, StatedBy[]>;
}

const ACK_RULE =
  'Before doing anything else: report back in your own words what you understand this job to be, ' +
  'what you will NOT do (no code, no builds, no commits until the owner says go), and anything ' +
  'that is unclear or looks wrong. Then wait for the owner.';

/**
 * Assemble the boot brief — the one composed first message, identical whatever
 * CLI is in the tile. Pointer vs inline is deliberate: short load-bearing text
 * (the role's posture, the ack rule) is INLINED because that is the only way to
 * guarantee it is read; long repo docs stay POINTERS because the CLI pulls them
 * in anyway and a paste that runs past a screen helps nobody.
 */
export function buildBrief(
  profile: LaunchProfile,
  root: ProjectRootInfo | undefined,
  form: SpawnForm,
  referenceDir?: string,
  boot: string[] = [],
  roster?: TeamRoster | null,
  assignment?: Assignment | null,
  workLocations: ResolvedWorktreesRepository[] = [],
): string {
  const parts: string[] = [];
  if (profile.posture.length) parts.push(`You are the ${profile.label}. ${profile.posture.join(' ')}`);
  // THE TEAM, before the reading: who you work with and what that team is for. The
  // objective comes from the roster — the durable half — and the wipeboard is the
  // team's own conversation surface. A rōnin launch has no line here at all.
  if (roster) {
    const lines = [`Team: ${roster.name}`];
    if (roster.objective) lines.push(`Objective: ${roster.objective}`);
    lines.push(`Wipeboard: ${roster.wipeboard} (tejun-wipeboard ${roster.wipeboard})`);
    parts.push(lines.join('\n'));
  } else if (form.team) {
    parts.push(
      `You are born onto team "${form.team}" — a tag-only team: its members are the sessions carrying its tag ` +
        `(tejun-team ${form.team}), it has no durable roster, and its wipeboard is "${form.team}" (tejun-wipeboard ${form.team}).`,
    );
  }
  // Concrete resolved locations precede the reading; managed rows also carry their line.
  if (workLocations.length) parts.push(renderWorkLocations(workLocations, roster?.branches ?? {}));
  // The project root is named for every launch, before any managed desks.
  if (root) parts.push(`Born in ${root.name} at ${root.dir}.`);
  if (assignment?.desks.length) parts.push(renderDeskBlock(assignment));
  // THE BIRTH README POINTER. ResolveForm initially supplies the resolved sources; the
  // launch executor compiles them into one per-session README and replaces this sentence
  // before building provider argv. See src/session-boot.ts and routes/launch.ts.
  const reading = [...boot, ...(form.seed ?? [])].filter(Boolean);
  if (reading.length) parts.push(`Read first: ${reading.join(', ')}.`);
  const prompt = form.prompt?.trim() ?? '';
  const opening = (profile.opening ?? '').replace(/\{prompt\}/g, prompt).trim();
  if (opening) parts.push(`Your task:\n${opening}`);
  if (form.reference) {
    parts.push(
      // RIREKI's tape is the taught-normal catch-up (owner's ruling, 2026-08-20): it is
      // durable and answers without a tile. Pane peek stays as the no-tape fallback only.
      `The session in question is @${form.reference}` +
        (referenceDir ? ` (working in ${referenceDir})` : '') +
        `. Catch up on it with \`tejun-rireki ${form.reference} since\` ` +
        `(\`tejun-peek ${form.reference}\` if it has no tape), and control-check before touching it.`,
    );
  }
  if (form.inject?.trim()) parts.push(form.inject.trim());
  if (profile.ack) parts.push(ACK_RULE);
  // ONE BLOCK PER FACT, a blank line between: a person glancing at the tile sees the team,
  // the desks, the reading and the task as four things, not one run-on sentence.
  return parts.join('\n\n');
}

/**
 * Free text -> a name tmux and `tejun-send` can both address. The transform is
 * character-for-character (each disallowed char becomes `_`), which is what lets
 * the browser show the real name as you type without the caret jumping.
 */
export function sanitizeName(raw: string, max = 40): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, max)
    .replace(/[_-]+$/, '');
}

/**
 * tmux-safe, collision-free session name derived from what was launched and the intent.
 *
 * `intentKind` is the task when there is one and the role otherwise — the more specific
 * of the two, so a board full of `developer_*` sessions does not happen.
 */
export function slugName(intentKind: string, prompt: string, taken: Set<string>): string {
  const base = sanitizeName(`${intentKind}_${prompt}`, 28) || intentKind;
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * The birth reading list, plus THE TEAM-BUILDING SOP for a lead launch.
 * A session_role that is some family's `default_lead_role` is the coordinating kind of
 * work, and its launch carries `ronin_sops/teams.md` — how to raise supporting sessions
 * and place them into a team. Route 1 of two: route 2 is the `team_lead` designation on
 * a live session (routes/teams-api.ts), because leadership is designated, not derived,
 * and whoever actually leads must get the reading whichever way they came to it.
 * The owner's sops store shadows the shipped page file-for-file, same as every SOP.
 */
async function bootReading(
  projectRoot: string,
  mcpOn: boolean,
  bornLead = false,
  routineReading: string[] = [],
  routineMacros?: ReadonlySet<string>,
  session = '',
): Promise<string[]> {
  const files = await bootFiles(projectRoot, mcpOn, routineReading, routineMacros, session);
  // Team leadership is explicit; no selected reading infers it.
  if (bornLead && !files.includes(teamsSopPath())) files.push(teamsSopPath());
  return files;
}

/** The teams SOP — the owner's shadow when it exists, else the shipped page. */
export function teamsSopPath(): string {
  const user = path.join(storeDir('sops'), 'teams.md');
  return existsSync(user) ? user : path.join(REPO_ROOT, 'ronin_sops', 'teams.md');
}

export async function resolveForm(
  form: SpawnForm,
  taken: Set<string>,
  referenceDir?: string,
  proposedRoster?: TeamRoster,
): Promise<Resolved> {
  const sessionType = form.session_type ?? 'cowork_agent';
  const coworkAgent = sessionType === 'cowork_agent';
  const bareMetalAgent = sessionType === 'bare_metal_agent';
  const campaignId = coworkAgent ? (form.campaign_id || await initialCampaignId()) : '';
  const [taskDef, roots, launchSpecs, agentsSet, campaign, routineCatalog, desksSet] = await Promise.all([
    findDefinition('session_roles', form.session_role ?? ''),
    listProjectRoots(),
    listSessionLaunchSpecs(),
    readAgentsSection(),
    coworkAgent ? readCampaign(campaignId) : null,
    listRoutines(),
    readDesksSection(),
  ]);
  const preset = await templateProvenance(coworkAgent ? form : {});
  // A NAMED axis that does not resolve is a refusal, never a silent blank. Blank and
  // wrong are different launches, and only one of them is what the caller asked for.
  if (form.session_role && !taskDef) {
    throw new Error(`Unknown session_role "${form.session_role}" (see ronin_catalogs/session_roles/).`);
  }
  // THE TEAM resolves through its ROSTER when it has one — the durable half, and the
  // context a launch inherits. A TAG-ONLY TEAM IS AN ORDINARY TEAM (owner, 2026-08-26,
  // overruling the refusal that stood here: "this shouldn't have happened"): most teams
  // on a box are their sessions' tags and nothing more, and being born onto one is the
  // same act as being tagged onto it afterwards. With no roster the launch inherits no
  // root and no objective — it is told so — and its wipeboard is the team's own name.
  if (form.team && !isTeamName(form.team)) {
    throw new Error(`A team name is lowercase letters, digits, _ and - (it is also the tag): "${form.team}".`);
  }
  const roster = coworkAgent && form.team
    ? (proposedRoster?.name === form.team
        ? proposedRoster
        : await readTeamRoster(form.team, campaignId) ?? await readTeamRoster(form.team, ''))
    : null;
  // THE CASCADE, and every refusal it makes happens here — before a session exists.
  const profile = resolveHouseSeatProfile(form.house_seat, resolveLaunchProfile(taskDef));
  const parentSeed = coworkAgent && campaign
    ? resolveLaunchSeed({
        campaign,
        roster,
        roots,
        sessions: agentsSet.sessions as SessionsDefaults | undefined,
        routines: routineCatalog,
        desk: desksSet.new_project === 'none' ? 'none' : 'own',
      })
    : null;

  // PROJECT_ROOT IS REQUIRED, and omission is not a third answer: first the launch's
  // own say, then the TEAM's default (the roster is the context a team launch inherits),
  // then the top ACTIVE root, exactly as the launcher's picker does. An archived root
  // stays resolvable BY NAME (a name that used to launch must never stop meaning what
  // it meant); it is only the defaults that skip them.
  const active = roots.filter((r) => !r.archived);
  const rosterRoot = roster?.project_root ? roots.find((r) => r.name === roster.project_root) : undefined;
  const root = form.project_root
    ? roots.find((r) => r.name === form.project_root)
    : bareMetalAgent
      ? undefined
      : (rosterRoot && !rosterRoot.archived ? rosterRoot : active[0]);
  if (form.project_root && !root) {
    throw new Error(`Unknown project_root "${form.project_root}" (see your PROJECT_ROOTS.md).`);
  }
  if (!root) {
    throw new Error(
      bareMetalAgent
        ? 'A `bare_metal_agent` requires `project_root` for its working directory; Ronin does not derive one from a Team or Campaign.'
        : 'This box has no active project_root, so there is nowhere to be born. ' +
        'Add or unarchive one in ⚙ Configuration, then launch again.',
    );
  }
  // Made here, on the way past, because this is the one place that knows every root by
  // name — so a shelf folder exists for each of them without anything having to remember.
  await ensureShelf(roots.map((r) => r.name));

  // A name you typed is used as typed (sanitized, never de-duplicated): if it is
  // taken you get told, rather than quietly ending up in `foo-2` and sending your
  // next instruction to `foo`. Only a derived name is allowed to grow a suffix.
  const wanted = form.name ? sanitizeName(form.name) : '';
  if (form.name && !wanted) {
    throw new Error(`"${form.name}" has no usable characters for a session name.`);
  }

  // `agent: none` — a plain terminal. There is no CLI to launch and no brief to
  // compose, so both resolve EMPTY here rather than falling through to the default
  // `claude`: the tile is meant to be left at a shell prompt, untouched.
  const agent = sessionType === 'terminal' ? false : bareMetalAgent ? true : profile.agent;
  const routines = resolveAgentRoutines(
    routineCatalog, campaign?.config.agent_defaults.routines,
    roster?.routines, form.routines, agent,
  );
  // WHICH COMMAND — every rule, every refusal and both owner defaults live in
  // `src/launch-command.ts`. It is the one concern on this path that is decided by data
  // the owner controls rather than by anything the launch form knows, and it had grown
  // three interleaved layers of comment inside this function.
  //
  // MCP off, below, appends the provider's own declared flags to whatever comes back —
  // data from the same table the cmd came from, matched by the cmd string itself, so a
  // hand-typed cmd (no table row) is honestly unsupported. No flags declared = REFUSE,
  // because a session the owner asked to launch disconnected must never launch connected.
  // THE CAMPAIGN ANSWERS FIRST, ⚙ UNDERNEATH (CAMPAIGN_WORKBENCH leg 4b, 2026-08-30): a
  // launch born into a Campaign reads that Campaign's `config.agent_defaults` — the same
  // `{ default, by_provider }` shape the #/campaign surface writes — merged over ⚙'s
  // `agents.sessions` by the subset rule in `mergeSessionDefaults`. The resolver never
  // learns there were two layers; it sees one configuration, and who supplied each half
  // is kept beside it for the reading below.
  const merged = mergeSessionDefaults(agentsSet.sessions as SessionsDefaults | undefined, campaign?.config.agent_defaults);
  const sessionsSet = merged.sessions;
  const chosen = resolveLaunchCommand({
    agent,
    cmd: form.cmd,
    model: form.model,
    provider: form.provider,
    specs: launchSpecs,
    sessions: sessionsSet,
  });
  const dflt = sessionsSet.default;
  let cmd = chosen.cmd;
  // The row this cmd came out of, matched BEFORE the MCP-off flags are appended below —
  // appending changes the very string the match is on, and looking it up afterwards would
  // find nothing for exactly the launches that asked for something unusual. It carried the
  // provider too until 2026-08-17, for a roster column the owner then cut to the model.
  const spec = launchSpecs.find((b) => b.cmd === cmd);
  const launchMode = agent ? (form.launch_mode ?? parentSeed?.seeds.launch_mode.value ?? 'live_dangerously') as LaunchMode : 'configured';
  if (launchMode === 'live_dangerously') {
    if (!spec?.liveDangerously) {
      throw new Error('This launch command declares no `live_dangerously:` flag in the launch table, so it cannot launch Dangerously (see ronin_catalogs/PROJECT_ROOTS.md).');
    }
    cmd = `${cmd} ${spec.liveDangerously}`;
  }
  // The launch's own say, and failing that the kind's default from the catalog. A kind
  // marked `mcp: always` is connected whatever anyone asked; the contradicting ask is
  // caught below rather than quietly overridden.
  // MCP requests are a projection of the same resolved Routine answer. An enabled
  // Routine which declares connections turns the provider's MCP door on; no separate
  // gbrain/session switch is consulted. An explicit launch may still request MCP for
  // connections outside the Routine catalog.
  const routineMcp = routines
    .filter((routine) => routine.enabled)
    .flatMap((routine) => routine.mcp);
  // THE TEMPLATE'S gbrain DELIVERS THROUGH THE LANDED CONTROL (ruled 2026-09-01): a
  // picked agent template carrying `routines_on: gbrain` resolves gbrain_mode to
  // connected when the launch did not state one — the explicit hand still wins, and
  // the receipt names the template as the source below.
  const templateGbrain = preset.template?.routines_on.includes('gbrain') ? 'connected' as const : undefined;
  const gbrainAnswer = form.gbrain_mode ?? templateGbrain ?? parentSeed?.seeds.gbrain_mode.value;
  const mcpWanted = profile.mcpAlways || routineMcp.length > 0
    ? true
    : gbrainAnswer === 'connected'
      ? true
      : gbrainAnswer === 'disconnected'
        ? false
        : profile.mcpDefault;
  // Somebody ASKED for off, as against off being merely what this kind defaults to. The
  // two are refused differently below, and only this one is a promise Ronin made.
  const askedOff = agent && form.gbrain_mode === 'disconnected';
  let mcpOffWanted = agent && !mcpWanted;
  // A kind marked `mcp: always` is BORN connected (owner's ruling, 2026-08-17): the
  // launcher never offers the toggle for it, and a launch that asks anyway (a macro, a
  // hand-built request) is refused rather than silently connected or disconnected.
  if (askedOff && profile.mcpAlways) {
    throw new Error(
      `${profile.session_role} is born connected (\`mcp: always\`) — ` +
        'it cannot be launched with MCP off.',
    );
  }
  if (mcpOffWanted && !spec?.gbrainDisconnected) {
    // Asked for and undeliverable is a broken promise: refuse, rather than launch a
    // session the receipt would call disconnected.
    if (askedOff) {
      throw new Error(
        'This launch command declares no `gbrain_disconnected:` tokens in the launch table, ' +
          'so it cannot launch with gbrain disconnected (see ronin_catalogs/PROJECT_ROOTS.md).',
      );
    }
    // Merely the profile's default, and this provider cannot do it. Since 2026-08-22 that
    // default is off for every ordinary launch, so refusing here would leave a box whose
    // launch table has no `gbrain_disconnected:` row — or that fell through to the bare fallback cmd —
    // unable to launch ANYTHING. The launch goes ahead connected and the receipt says
    // `gbrain_mode: connected`, which is the truth; a default may degrade, a promise may not.
    mcpOffWanted = false;
  }
  if (mcpOffWanted) cmd = `${cmd} ${spec!.gbrainDisconnected}`;

  // ATTRIBUTION IS RESOLVED BESIDE THE VALUES. Keeping it here means launch and preflight
  // cannot disagree and the browser never has to reconstruct the cascade. A source is an
  // exact file when one stated the value, or a named runtime input when no file exists.
  const explicit: StatedBy[] = [{ layer: 'launch', source: 'launch request' }];
  const system: StatedBy[] = [{ layer: 'system', source: 'src/spawn.ts' }];
  const rosterSource: StatedBy[] = roster
    ? [{
        layer: 'team_roster',
        source: proposedRoster?.name === roster.name ? 'proposed Team draft' : teamRosterFile(roster.name),
      }]
    : system;
  const rootSource: StatedBy[] = form.project_root
    ? explicit
    : roster?.project_root
      ? rosterSource
      : [{ layer: 'system', source: USER_PROJECT_ROOTS_MD }];
  // Explicit when the launch named either half of it — a raw `cmd` or a model name.
  // Everything else is the install's own default, which is the system's answer.
  // The resolver already said who decided; this only spells its answer as a reading.
  // `settei_provider` is the half-explicit case — this launch named the vendor, ⚙ named
  // the model — and it must not read as though the code chose either.
  // A half-explicit answer names the door that held the model: the Campaign's Agent
  // defaults when that row was the Campaign's own, ⚙ otherwise — never src/spawn.ts.
  const cmdSource: StatedBy[] = chosen.source === 'explicit_launch'
    ? explicit
    : chosen.source === 'settei_provider'
      ? [{ layer: 'system', source: form.provider && merged.providerOwn(form.provider) ? `#/campaign (${campaign?.id ?? form.campaign_id}: agent_defaults)` : '⚙ Configuration (agents.sessions)' }]
      : system;
  const defaultMcpWasUndeliverable = agent && !mcpWanted && !mcpOffWanted;
  const mcpSource: StatedBy[] = !agent
    ? profile.stated_by.agent
    : defaultMcpWasUndeliverable
      ? system
      : form.gbrain_mode !== undefined
        ? explicit
        : templateGbrain !== undefined
          ? preset.source ?? system
          : parentSeed?.seeds.gbrain_mode.stated_by ?? profile.stated_by.mcpDefault;
  const unique = (...groups: StatedBy[][]): StatedBy[] => {
    const seen = new Set<string>();
    return groups.flat().filter((item) => {
      const key = `${item.layer}\0${item.source}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const name = wanted || slugName(profile.session_role || form.team || 'session', form.prompt ?? '', taken);
  const worktreesOn = routines.some((routine) => routine.name === 'ronin_worktrees' && routine.enabled);
  const worktrees = bareMetalAgent || sessionType === 'terminal' || !worktreesOn
    ? { assignment: null, repositories: [] }
    : await resolveLaunchDesks({
    session: name,
    team: form.team ?? '',
    project_root: root.name,
    agent,
    control: worktreesOn,
    desk: form.desk,
  });
  const assignment = worktrees.assignment;
  const enabledReading = routineReading(routines);
  const enabledMacros = new Set(routines.filter((routine) => routine.enabled).flatMap((routine) => routine.macros));
  const kind = form.kind ?? String(parentSeed?.seeds.kind.value ?? 'open');
  const selectedBehaviours = form.behaviours ?? (parentSeed?.seeds.behaviours.value as string[] | undefined) ?? [];
  const resolvedBehaviours = coworkAgent && agent
    ? await resolveBehaviourBooks(selectedBehaviours)
    : { delivered: [], ignored: [] };
  // Compile this once and return the exact same list the brief receives. The browser must
  // never recreate shelf precedence or guess which explicit seeds joined it.
  const shelfReading = coworkAgent && agent
    ? await bootReading(root.name, !mcpOffWanted, !!form.team_lead && !!form.team, enabledReading, enabledMacros, name)
    : [];
  const completeReading = [...shelfReading, ...resolvedBehaviours.delivered.map((book) => book.file)];
  const birthReading = coworkAgent && agent
    ? [...completeReading, ...(form.seed ?? [])].filter(Boolean)
    : [];
  const resolvedMandate = coworkAgent
    ? mandate(form.mandate ?? {
        reach: parentSeed?.seeds.reach.value,
        recruit: parentSeed?.seeds.recruit.value,
        output: parentSeed?.seeds.output.value,
      })
    : mandate(undefined);

  return {
    session_type: sessionType,
    name,
    // The profile's own `dir:` WINS over the project_root's, because it is a constant of
    // the launch — the same category as its dial, and a launch must not be able to leave
    // it to chance. Exactly one definition carries one (`mikaassist`, `{install}`): she
    // works on Ronin's own business. Otherwise the 2x2 location wins.
    dir: profileDir(profile) || primaryWorkLocation(worktrees.repositories, root.name) || root.dir || '',
    assignment,
    work_locations: worktrees.repositories,
    cmd,
    // Born onto a team = tagged into it, through the same membership the roster derives
    // from. The team rides FIRST so a truncated list can never drop the birth team.
    tags: [...(form.team ? [form.team] : []), ...(form.tags ?? [])]
      .filter(Boolean)
      .filter((t, i, a) => a.indexOf(t) === i)
      .slice(0, 16),
    dial: form.dial ?? (parentSeed?.seeds.dial.value as Dial | undefined) ?? profile.dial,
    session_role: profile.session_role,
    mandate: resolvedMandate,
    team: form.team ?? '',
    project_root: root.name,
    // The shelf follows the toggle (owner's ruling, 2026-08-17): a session launched with
    // MCP off reads no *_connected shelf — the tools and the reading list about them ride
    // the same choice. The root, role and task shelves are untouched by it.
    brief: coworkAgent && agent
      ? buildBrief(
          profile,
          root,
          form,
          referenceDir,
          completeReading,
          roster,
          assignment,
          worktrees.repositories,
        )
      : '',
    agent,
    capExempt: profile.capExempt,
    gbrain_mode: mcpOffWanted ? 'disconnected' : 'connected',
    // `claude --model opus` -> `claude`; `/opt/homebrew/bin/codex --model …` -> `codex`.
    // The first word, basenamed, because the launch table's cells are commands and a cell
    // is free to name a path. RIREKI's decoder keys are bare binary names, and this value
    // is written into the option RIREKI reads, so it has to arrive in RIREKI's spelling.
    launchAgent: agent ? path.basename(cmd.trim().split(/\s+/)[0] ?? '') : '',
    launch_mode: launchMode,
    ack: profile.ack,
    opening: profile.opening,
    posture: profile.posture,
    label: profile.label,
    mcpAlways: profile.mcpAlways,
    mcpDefault: profile.mcpDefault,
    team_objective: roster?.objective ?? '',
    team_branch: roster?.branch ?? '',
    team_wipeboard: roster?.wipeboard ?? '',
    team_state: roster?.state ?? '',
    birth_reading: birthReading,
    behaviours: resolvedBehaviours.delivered,
    kind,
    ignored: [
      ...resolvedBehaviours.ignored,
      ...preset.ignored,
    ],
    routines,
    stated_by: {
      name: form.name ? explicit : system,
      dir: profile.dir ? profile.stated_by.dir : assignment ? system : rootSource,
      assignment: form.desk ? explicit : system,
      cmd: cmdSource,
      tags: unique(roster ? rosterSource : [], form.tags?.length ? explicit : []),
      session_type: explicit,
      session_role: form.session_role !== undefined ? explicit : profile.stated_by.session_role,
      template: preset.source ?? system,
      mandate: form.mandate ? (preset.mandate ? preset.source! : explicit) : parentSeed?.seeds.reach.stated_by ?? (campaign
        ? [{ layer: 'campaign', source: `#/campaign (${campaign.id}: agent_defaults)` }]
        : system),
      team: form.team ? explicit : system,
      project_root: rootSource,
      dial: form.dial !== undefined ? explicit : parentSeed?.seeds.dial.stated_by ?? profile.stated_by.dial,
      brief: unique(preset.brief ? preset.source! : explicit,
        profile.stated_by.opening, roster ? rosterSource : [], rootSource),
      agent: profile.stated_by.agent,
      capExempt: profile.stated_by.capExempt,
      gbrain_mode: mcpSource,
      launchAgent: cmdSource,
      launch_mode: form.launch_mode !== undefined
        ? explicit
        : parentSeed?.seeds.launch_mode.stated_by ?? system,
      ack: profile.stated_by.ack,
      opening: profile.stated_by.opening,
      posture: profile.stated_by.posture,
      label: profile.stated_by.label,
      mcpAlways: profile.stated_by.mcpAlways,
      mcpDefault: profile.stated_by.mcpDefault,
      team_objective: rosterSource,
      team_branch: rosterSource,
      team_wipeboard: rosterSource,
      team_state: rosterSource,
      birth_reading: unique(system, form.seed?.length ? explicit : []),
      behaviours: form.behaviours !== undefined
        ? (preset.behaviours ? preset.source! : explicit)
        : parentSeed?.seeds.behaviours.stated_by ?? system,
      kind: form.kind !== undefined ? explicit : parentSeed?.seeds.kind.stated_by ?? system,
      routines: form.routines && Object.keys(routineChoices(form.routines)).length
        ? explicit
        : parentSeed?.routines.flatMap((routine) => routine.stated_by) ?? system,
    },
  };
}
