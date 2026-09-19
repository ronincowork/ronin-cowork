import path from 'node:path';
import { mergeSessionDefaults, resolveLaunchCommand, type SessionsDefaults } from './launch-command.js';
import { REPO_ROOT } from './resources.js';
import { bootFiles, ensureShelf } from './birth-readme.js';
import { listProjectRoots, USER_PROJECT_ROOTS_MD, type ProjectRootInfo } from './project-roots.js';
import { listSessionLaunchSpecs } from './model-providers.js';
import { agentSpec } from './agents.js';
import { readAgentsSection, readSetupSection } from './machine-state.js';
import { offAt, readProviderSummary } from './provider-summary.js';
import { storeDir } from './resources.js';
import { contributionReading, listBehaviours, listInstallations } from './resource-adapters.js';
import { isCreatableTeamName as isTeamName, readTeamRoster, teamRosterFile, type TeamRoster } from './team-rosters.js';
import { resolveLaunchProfile, type LaunchProfile, type StatedBy } from './launch-profile.js';
import { readCampaign } from './campaigns.js';
import { primaryWorkLocation, renderDeskBlock, renderWorkLocations, resolveLaunchDesks, type DeskChoice } from './launch-desks.js';
import type { ResolvedWorktreesRepository } from './worktrees-resolution.js';
import type { Assignment } from './desks/schema.js';
import { mandate, type LaunchMode, type Mandate } from './agent-defaults.js';
import { availableBehaviours, resolveContributions, type ResolvedContribution } from './instruction-cascade.js';
import { resolveInstallations, type ResolvedInstallation } from './installations.js';
import { initialCampaignId } from './campaign-scope.js';
import { resolveLaunchSeed } from './launch-seed.js';
import {
  renderSoughtOverview,
  resolveBehaviourBooks,
  resolveConditionalBehaviours,
  resolveFloorBehaviours,
  resolveSoughtBehaviours,
  type DeliveredBehaviour,
} from './behaviours.js';
import { templateProvenance } from './template-provenance.js';
import { profileDir, resolveHouseSeatProfile, type HouseSeat } from './house-seats.js';
import { capabilityTools, renderCapabilitiesOverview, resolveCapabilities, type ResolvedCapability } from './capabilities.js';

const WORKTREE_SOP = path.join(REPO_ROOT, 'ronin_catalogs', 'behaviours', 'conditional', 'worktree-root.md');
const CHECKOUT_SOP = path.join(REPO_ROOT, 'ronin_catalogs', 'behaviours', 'conditional', 'checkout.md');
const CORE_CONTRIBUTION: ResolvedContribution = {
  name: 'cowork_agent', origin: 'stock', shadowed: false, label: 'Cowork Agent', blurb: '',
  reading: [], reading_off: [],
  tools: ['edges', 'session_create', 'session_end', 'session_archive', 'session_restore', 'session_check', 'session_set', 'work-record', 'ronin-url'],
  parts: [], enabled: true, stated_by: 'conditional', required_by: [],
};

export interface SpawnForm {
  session_type?: 'cowork_agent' | 'bare_metal_agent' | 'terminal';
  house_seat?: HouseSeat;
  team?: string;
  team_lead?: boolean;
  model?: string;
  provider?: string;
  mandate?: Partial<Mandate>;
  campaign_id?: string;
  kind?: string;
  behaviours?: string[]; template?: string; // preset is validated provenance only, never reapplied
  prompt?: string;
  name?: string;
  project_root?: string;
  cmd?: string;
  launch_mode?: LaunchMode;
  
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
  mandate: Mandate;
  team: string;
  project_root: string;
  assignment: Assignment | null;
  work_locations: ResolvedWorktreesRepository[];
  brief: string;
  agent: boolean;
  capExempt: boolean;
  launchAgent: string;
  identity?: import('./tmux.js').SessionIdentity;
  launch_mode: LaunchMode;
  ack: boolean;
  opening: string;
  posture: string[];
  label: string;
  team_objective: string;
  team_branch: string;
  team_wipeboard: string;
  team_state: '' | 'active' | 'archived';
  birth_reading: string[];
  behaviours: DeliveredBehaviour[];
  kind: string;
  ignored: string[];
  undelivered: string[];
  contributions: ResolvedContribution[];
  installations: ResolvedInstallation[];
  /** Every capability document, selected or not, with the reason and the tools found. */
  capabilities: ResolvedCapability[];
  /** Every installed Cowork tool plus enabled feature tools, projected onto PATH at birth. */
  capability_tools: string[];
  stated_by: Record<string, StatedBy[]>;
}

