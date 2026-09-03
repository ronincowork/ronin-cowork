import { existsSync } from 'node:fs';
import path from 'node:path';
import { mergeSessionDefaults, resolveLaunchCommand, type SessionsDefaults } from './launch-command.js';
import { REPO_ROOT } from './resources.js';
import { bootFiles, ensureShelf } from './birth-readme.js';
import { listProjectRoots, listSessionLaunchSpecs, USER_PROJECT_ROOTS_MD, type ProjectRootInfo } from './project-roots.js';
import { readAgentsSection, readDesksSection } from './machine-state.js';
import { storeDir } from './resources.js';
import { findDefinition, listRoutines, routineReading } from './resource-adapters.js';
import { isCreatableTeamName as isTeamName, readTeamRoster, teamRosterFile, type TeamRoster } from './team-rosters.js';
import { resolveLaunchProfile, type Dial, type LaunchProfile, type StatedBy } from './launch-profile.js';
import { readCampaign } from './campaigns.js';
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

export interface SpawnForm {
  session_type?: 'cowork_agent' | 'bare_metal_agent' | 'terminal';
  house_seat?: HouseSeat;
  session_role?: string;
  team?: string;
  team_lead?: boolean;
  model?: string;
  provider?: string;
  mandate?: Partial<Mandate>;
  campaign_id?: string;
  kind?: string;
  behaviours?: string[]; template?: string; // preset is validated provenance only, never reapplied
  routines?: Record<string, boolean>;
  prompt?: string;
  name?: string;
  dial?: Dial;
  project_root?: string;
  cmd?: string;
  launch_mode?: LaunchMode;
  gbrain_mode?: 'connected' | 'disconnected';
  tags?: string[];
  seed?: string[];
  inject?: string;
  reference?: string;
  desk?: DeskChoice;
  repos?: string[];
}

export interface Resolved {
  session_type: 'cowork_agent' | 'bare_metal_agent' | 'terminal';
  name: string;
  dir: string;
  cmd: string;
  tags: string[];
  dial: Dial;
  session_role: string;
  mandate: Mandate;
  team: string;
  project_root: string;
  assignment: Assignment | null;
  work_locations: ResolvedWorktreesRepository[];
  brief: string;
  agent: boolean;
  capExempt: boolean;
  gbrain_mode: 'connected' | 'disconnected';
  launchAgent: string;
  launch_mode: LaunchMode;
  ack: boolean;
  opening: string;
  posture: string[];
  label: string;
  mcpAlways: boolean;
  mcpDefault: boolean;
  team_objective: string;
  team_branch: string;
  team_wipeboard: string;
  team_state: '' | 'active' | 'archived';
  birth_reading: string[];
  behaviours: DeliveredBehaviour[];
  kind: string;
  ignored: string[];
  routines: ResolvedRoutine[];
  stated_by: Record<string, StatedBy[]>;
}

const ACK_RULE =
  'Before doing anything else: report back in your own words what you understand this job to be, ' +
  'what you will NOT do (no code, no builds, no commits until the owner says go), and anything ' +
  'that is unclear or looks wrong. Then wait for the owner.';

export function buildBrief(
  profile: LaunchProfile,
  root: ProjectRootInfo | undefined,
  form: SpawnForm,
  referenceDir?: string,
  boot: string[] = [],
  roster?: TeamRoster | null,
  assignment?: Assignment | null,
  workLocations: ResolvedWorktreesRepository[] = [],
  resolvedMandate: Mandate = mandate(form.mandate),
): string {
  const parts: string[] = [];
  if (profile.posture.length) parts.push(`You are the ${profile.label}. ${profile.posture.join(' ')}`);
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
  // THE LAUNCH CONTRACT, IN THE PROMPT. These are suggestions the Agent reads, never
  // controls Ronin enforces. `open` means the owner stated no constraint, so silence is
  // the honest rendering; only actual choices deserve prompt space. Output is plural by
  // design. Leadership is a designation, not a mandate axis, and is named only when the
  // Agent is actually born onto a team as its lead.
  const mandateLines: string[] = [];
  if (resolvedMandate.reach !== 'open') mandateLines.push(`Reach: ${resolvedMandate.reach}`);
  if (resolvedMandate.recruit !== 'open') mandateLines.push(`Recruit: ${resolvedMandate.recruit}`);
  const outputs = resolvedMandate.output.filter((value) => value !== 'open');
  if (outputs.length) mandateLines.push(`Output: ${outputs.join(', ')}`);
  const birthContract = [
    ...(form.team && form.team_lead ? ['Designation: Team Lead'] : []),
    ...mandateLines,
  ];
  if (birthContract.length) parts.push(birthContract.join('\n'));
  if (workLocations.length) parts.push(renderWorkLocations(workLocations, roster?.branches ?? {}));
  if (root) parts.push(`Born in ${root.name} at ${root.dir}.`);
  if (assignment?.desks.length) parts.push(renderDeskBlock(assignment));
  const reading = [...boot, ...(form.seed ?? [])].filter(Boolean);
  if (reading.length) parts.push(`Read first: ${reading.join(', ')}.`);
  const prompt = form.prompt?.trim() ?? '';
  const opening = (profile.opening ?? '').replace(/\{prompt\}/g, prompt).trim();
  if (opening) parts.push(`Your task:\n${opening}`);
  if (form.reference) {
    parts.push(
      `The session in question is @${form.reference}` +
        (referenceDir ? ` (working in ${referenceDir})` : '') +
        `. Catch up on it with \`tejun-rireki ${form.reference} since\` ` +
        `(\`tejun-peek ${form.reference}\` if it has no tape), and control-check before touching it.`,
    );
  }
  if (form.inject?.trim()) parts.push(form.inject.trim());
  if (profile.ack) parts.push(ACK_RULE);
  return parts.join('\n\n');
}

