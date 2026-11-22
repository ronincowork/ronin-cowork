import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveLaunchCommand, sessionsFor, type SessionsDefaults } from './launch-command.js';
import { REPO_ROOT } from './resources.js';
import { listSessionLaunchSpecs } from './model-providers.js';
import { agentSpec } from './agents.js';
import { bypassArgs, commandText, readAgentLaunches, withBypass } from './agent-launches.js';
import { readAgentsSection, readSetupSection } from './machine-state.js';
import { measureAndRecordProviders, offAt, readProviderSummary } from './provider-summary.js';
import { storeDir } from './resources.js';
import { listInstallations } from './resource-adapters.js';
import { isCreatableTeamName as isTeamName, readTeamRoster, teamRosterFile, type TeamRoster } from './team-rosters.js';
import { resolveLaunchProfile, type LaunchProfile, type StatedBy } from './launch-profile.js';
import { readCampaign } from './campaigns.js';
import { readWorkspace, roninHouse, type Workspace } from './workspaces.js';
import { desksManaged, rowArrangement } from './desks/arrangement.js';
import { mandate, type LaunchMode, type Mandate } from './agent-defaults.js';
import { resolveInstallations, type ResolvedInstallation } from './installations.js';
import { initialCampaignId } from './campaign-scope.js';
import { resolveLaunchSeed } from './launch-seed.js';
import { templateProvenance } from './template-provenance.js';
import { profileDir, resolveHouseSeatProfile, type HouseSeat } from './house-seats.js';
import { agentBriefOf, composeBrief, type BuiltBrief } from './brief-build.js';
import type { BriefSettings } from './brief-record.js';

export interface SpawnForm {
  session_type?: 'cowork_agent' | 'bare_metal_agent' | 'terminal';
  house_seat?: HouseSeat;
  /** The Helpful Assistant (KAN-766): an ordinary Cowork launch whose brief type is `irasshai`, so her files say `when: irasshai`. */
  agent_type?: 'irasshai';
  team?: string;
  team_lead?: boolean;
  role?: 'coworker' | 'lead' | 'epic_lead' | 'coordinator';
  model?: string;
  provider?: string;
  mandate?: Partial<Mandate>;
  campaign_id?: string;
  kind?: string;
  template?: string; // preset is validated provenance only, never reapplied
  /** The Agent's own brief settings, integrations and project management (docs/architecture/brief.md, Layers and brief settings). */
  brief?: BriefSettings;
  integrations?: string[];
  pm?: boolean;
  /** In a hosted office, the person launching (src/office-people.ts). */
  person?: Omit<import('./office-people.js').Person, 'email'> & { email?: string };
  /** What only a draft knows (the New Agent preview); a launch works them out. */
  desk?: boolean;
  checkout?: boolean;
  /** A preview's Workspace when it names no Team. */
  workspace?: string;
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
  /** The brief, composed: record, layers, what is in play, the packet text. */
  composed: BuiltBrief | null;
  kind: string;
  ignored: string[];
  installations: ResolvedInstallation[];
  stated_by: Record<string, StatedBy[]>;
}

const ACK_RULE =
  'Before doing anything else: report back in your own words what you understand this job to be, ' +
  'what you will NOT do (no code, no builds, no commits until the owner says go), and anything ' +
  'that is unclear or looks wrong. Quote the last line of the document you were told to read first — ' +
  'it names itself — so the owner can see the whole packet reached you. Then wait for the owner.';

/** The packet's place in the launch prompt until the packet is written (src/routes/launch.ts). */
export const PACKET_PLACEHOLDER = 'Read first: <packet>.';

/**
 * THE LAUNCH PROMPT (docs/architecture/brief.md, The brief): the read line, the task, and the acknowledgement
 * rule where the launch profile asks for it. Team, mandate and Workspace are in the brief.
 */
