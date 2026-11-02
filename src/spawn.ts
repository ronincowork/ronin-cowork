import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveLaunchCommand, sessionsFor, type SessionsDefaults } from './launch-command.js';
import { REPO_ROOT } from './resources.js';
import { WORDS_READING, bootFiles, cachedReading, declaredFiles, ensureShelf } from './birth-brief.js';
import { listProjectRoots, USER_PROJECT_ROOTS_MD, type ProjectRootInfo } from './project-roots.js';
import { listSessionLaunchSpecs } from './model-providers.js';
import { agentSpec } from './agents.js';
import { readAgentsSection, readSetupSection } from './machine-state.js';
import { offAt, readProviderSummary } from './provider-summary.js';
import { storeDir } from './resources.js';
import { contributionReading, listBehaviours, listInstallations } from './resource-adapters.js';
import { isCreatableTeamName as isTeamName, listTeamRosters, readTeamRoster, teamRosterFile, type TeamRoster } from './team-rosters.js';
import { resolveLaunchProfile, type LaunchProfile, type StatedBy } from './launch-profile.js';
import { readCampaign } from './campaigns.js';
import { readWorkspace, roninHouse, workspaceLaunchFolder, type Workspace } from './workspaces.js';
import { arrangementOf, desksManaged } from './desks/arrangement.js';
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
import { renderCapabilitiesOverview, resolveCapabilities, type ResolvedCapability } from './capabilities.js';

const CORE_CONTRIBUTION: ResolvedContribution = {
  name: 'cowork_agent', origin: 'stock', shadowed: false, label: 'Cowork Agent', blurb: '',
  reading: [], reading_off: [],
  parts: [], enabled: true, stated_by: 'conditional', required_by: [],
};

export interface SpawnForm {
  session_type?: 'cowork_agent' | 'bare_metal_agent' | 'terminal';
  house_seat?: HouseSeat;
  team?: string;
  team_lead?: boolean;
  role?: 'coworker' | 'lead' | 'epic_lead' | 'coordinator';
  model?: string;
  provider?: string;
  mandate?: Partial<Mandate>;
  campaign_id?: string;
  kind?: string;
  behaviours?: string[]; template?: string; // preset is validated provenance only, never reapplied
  prompt?: string;
  name?: string;
  cmd?: string;
  
  tags?: string[];
  seed?: string[];
  inject?: string;
  reference?: string;
}

export interface Resolved {
  session_type: 'cowork_agent' | 'bare_metal_agent' | 'terminal';
  name: string;
  dir: string;
  cmd: string;
  tags: string[];
  mandate: Mandate;
  team: string;
  /** The Workspace the Agent is launched in; '' for none (it starts in Ronin house). */
  workspace: string;
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
  stated_by: Record<string, StatedBy[]>;
}

const ACK_RULE =
  'Before doing anything else: report back in your own words what you understand this job to be, ' +
  'what you will NOT do (no code, no builds, no commits until the owner says go), and anything ' +
  'that is unclear or looks wrong. Quote the last line of the document you were told to read first — ' +
  'it names itself — so the owner can see the whole packet reached you. Then wait for the owner.';

/** THE WORKSPACE SECTION of the birth brief (owner-approved wording, 2026-11-01): what the
 * Agent's project is and the places it works in. Agents read it; no tables. */
export function renderWorkspaceSection(
  workspace: Workspace,
  repositories: { name: string; dir: string; note: string; managed: boolean }[],
  folders: { name: string; dir: string; note: string }[],
): string {
  const lines = [`## Workspace — ${workspace.title || workspace.name}`];
  if (workspace.objective) lines.push('', workspace.objective);
  if (workspace.instructions) lines.push('', workspace.instructions);
  if (repositories.length) {
    lines.push('', 'Repositories, opened when your work needs one:');
    for (const repo of repositories) {
      const how = repo.managed ? `worktree: \`worktree-desk open ${repo.name}\`` : 'shared checkout';
      lines.push(`- ${repo.name} ${repo.dir} — ${how}${repo.note ? ` (${repo.note})` : ''}`);
    }
  }
  if (folders.length) {
    lines.push('', 'Folders:');
    for (const folder of folders) lines.push(`- ${folder.name} ${folder.dir}${folder.note ? ` — ${folder.note}` : ''}`);
  }
  return lines.join('\n');
}