const ACK_RULE =
  'Before doing anything else: report back in your own words what you understand this job to be, ' +
  'what you will NOT do (no code, no builds, no commits until the owner says go), and anything ' +
  'that is unclear or looks wrong. Quote the last line of the document you were told to read first — ' +
  'it names itself — so the owner can see the whole packet reached you. Then wait for the owner.';

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
    lines.push(`Wipeboard: ${roster.wipeboard} (edges wipeboard ${roster.wipeboard})`);
    parts.push(lines.join('\n'));
  } else if (form.team) {
    parts.push(
      `You are born onto team "${form.team}" — a tag-only team: its members are the sessions carrying its tag ` +
        `(edges team ${form.team}), it has no durable roster, and its wipeboard is "${form.team}" (edges wipeboard ${form.team}).`,
    );
  }
  const birthTeams = [...new Set([form.team, ...(form.tags ?? [])].filter(Boolean))];
  if (birthTeams.length) {
    parts.push(`Team membership: ${birthTeams.join(', ')}. Run: edges wipeboard — it hands you whatever you have not read. Membership follows the team.`);
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
  if ((form.session_type ?? 'cowork_agent') === 'cowork_agent') {
    parts.push(
      `Repository approaches: read ${CHECKOUT_SOP} when a repository uses its shared checkout; ` +
      `read ${WORKTREE_SOP} when it uses managed worktrees. The repository's RONIN_REPO decides which applies.`,
    );
  }
  if (workLocations.length) parts.push(renderWorkLocations(workLocations, roster?.branches ?? {}));
  if (root) {
    const arrangement = workLocations.find((row) => row.repo === root.name);
    const line = arrangement?.mode === 'managed'
      ? ` Arrangement: worktree root (read ${WORKTREE_SOP} before your first write).`
      : ` Arrangement: checkout (read ${CHECKOUT_SOP} before your first write).`;
    parts.push(`Born in workspace-folder-handle: ${root.name} at path: ${root.dir}.${arrangement ? line : ''}`);
  }
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
        `. Catch up on it with \`edges read ${form.reference}\`, which reads its durable record first ` +
        `and falls back to the live view, then run \`edges control ${form.reference}\` before touching it.`,
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
  routineReading: string[] = [],
  capabilitiesOverview?: string,
  session = '',
  soughtOverview?: string,
): Promise<string[]> {
  return bootFiles(projectRoot, routineReading, capabilitiesOverview, session, soughtOverview);
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
  const [roots, agentsSet, campaign, installationCatalog, behaviourCatalog] = await Promise.all([
    listProjectRoots(),
    readAgentsSection(),
    coworkAgent ? readCampaign(campaignId) : null,
    listInstallations(),
    listBehaviours(),
  ]);
  const launchSpecs = await listSessionLaunchSpecs(campaign?.providers ?? await readProviderSummary());
  const preset = await templateProvenance(coworkAgent ? form : {});
  if (form.team && !isTeamName(form.team)) {
    throw new Error(`A team name is lowercase letters, digits, _ and - (it is also the tag): "${form.team}".`);
  }
  const roster = coworkAgent && form.team
    ? (proposedRoster?.name === form.team
        ? proposedRoster
        : await readTeamRoster(form.team, campaignId) ?? await readTeamRoster(form.team, ''))
    : null;
  const profile = resolveHouseSeatProfile(form.house_seat, resolveLaunchProfile());
  const parentSeed = coworkAgent && campaign
    ? resolveLaunchSeed({
        campaign,
        roster,
        roots,
        sessions: agentsSet.sessions as SessionsDefaults | undefined,
        installations: installationCatalog,
        behaviours: behaviourCatalog,
      })
    : null;

  const active = roots.filter((r) => !r.archived);
  const houseRoot = form.house_seat === 'mika' ? {
    name: 'mika_home', title: '', dir: profileDir(profile), remit: 'Ronin help only', match: [],
    docs: [], plans: [], archived: false, campaign_id: campaignId,
  } : undefined;
  const rosterRoot = roster?.project_root ? roots.find((r) => r.name === roster.project_root) : undefined;
  const root = houseRoot ?? (form.project_root
    ? roots.find((r) => r.name === form.project_root)
    : bareMetalAgent
      ? undefined
      : (rosterRoot && !rosterRoot.archived ? rosterRoot : active[0]));
  if (form.project_root && !root) {
    throw new Error(`No Workspace Folder has the handle "${form.project_root}" (see your PROJECT_ROOTS.md).`);
  }
  if (!root) {
    throw new Error(
      bareMetalAgent
        ? 'A `bare_metal_agent` requires `project_root` for its working directory; Ronin does not derive one from a Team or Campaign.'
        : 'This box has no active project_root, so there is nowhere to be born. ' +
        'Add or unarchive one in ⚙ Configuration, then launch again.',
    );
  }
  if (!houseRoot) await ensureShelf(roots.map((r) => r.name));

  const wanted = form.name ? sanitizeName(form.name) : '';
  if (form.name && !wanted) {
    throw new Error(`"${form.name}" has no usable characters for a session name.`);
  }

  const agent = sessionType === 'terminal' ? false : bareMetalAgent ? true : profile.agent;
  const available = campaign ? availableBehaviours(installationCatalog, campaign.config.installations, behaviourCatalog) : [];
  const cascade = campaign
    ? resolveContributions(installationCatalog, campaign.config.installations, behaviourCatalog, available,
        campaign.config.defaults.behaviours, roster ? [...new Set([...roster.behaviours.selected, ...roster.behaviours.required])] : undefined, form.behaviours)
    : { contributions: [], selected: [], undelivered: [], behaviour_layer: 'campaign' as const };
  const installations = resolveInstallations(installationCatalog, campaign?.config.installations);
  const contributions = form.house_seat === 'mika' ? [] : [CORE_CONTRIBUTION, ...cascade.contributions];
  const merged = mergeSessionDefaults(agentsSet.sessions as SessionsDefaults | undefined, campaign?.config.defaults);
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
  // A provider the owner turned OFF launches nothing new. Its own sentence — not "unknown
  // model", not "not on this machine": it is here, signed in, and set aside. Tiles already
  // running are not this check's business. A provider never activated is not refused
  // here: it launches into its own sign-in in the tile, as it always has.
  if (spec && agent) {
    const off = offAt(await readSetupSection(), spec.cli);
    if (off) {
      const label = agentSpec(spec.cli)?.label ?? spec.cli;
      throw new Error(`${label} is turned off on this machine — Ronin is not using it. Turn it on under Model providers; your sign-in is kept.`);
    }
  }
  const launchMode = agent ? (form.launch_mode ?? parentSeed?.seeds.launch_mode.value ?? 'configured') as LaunchMode : 'configured';
  if (launchMode === 'live_dangerously') {
    if (!spec?.liveDangerously) {
      throw new Error('This launch command declares no `live_dangerously:` flag in the provider catalog, so it cannot launch Dangerously (see ronin_catalogs/MODEL_PROVIDERS.md).');
    }
    cmd = `${cmd} ${spec.liveDangerously}`;
  }
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
      ? [{ layer: 'system', source: form.provider && merged.providerOwn(form.provider) ? `#/campaign (${campaign?.id ?? form.campaign_id}: defaults)` : '⚙ Configuration (agents.sessions)' }]
      : system;
  const unique = (...groups: StatedBy[][]): StatedBy[] => {
    const seen = new Set<string>();
    return groups.flat().filter((item) => {
      const key = `${item.layer}\0${item.source}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const name = wanted || slugName(form.team || (agent ? 'agent' : 'terminal'), form.prompt ?? '', taken);
  const worktrees = bareMetalAgent || sessionType === 'terminal'
    ? { assignment: null, repositories: [] }
    : await resolveLaunchDesks({
    session: name,
    team: form.team ?? '',
    project_root: root.name,
    agent,
    desk: form.desk,
    repos: form.repos,
  });
  const assignment = worktrees.assignment;
  // A MANAGED DESK IS A LAUNCH FACT, NOT A BIRTH-ROOT FACT. An Agent born in a checkout
  // root with a managed desk assigned elsewhere still works at that desk; the desk tools
  // and the worktree capability follow the resolved assignment (bundle_commands, 2026-09-13:
  // three Agents born in the lab checkout with a cowork desk had no desk tool on PATH).
  const managedDesk = !!assignment?.desks.length || worktrees.repositories.some((row) => row.mode === 'managed');
  const arrangement = managedDesk ? 'managed' : worktrees.repositories.length ? 'checkout' : 'none';
  const enabledReading = contributionReading(contributions);
  const kind = form.kind ?? String(parentSeed?.seeds.kind.value ?? 'open');
  const resolvedBehaviours = coworkAgent && agent
    ? await resolveBehaviourBooks(cascade.selected)
    : { delivered: [], ignored: [] };
  const floorBehaviours = coworkAgent && agent ? await resolveFloorBehaviours() : [];
  const conditionalBehaviours = coworkAgent && agent
    ? await resolveConditionalBehaviours({ arrangement, team: !!form.team, lead: !!form.team_lead && !!form.team })
    : [];
  const soughtBehaviours = coworkAgent && agent ? await resolveSoughtBehaviours() : [];
  // CAPABILITY BUNDLES: the folder decides what exists, and facts select the knowledge.
  // Installed Cowork tools remain universal; feature facts decide feature projection.
  // Mika keeps her own curated toolset.
  const capabilities = coworkAgent && agent && form.house_seat !== 'mika'
    ? await resolveCapabilities({
        arrangement,
        installations: new Set(installations.filter((installation) => installation.enabled).map((installation) => installation.name)),
        behaviours: new Set(cascade.selected),
        campaign: !!campaign,
        team: !!form.team,
        lead: !!form.team_lead && !!form.team,
      })
    : [];
  const shelfReading = coworkAgent && agent
    ? await bootReading(
        root.name,
        enabledReading,
        form.house_seat === 'mika' ? undefined : renderCapabilitiesOverview(capabilities),
        name,
        soughtBehaviours.length ? await renderSoughtOverview(soughtBehaviours) : undefined,
      )
    : [];
  // The selected capability documents are reached through the overview's own
  // "Full document" line, not as shelf cards: the packet has a one-read budget and the
  // fullest stock birth already sits within 2 KB of it with the overview inlined.
  const appliedBehaviours = [...floorBehaviours, ...conditionalBehaviours, ...resolvedBehaviours.delivered];
  const glossaryReading = shelfReading.filter((file) => path.basename(file) === 'KOTOBA_GLOSSARY.md');
  const backgroundReading = shelfReading.filter((file) => path.basename(file) !== 'KOTOBA_GLOSSARY.md');
  // Working guidance comes first; Session Boot is background. Keep the rendered glossary
  // last because it is reference and the least costly part of a truncated first window.
  const completeReading = [
    ...appliedBehaviours.map((book) => book.file),
    ...backgroundReading,
    ...glossaryReading,
  ];
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
    // Collaboration is the launch default, not an Agent-selectable setting.
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
    launchAgent: agent ? spec?.cli || path.basename(cmd.trim().split(/\s+/)[0] ?? '') : '',
    identity: { sessionType, cli: agent ? spec?.cli || path.basename(cmd.trim().split(/\s+/)[0] ?? '') : '', provider: spec?.provider || '', model: spec?.model || '' },
    launch_mode: launchMode,
    ack: profile.ack,
    opening: profile.opening,
    posture: profile.posture,
    label: profile.label,
    team_objective: roster?.objective ?? '',
    team_branch: roster?.branch ?? '',
    team_wipeboard: roster?.wipeboard ?? '',
    team_state: roster?.state ?? '',
    birth_reading: birthReading,
    behaviours: appliedBehaviours,
    kind,
    ignored: [
      ...resolvedBehaviours.ignored,
      ...preset.ignored,
    ],
    undelivered: cascade.undelivered,
    contributions,
    installations,
    capabilities,
    capability_tools: capabilityTools(capabilities),
    stated_by: {
      name: form.name ? explicit : system,
      dir: profile.dir ? profile.stated_by.dir : assignment ? system : rootSource,
      assignment: form.desk || form.repos ? explicit : system,
      cmd: cmdSource,
      tags: unique(roster ? rosterSource : [], form.tags?.length ? explicit : []),
      session_type: explicit,
      template: preset.source ?? system,
      mandate: form.mandate ? (preset.mandate ? preset.source! : explicit) : parentSeed?.seeds.reach.stated_by ?? (campaign
        ? [{ layer: 'campaign', source: `#/campaign (${campaign.id}: defaults)` }]
        : system),
      team: form.team ? explicit : system,
      project_root: rootSource,
      brief: unique(preset.brief ? preset.source! : explicit,
        profile.stated_by.opening, roster ? rosterSource : [], rootSource),
      agent: profile.stated_by.agent,
      capExempt: profile.stated_by.capExempt,
      launchAgent: cmdSource,
      launch_mode: form.launch_mode !== undefined
        ? explicit
        : parentSeed?.seeds.launch_mode.stated_by ?? system,
      ack: profile.stated_by.ack,
      opening: profile.stated_by.opening,
      posture: profile.stated_by.posture,
      label: profile.stated_by.label,
      team_objective: rosterSource,
      team_branch: rosterSource,
      team_wipeboard: rosterSource,
      team_state: rosterSource,
      birth_reading: unique(system, form.seed?.length ? explicit : []),
      behaviours: form.behaviours !== undefined
        ? (preset.behaviours ? preset.source! : explicit)
        : parentSeed?.seeds.behaviours.stated_by ?? system,
      kind: form.kind !== undefined ? explicit : parentSeed?.seeds.kind.stated_by ?? system,
      contributions: contributions.flatMap((contribution) => [{ layer: contribution.stated_by, source: `${contribution.stated_by} contribution` }]),
      capabilities: capabilities.length ? [{ layer: 'conditional', source: 'ronin_catalogs/capabilities' }] : [],
      arrangement: worktrees.repositories.length
        ? [{ layer: 'conditional', source: `RONIN_REPO for ${root.name}` }]
        : [],
    },
  };
}