export function buildBrief(profile: LaunchProfile, form: SpawnForm, referenceDir?: string): string {
  const parts: string[] = [];
  if (profile.posture.length) parts.push(`You are the ${profile.label}. ${profile.posture.join(' ')}`);
  parts.push(PACKET_PLACEHOLDER);
  const prompt = form.prompt?.trim() ?? '';
  const opening = (profile.opening ?? '').replace(/\{prompt\}/g, prompt).trim();
  if (opening) parts.push(`Your task:\n${opening}`);
  if (form.reference) {
    parts.push(
      `The session in question is @${form.reference}` +
        (referenceDir ? ` (working in ${referenceDir})` : '') +
        `. Catch up on it with \`edges read ${form.reference}\`, which reads its durable record first ` +
        `and falls back to the live view.`,
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
  const [agentsSet, campaign, installationCatalog] = await Promise.all([
    readAgentsSection(),
    coworkAgent ? readCampaign(campaignId) : null,
    listInstallations(),
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
  // The Team's Workspace; a draft with no Team may name one (the New Agent and layer previews).
  const workspaceName = roster?.workspace || (!roster ? form.workspace ?? '' : '');
  const workspace: Workspace | null = workspaceName ? await readWorkspace(roster?.campaign_id || campaignId, workspaceName) : null;
  if (roster?.workspace && !workspace) throw new Error(`Team "${roster.name}" is launched in Workspace "${roster.workspace}", which does not exist.`);
  const profile = resolveHouseSeatProfile(form.house_seat, resolveLaunchProfile());
  const parentSeed = coworkAgent && campaign
    ? resolveLaunchSeed({
        campaign,
        roster,
        workspace,
        sessions: agentsSet.sessions as SessionsDefaults | undefined,
        lead: !!form.team && !!form.team_lead,
      })
    : null;

  // WHERE AN AGENT STARTS is Ronin's: one folder for every Agent, Ronin house (owner, 2026-11-03), so
  // a provider asks to trust it once, not once per Workspace. Mika keeps her own home.
  const place = form.house_seat === 'mika' ? profileDir(profile) : roninHouse();
  await mkdir(place, { recursive: true });

  const wanted = form.name ? sanitizeName(form.name) : '';
  if (form.name && !wanted) {
    throw new Error(`"${form.name}" has no usable characters for a session name.`);
  }

  const agent = sessionType === 'terminal' ? false : bareMetalAgent ? true : profile.agent;
  const installations = resolveInstallations(installationCatalog, campaign?.config.installations);
  const name = wanted || slugName(form.team || (agent ? 'agent' : 'terminal'), form.prompt ?? '', taken);
  // Repositories are the Workspace's; an Agent opens a worktree when its work needs one.
  const repositories = (workspace?.repos ?? []).map((repo) => ({ ...repo, managed: desksManaged(rowArrangement({ ...repo, repo: true, workspace: workspace!.name, campaign_id: workspace!.campaign_id })) }));
  const folders = workspace?.folders ?? [];
  const arrangement: 'managed' | 'checkout' | 'none' = repositories.some((repo) => repo.managed) ? 'managed' : repositories.length ? 'checkout' : 'none';
  const kind = form.kind ?? String(parentSeed?.seeds.kind.value ?? 'open');
  return {
    sessionType, coworkAgent, bareMetalAgent, campaignId, agentsSet, campaign, launchSpecs, preset, roster, profile,
    parentSeed, workspace, place, repositories, folders, agent, installations, name, arrangement, kind,
  };
}
export type LaunchFacts = Awaited<ReturnType<typeof resolveFacts>>;

/** THE LAUNCH: which command runs, the provider switch, the Dangerously form. Only a launch
 * comes through here; a brief rebuilt for a running Agent takes the facts and the reading alone. */
async function resolveLaunch(form: SpawnForm, facts: LaunchFacts) {
  const { agent, parentSeed } = facts;
  let { agentsSet, launchSpecs } = facts;
  // No default yet (KAN-725): measure the sign-ins first, so the first one signed in, in Setup
  // or in a tile, is written as the default before this launch reads it.
  const stated = (agentsSet.sessions as SessionsDefaults | undefined)?.default?.provider;
  if (agent && !form.cmd && !form.provider && !form.model && !stated) {
    const summary = await measureAndRecordProviders();
    agentsSet = await readAgentsSection();
    launchSpecs = await listSessionLaunchSpecs(summary);
  }
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
  // Mode is the Workspace's, Mika's always Dangerously (owner, 2026-11-18: "this is a stupid check on
  // an empty VM"). Every Agent is Dangerously unless Native was chosen (owner, 2026-11-19; KAN-718):
  // no Campaign or a bare-metal Agent is Dangerously.
  const wanted = agent ? (form.house_seat === 'mika' ? 'live_dangerously' : parentSeed?.seeds.launch_mode.value ?? 'live_dangerously') as LaunchMode : 'configured';
  let launchMode: LaunchMode = 'configured';
  if (wanted === 'live_dangerously' && spec?.dangerousCmd) { cmd = spec.dangerousCmd; launchMode = wanted; }
  else if (wanted === 'live_dangerously') {
    // A command no catalog row names (an explicit cmd): the CLI's own bypass arguments added.
    const words = cmd.trim().split(/\s+/);
    const grammar = await readAgentLaunches(spec?.cli || path.basename(words[0] ?? '')).catch(() => null);
    if (grammar && bypassArgs(grammar).length) { cmd = commandText(withBypass(words, grammar)); launchMode = wanted; }
  }
  return { cmd, spec, chosen, launchMode };
}

/** THE BRIEF for these facts (src/brief-build.ts): a Cowork Agent's, Mika's; none for a terminal. */
export async function resolveBriefFor(form: SpawnForm, facts: LaunchFacts, launch?: Parameters<typeof composeBrief>[3]): Promise<BuiltBrief | null> {
  if (!facts.coworkAgent || !facts.agent) return null;
  return composeBrief(form, facts, agentBriefOf(form), launch);
}

export async function resolveForm(
  form: SpawnForm,
  taken: Set<string>,
  referenceDir?: string,
  proposedRoster?: TeamRoster,
): Promise<Resolved> {
  const facts = await resolveFacts(form, taken, proposedRoster);
  const { sessionType, coworkAgent, campaign, preset, roster, profile, parentSeed, workspace, place, repositories, folders, agent, installations, name, kind } = facts;
  const { cmd, spec, chosen, launchMode } = await resolveLaunch(form, facts);
  const composed = await resolveBriefFor(form, facts, {
    provider: spec?.provider ?? '', model: spec?.model ?? '', harness: spec?.cli ?? '', launch_mode: launchMode,
  });
  const ignored: string[] = [];
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
      ? buildBrief(profile, form, referenceDir)
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
    composed,
    kind,
    ignored: [
      ...ignored,
      ...preset.ignored,
    ],
    installations,
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
      brief_settings: form.brief !== undefined ? explicit : system,
      kind: form.kind !== undefined ? explicit : parentSeed?.seeds.kind.stated_by ?? system,
      arrangement: repositories.length ? workspaceSource : [],
    },
  };
}