export function buildBrief(
  profile: LaunchProfile,
  workspaceSection: string,
  form: SpawnForm,
  referenceDir?: string,
  boot: string[] = [],
  roster?: TeamRoster | null,
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
  if (workspaceSection) parts.push(workspaceSection);
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

/** THE AGENT'S OWN MANDATE, in its Mandates page: the floor page teaches what each value
 * means; the packet copy adds the values this Agent holds, so a resent brief carries a change. */
async function ownMandates(file: string, held: Mandate, session: string): Promise<string> {
  const page = (await readFile(file, 'utf8')).trimEnd();
  const yours = `**Yours:** Reach \`${held.reach}\` · Recruit \`${held.recruit}\` · Output \`${held.output.join('`, `')}\`.`;
  return cachedReading('MANDATES.md', `${page}\n\n${yours}\n`, session);
}

/** The form's mandate, or the level above's when the form states none. */
function resolveMandate(form: SpawnForm, facts: { coworkAgent: boolean; parentSeed?: { seeds: { reach: { value: unknown }; recruit: { value: unknown }; output: { value: unknown } } } | null }): Mandate {
  return facts.coworkAgent
    ? mandate(form.mandate ?? {
        reach: facts.parentSeed?.seeds.reach.value,
        recruit: facts.parentSeed?.seeds.recruit.value,
        output: facts.parentSeed?.seeds.output.value,
      })
    : mandate(undefined);
}

/** THE FACTS a launch and a running Agent share: Campaign, Team, root, desk arrangement, the
 * behaviour cascade, the name. Launching builds on them; so does a brief rebuilt later for an
 * Agent whose configuration changed (Update, owner 2026-10-24), which never launches. */
export async function resolveFacts(form: SpawnForm, taken: Set<string>, proposedRoster?: TeamRoster) {
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
  const workspace: Workspace | null = roster?.workspace ? await readWorkspace(roster.campaign_id || campaignId, roster.workspace) : null;
  if (roster?.workspace && !workspace) throw new Error(`Team "${roster.name}" is launched in Workspace "${roster.workspace}", which does not exist.`);
  const profile = resolveHouseSeatProfile(form.house_seat, resolveLaunchProfile());
  const parentSeed = coworkAgent && campaign
    ? resolveLaunchSeed({
        campaign,
        roster,
        workspace,
        sessions: agentsSet.sessions as SessionsDefaults | undefined,
        lead: !!form.team && !!form.team_lead,
        installations: installationCatalog,
        behaviours: behaviourCatalog,
      })
    : null;

  // WHERE AN AGENT STARTS is Ronin's (owner, 2026-11-01): a Team's Agents in their Workspace's
  // launch folder, every other Agent in Ronin house. Mika keeps her own home.
  const place = form.house_seat === 'mika'
    ? profileDir(profile)
    : workspace ? workspaceLaunchFolder(workspace.campaign_id, workspace.name) : roninHouse();
  await mkdir(place, { recursive: true });
  if (workspace) await ensureShelf([workspace.name]);

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
  const name = wanted || slugName(form.team || (agent ? 'agent' : 'terminal'), form.prompt ?? '', taken);
  // Repositories are the Workspace's; an Agent opens a worktree when its work needs one.
  const repositories = await Promise.all((workspace?.repos ?? []).map(async (repo) => {
    const arrangement = await arrangementOf(repo.name, roots).catch(() => null);
    return { ...repo, dir: arrangement?.dir ?? roots.find((root) => root.name === repo.name)?.dir ?? '', managed: !!arrangement && desksManaged(arrangement) };
  }));
  const folders = (workspace?.folders ?? []).map((folder) => ({ ...folder, dir: roots.find((root) => root.name === folder.name)?.dir ?? '' }));
  const arrangement: 'managed' | 'checkout' | 'none' = repositories.some((repo) => repo.managed) ? 'managed' : repositories.length ? 'checkout' : 'none';
  const kind = form.kind ?? String(parentSeed?.seeds.kind.value ?? 'open');
  return {
    sessionType, coworkAgent, bareMetalAgent, campaignId, roots, agentsSet, campaign, launchSpecs, preset, roster, profile,
    parentSeed, workspace, place, repositories, folders, agent, cascade, installations, contributions, name, arrangement, kind,
  };
}
export type LaunchFacts = Awaited<ReturnType<typeof resolveFacts>>;

/** THE LAUNCH: which command runs, the provider switch, the Dangerously form. Only a launch
 * comes through here; a brief rebuilt for a running Agent takes the facts and the reading alone. */
async function resolveLaunch(form: SpawnForm, facts: LaunchFacts) {
  const { agent, agentsSet, launchSpecs, parentSeed } = facts;
  const sessionsSet = sessionsFor(agentsSet.sessions as SessionsDefaults | undefined, !!form.team && !!form.team_lead);
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
  // Mode is the Workspace's; Dangerously where the provider declares it, Native otherwise.
  const wanted = agent ? (parentSeed?.seeds.launch_mode.value ?? 'configured') as LaunchMode : 'configured';
  const launchMode: LaunchMode = wanted === 'live_dangerously' && spec?.dangerousCmd ? 'live_dangerously' : 'configured';
  if (launchMode === 'live_dangerously' && spec?.dangerousCmd) cmd = spec.dangerousCmd;
  return { cmd, spec, chosen, launchMode };
}

/** THE READING: the behaviours (floor, conditional, chosen), the capabilities and the shelf,
 * as the birth packet lists them, from the facts alone. */
export async function resolveReading(form: SpawnForm, facts: LaunchFacts) {
  const { coworkAgent, agent, contributions, cascade, arrangement, campaign, installations, workspace, name } = facts;
  const enabledReading = contributionReading(contributions);
  // A house Agent (Mika) is born on the floor and her own conditional brief; the cowork
  // briefs, selected and sought behaviours, capabilities and the shelf are a cowork Agent's.
  const briefed = coworkAgent && agent;
  const cowork = briefed && form.house_seat !== 'mika';
  const resolvedBehaviours = cowork
    ? await resolveBehaviourBooks(cascade.selected)
    : { delivered: [], ignored: [] };
  const floorBehaviours = briefed ? await resolveFloorBehaviours() : [];
  const conditionalBehaviours = briefed
    ? await Promise.all((await resolveConditionalBehaviours({
        arrangement,
        role: cowork ? form.role ?? (form.team_lead ? 'lead' : 'coworker') : 'mika',
        team: !!form.team,
        lead: !!form.team_lead && !!form.team,
        cowork,
        new_owner: !(await listTeamRosters()).some((roster) => roster.campaign_id === (campaign?.id ?? '') && roster.state !== 'archived'),
      })).map(async (row) => row.book === 'mandates'
        ? { ...row, file: await ownMandates(row.file, resolveMandate(form, facts), name) }
        : row))
    : [];
  const conditionalReading = conditionalBehaviours.flatMap((row) => row.reading ?? []);
  const soughtBehaviours = cowork ? await resolveSoughtBehaviours() : [];
  // CAPABILITY BUNDLES: the folder decides what exists, and facts select the knowledge.
  // Installed Cowork tools remain universal; feature facts decide feature projection.
  // Mika keeps her own curated toolset.
  const capabilities = cowork
    ? await resolveCapabilities({
        arrangement,
        installations: new Set(installations.filter((installation) => installation.enabled).map((installation) => installation.name)),
        behaviours: new Set(cascade.selected),
        campaign: !!campaign,
        team: !!form.team,
        lead: !!form.team_lead && !!form.team,
      })
    : [];
  const shelfReading = cowork
    ? await bootReading(
        workspace?.name ?? '',
        [...enabledReading, ...conditionalReading],
        renderCapabilitiesOverview(capabilities),
        name,
        soughtBehaviours.length ? await renderSoughtOverview(soughtBehaviours) : undefined,
      )
    : briefed ? await declaredFiles(conditionalReading) : [];
  // The selected capability documents are reached through the overview's own
  // "Full document" line, not as shelf cards: the packet has a one-read budget and the
  // fullest stock birth already sits within 2 KB of it with the overview inlined.
  const appliedBehaviours = [...floorBehaviours, ...conditionalBehaviours, ...resolvedBehaviours.delivered];
  const glossaryReading = shelfReading.filter((file) => path.basename(file) === WORDS_READING);
  const backgroundReading = shelfReading.filter((file) => path.basename(file) !== WORDS_READING);
  // Working guidance comes first; Session Boot is background. Keep the glossary pointer
  // last because it is reference and the least costly part of a truncated first window.
  const completeReading = [
    ...appliedBehaviours.map((book) => book.file),
    ...backgroundReading,
    ...glossaryReading,
  ];
  const birthReading = coworkAgent && agent
    ? [...completeReading, ...(form.seed ?? [])].filter(Boolean)
    : [];
  return { birthReading, completeReading, appliedBehaviours, capabilities, ignored: resolvedBehaviours.ignored };
}

export async function resolveForm(
  form: SpawnForm,
  taken: Set<string>,
  referenceDir?: string,
  proposedRoster?: TeamRoster,
): Promise<Resolved> {
  const facts = await resolveFacts(form, taken, proposedRoster);
  const { sessionType, coworkAgent, campaign, preset, roster, profile, parentSeed, workspace, place, repositories, folders, agent, cascade, installations, contributions, name, kind } = facts;
  const { cmd, spec, chosen, launchMode } = await resolveLaunch(form, facts);
  const { birthReading, completeReading, appliedBehaviours, capabilities, ignored } = await resolveReading(form, facts);
  const explicit: StatedBy[] = [{ layer: 'launch', source: 'launch request' }];
  const system: StatedBy[] = [{ layer: 'system', source: 'src/spawn.ts' }];
  const rosterSource: StatedBy[] = roster
    ? [{
        layer: 'team_roster',
        source: proposedRoster?.name === roster.name ? 'proposed Team draft' : teamRosterFile(roster.name),
      }]
    : system;
  const workspaceSource: StatedBy[] = workspace ? [{ layer: 'team_roster', source: `Workspace ${workspace.name}` }] : system;
  const cmdSource: StatedBy[] = chosen.source === 'explicit_launch'
    ? explicit
    : chosen.source === 'settei_provider'
      ? [{ layer: 'system', source: '⚙ Configuration (agents.sessions)' }]
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
  const resolvedMandate = resolveMandate(form, facts);

  return {
    session_type: sessionType,
    name,
    dir: place,
    cmd,
    tags: [...(form.team ? [form.team] : []), ...(form.tags ?? [])]
      .filter(Boolean)
      .filter((t, i, a) => a.indexOf(t) === i)
      .slice(0, 16),
    // Collaboration is the launch default, not an Agent-selectable setting.
    mandate: resolvedMandate,
    team: form.team ?? '',
    workspace: workspace?.name ?? '',
    brief: coworkAgent && agent
      ? buildBrief(
          profile,
          workspace ? renderWorkspaceSection(workspace, repositories, folders) : '',
          form,
          referenceDir,
          completeReading,
          roster,
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
      ...ignored,
      ...preset.ignored,
    ],
    undelivered: cascade.undelivered,
    contributions,
    installations,
    capabilities,
    stated_by: {
      name: form.name ? explicit : system,
      dir: profile.dir ? profile.stated_by.dir : workspaceSource,
      cmd: cmdSource,
      tags: unique(roster ? rosterSource : [], form.tags?.length ? explicit : []),
      session_type: explicit,
      template: preset.source ?? system,
      mandate: form.mandate ? (preset.mandate ? preset.source! : explicit) : parentSeed?.seeds.reach.stated_by ?? (campaign
        ? [{ layer: 'campaign', source: `#/campaign (${campaign.id}: defaults)` }]
        : system),
      team: form.team ? explicit : system,
      workspace: workspaceSource,
      brief: unique(preset.brief ? preset.source! : explicit,
        profile.stated_by.opening, roster ? rosterSource : [], workspaceSource),
      agent: profile.stated_by.agent,
      capExempt: profile.stated_by.capExempt,
      launchAgent: cmdSource,
      launch_mode: parentSeed?.seeds.launch_mode.stated_by ?? system,
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
      arrangement: repositories.length ? workspaceSource : [],
    },
  };
}