export function sanitizeName(raw: string, max = 40): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, max)
    .replace(/[_-]+$/, '');
}

export function slugName(intentKind: string, prompt: string, taken: Set<string>): string {
  const base = sanitizeName(`${intentKind}_${prompt}`, 28) || intentKind;
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

async function bootReading(
  projectRoot: string,
  mcpOn: boolean,
  bornLead = false,
  routineReading: string[] = [],
  routineMacros?: ReadonlySet<string>,
  session = '',
): Promise<string[]> {
  const files = await bootFiles(projectRoot, mcpOn, routineReading, routineMacros, session);
  if (bornLead && !files.includes(teamsSopPath())) files.push(teamsSopPath());
  return files;
}

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
  if (form.session_role && !taskDef) {
    throw new Error(`Unknown session_role "${form.session_role}" (see ronin_catalogs/session_roles/).`);
  }
  if (form.team && !isTeamName(form.team)) {
    throw new Error(`A team name is lowercase letters, digits, _ and - (it is also the tag): "${form.team}".`);
  }
  const roster = coworkAgent && form.team
    ? (proposedRoster?.name === form.team
        ? proposedRoster
        : await readTeamRoster(form.team, campaignId) ?? await readTeamRoster(form.team, ''))
    : null;
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
  await ensureShelf(roots.map((r) => r.name));

  const wanted = form.name ? sanitizeName(form.name) : '';
  if (form.name && !wanted) {
    throw new Error(`"${form.name}" has no usable characters for a session name.`);
  }

  const agent = sessionType === 'terminal' ? false : bareMetalAgent ? true : profile.agent;
  const routines = resolveAgentRoutines(
    routineCatalog, campaign?.config.agent_defaults.routines,
    roster?.routines, form.routines, agent,
  );
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
  const spec = launchSpecs.find((b) => b.cmd === cmd);
  const launchMode = agent ? (form.launch_mode ?? parentSeed?.seeds.launch_mode.value ?? 'live_dangerously') as LaunchMode : 'configured';
  if (launchMode === 'live_dangerously') {
    if (!spec?.liveDangerously) {
      throw new Error('This launch command declares no `live_dangerously:` flag in the launch table, so it cannot launch Dangerously (see ronin_catalogs/PROJECT_ROOTS.md).');
    }
    cmd = `${cmd} ${spec.liveDangerously}`;
  }
  const routineMcp = routines
    .filter((routine) => routine.enabled)
    .flatMap((routine) => routine.mcp);
  const templateGbrain = preset.template?.routines_on.includes('gbrain') ? 'connected' as const : undefined;
  const gbrainAnswer = form.gbrain_mode ?? templateGbrain ?? parentSeed?.seeds.gbrain_mode.value;
  const mcpWanted = profile.mcpAlways || routineMcp.length > 0
    ? true
    : gbrainAnswer === 'connected'
      ? true
      : gbrainAnswer === 'disconnected'
        ? false
        : profile.mcpDefault;
  const askedOff = agent && form.gbrain_mode === 'disconnected';
  let mcpOffWanted = agent && !mcpWanted;
  if (askedOff && profile.mcpAlways) {
    throw new Error(
      `${profile.session_role} is born connected (\`mcp: always\`) — ` +
        'it cannot be launched with MCP off.',
    );
  }
  if (mcpOffWanted && !spec?.gbrainDisconnected) {
    if (askedOff) {
      throw new Error(
        'This launch command declares no `gbrain_disconnected:` tokens in the launch table, ' +
          'so it cannot launch with gbrain disconnected (see ronin_catalogs/PROJECT_ROOTS.md).',
      );
    }
    mcpOffWanted = false;
  }
  if (mcpOffWanted) cmd = `${cmd} ${spec!.gbrainDisconnected}`;

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
    repos: form.repos,
  });
  const assignment = worktrees.assignment;
  const enabledReading = routineReading(routines);
  const enabledMacros = new Set(routines.filter((routine) => routine.enabled).flatMap((routine) => routine.macros));
  const kind = form.kind ?? String(parentSeed?.seeds.kind.value ?? 'open');
  const selectedBehaviours = form.behaviours ?? (parentSeed?.seeds.behaviours.value as string[] | undefined) ?? [];
  const resolvedBehaviours = coworkAgent && agent
    ? await resolveBehaviourBooks(selectedBehaviours)
    : { delivered: [], ignored: [] };
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
    dir: profileDir(profile) || primaryWorkLocation(worktrees.repositories, root.name) || root.dir || '',
    assignment,
    work_locations: worktrees.repositories,
    cmd,
    tags: [...(form.team ? [form.team] : []), ...(form.tags ?? [])]
      .filter(Boolean)
      .filter((t, i, a) => a.indexOf(t) === i)
      .slice(0, 16),
    dial: form.dial ?? (parentSeed?.seeds.dial.value as Dial | undefined) ?? profile.dial,
    session_role: profile.session_role,
    mandate: resolvedMandate,
    team: form.team ?? '',
    project_root: root.name,
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
          resolvedMandate,
        )
      : '',
    agent,
    capExempt: profile.capExempt,
    gbrain_mode: mcpOffWanted ? 'disconnected' : 'connected',
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
      assignment: form.desk || form.repos ? explicit : system,
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
