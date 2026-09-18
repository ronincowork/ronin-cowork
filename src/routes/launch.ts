import type express from 'express';
import { rm } from 'node:fs/promises';
import {
  capturePane,
  createSession,
  isValidName,
  listSessions,
  sessionDir,
  sessionExists,
  setSessionIdentity,
  setLeads,
  setProviderSessionId,
  setCampaign,
  setProjectRoot,
  setTags,
} from '../tmux.js';
import { launchArgv, newProviderSession } from '../agents.js';
import { AtSessionMax, liveCount, readAgentsSection, readMax, readOwner, writeMax, writeOwner } from '../machine-state.js';
import { resolveForm, type SpawnForm } from '../spawn.js';
import { appendLaunchLedger, persistBirthReceipt } from '../launch-ledger.js';
import { mandate } from '../agent-defaults.js';
import { projectRoutineTools, type RoutineToolProjection } from '../routine-tools.js';
import { classifyStatus, createActivityCache } from '../status.js';
import { scanContext, scanModel } from '../ctx.js';

import { count } from '../counts.js';
import { listTeamRosters } from '../team-rosters.js';
import { announceTeamChanges } from './wipeboards-api.js';
import { checkoutAt, deriveTeams, parkBrief, seedTegami, withAxes, writeGate } from '../tegami.js';
import { emitSessionBorn, emitSessionWillBorn, collectBirthLines, collectRowFields, listServices } from '../sockets.js';
import { prepareLaunchDesks } from '../launch-desks.js';
import { readArrangement } from '../desks/arrangement.js';
import { listProjectRoots } from '../project-roots.js';
import { campaignResolver, initialCampaignId } from '../campaign-scope.js';
import { readTeamRoster } from '../team-rosters.js';
import { readCampaign } from '../campaigns.js';
import { listBehaviours, listInstallations } from '../resource-adapters.js';
import { agentBinDir } from '../agent-install.js';
import { resolveLaunchSeed, shownLaunchSeed } from '../launch-seed.js';
import type { SessionsDefaults } from '../launch-command.js';
import { compileBirthReadmeAt, describePacket, isShelfTeaching, readFirstSentence, type PacketReport } from '../birth-readme.js';
import { rememberSessionKey, sessionDir as sessionRecordDir } from '../session-dir.js';
import type { HouseSeat } from '../house-seats.js';
import { readTegami } from '../tegami-read.js';
import { boundOperatorSocket, OPERATOR_SOCKET_ENV } from '../operator-socket.js';
import { ensureMikaHome, MIKA_PROMPTS, MikaUnavailable, mikaRulesSource, mikaStartHereSource, mikaTipsSource, resolveConfiguredMikaModel, type MikaSelection } from '../mika-runtime.js';
import { compileMikaKnowledgeAt } from '../mika-knowledge.js';
import { isMikaTab } from '../mika-context.js';
import { ensureRoninHelpersTeam, recordRoninHelperWelcome, roninHelperWelcomeState, RONIN_HELPER_LOADER, RONIN_HELPERS_TEAM } from '../ronin-helper.js';

const MIKA_SESSION = 'mika_agent' as const;
/** Her three commands, projected first on PATH. */
const MIKA_TOOLS = ['lookup', 'owner_view', 'show', 'machine-settings', 'session_create'] as const;
/** The rest of her PATH: a working shell and coreutils, and nothing of Ronin's own bin —
 *  the first Mika was born with ONLY her tools dir on PATH, so her CLI could not run a
 *  shell at all and reported her tools missing (2026-09-09). */
const MIKA_PARENT_PATH = '/usr/local/bin:/usr/bin:/bin';

/** The environment a newborn is handed beyond what the pane inherits: its projected
 *  command PATH with Ronin's own install bin dir behind it, and the operator socket that
 *  launched it. Undefined when there is nothing to say, so `new-session` gets no empty `-e`.
 *
 *  The install bin dir (`~/.local/bin`, where Install and Update put a CLI) is on every
 *  newborn's PATH because the pane inherits the server's environment, and a server started
 *  by systemd or npm has no `.profile` and so no `~/.local/bin` — so a tile launched by
 *  absolute path ran the CLI Ronin installed while `codex` typed by name inside it found an
 *  older system copy (2026-09-09). The session's own command directory stays first: its
 *  guards (the tmux shim) must win over anything. Running tiles are untouched. */
export function birthEnv(toolPath?: string, socket?: string, installBin: string = agentBinDir(), parentPath: string = process.env.PATH ?? '', exactPath = false): Record<string, string> | undefined {
  const env: Record<string, string> = {};
  const has = (p: string) => p.split(':').includes(installBin);
  if (toolPath) {
    const [own, ...rest] = toolPath.split(':');
    env.PATH = exactPath || has(toolPath) ? toolPath : [own, installBin, ...rest].filter(Boolean).join(':');
  } else if (installBin && !has(parentPath)) {
    env.PATH = [installBin, parentPath].filter(Boolean).join(':');
  }
  if (socket) env[OPERATOR_SOCKET_ENV] = socket;
  return Object.keys(env).length ? env : undefined;
}

export function createWindowedLoader<T>(
  load: () => Promise<T>,
  windowMs: number,
  now: () => number = Date.now,
): () => Promise<T> {
  let window = -1;
  let shared: Promise<T> | null = null;
  return () => {
    const current = Math.floor(now() / windowMs);
    if (!shared || current !== window) {
      window = current;
      shared = load().catch((error) => {
        shared = null;
        throw error;
      });
    }
    return shared;
  };
}

async function birthCampaign(team: string, explicit = ''): Promise<string> {
  if (explicit) return explicit;
  const roster = team ? await readTeamRoster(team).catch(() => null) : null;
  return roster?.campaign_id || (await initialCampaignId());
}

async function deskNote(r: { assignment?: unknown; project_root?: string; agent?: unknown; cmd?: string }): Promise<string> {
  if (r.assignment || !r.cmd || !r.project_root) return '';
  const root = (await listProjectRoots()).find((x) => x.name === r.project_root);
  if (!root) return '';
  const a = await readArrangement(root.name, root.dir).catch(() => null);
  if (!a) return `no desk — ${root.name}'s RONIN_REPO could not be read`;
  if (a.source === 'absent') return `checkout — ${root.name} has no RONIN_REPO`;
  if (a.desks !== 'managed') return `no Worktree — ${root.name} uses its checkout at ${root.dir}; edit directly there`;
  return '';
}

const LAUNCH_KEYS = new Set([
  'session_type', 'team', 'team_lead', 'instructions', 'prompt', 'name',
  'project_root', 'cmd', 'model', 'provider', 'mandate', 'campaign_id', 'launch_mode',
  'tags', 'seed', 'inject', 'reference', 'desk', 'repos',
  'kind', 'behaviours',
  'template',
]);
const RETURNED_LAUNCH_KEYS = new Set([
  'assignment', 'work_locations', 'posture', 'opening', 'ack', 'capExempt', 'launchAgent', 'stated_by', 'birth_reading',
]);
const SESSION_TYPES = new Set(['cowork_agent', 'bare_metal_agent', 'terminal']);
const KINDS = new Set(['open', 'coding', 'work', 'personal', 'household', 'social', 'school']);

export function acceptedLaunchBody(input: unknown): { body: Record<string, unknown>; ignored: string[] } {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const body = { ...source };
  const ignored = new Set<string>();
  const drop = (key: string): void => {
    if (body[key] !== undefined) ignored.add(key);
    delete body[key];
  };

  for (const key of Object.keys(body)) {
    if (!LAUNCH_KEYS.has(key) || RETURNED_LAUNCH_KEYS.has(key)) drop(key);
  }

  const statedType = typeof body.session_type === 'string' ? body.session_type.trim() : body.session_type;
  const sessionType = typeof statedType === 'string' && SESSION_TYPES.has(statedType)
    ? statedType
    : 'cowork_agent';
  if (body.session_type !== undefined && sessionType !== statedType) ignored.add('session_type');
  body.session_type = sessionType;

  if (body.desk !== undefined && body.desk !== 'own' && body.desk !== 'none') drop('desk');
  if (body.launch_mode !== undefined && body.launch_mode !== 'configured' && body.launch_mode !== 'live_dangerously') drop('launch_mode');
  if (body.repos !== undefined && (!Array.isArray(body.repos) || body.repos.some((r: unknown) => typeof r !== 'string'))) drop('repos');
  if (body.repos !== undefined && sessionType !== 'cowork_agent') drop('repos');
  if (body.tags !== undefined && !Array.isArray(body.tags)) drop('tags');
  if (body.seed !== undefined && !Array.isArray(body.seed)) drop('seed');
  if (body.kind !== undefined && (typeof body.kind !== 'string' || !KINDS.has(body.kind.trim()))) drop('kind');
  if (body.kind !== undefined) body.kind = String(body.kind).trim();
  if (body.behaviours !== undefined && !Array.isArray(body.behaviours)) drop('behaviours');
  if (body.template !== undefined && (typeof body.template !== 'string' || !/^[\w-]{1,64}$/.test(body.template.trim()))) drop('template');
  if (body.template !== undefined) body.template = String(body.template).trim();

  const inapplicable = sessionType === 'terminal'
      ? ['provider', 'model', 'instructions', 'prompt', 'kind', 'mandate', 'behaviours', 'template', 'cmd', 'launch_mode', 'seed', 'inject', 'reference']
    : sessionType === 'bare_metal_agent'
      ? ['kind', 'mandate', 'behaviours', 'template', 'seed', 'inject', 'reference', 'team_lead']
      : [];
  for (const key of inapplicable) drop(key);
  if (sessionType === 'bare_metal_agent' && body.desk === 'own') drop('desk');

  return { body, ignored: [...ignored].sort() };
}

export function spawnFormFromLaunchBody(body: Record<string, unknown>, houseSeat?: HouseSeat): SpawnForm {
  const sessionType = String(body.session_type);
  const team = String(body.team ?? '').trim();
  return {
    session_type: sessionType as SpawnForm['session_type'],
    house_seat: houseSeat,
    team: team || undefined,
    team_lead: body.team_lead === true,
    prompt: String(body.instructions ?? body.prompt ?? '').trim(),
    name: String(body.name ?? '').trim(),
    project_root: String(body.project_root ?? '').trim() || undefined,
    cmd: String(body.cmd ?? '').trim() || undefined,
    model: String(body.model ?? '').trim() || undefined,
    provider: String(body.provider ?? '').trim() || undefined,
    launch_mode: body.launch_mode === 'configured' || body.launch_mode === 'live_dangerously' ? body.launch_mode : undefined,
    mandate: sessionType === 'cowork_agent' && body.mandate !== undefined ? mandate(body.mandate) : undefined,
    campaign_id: String(body.campaign_id ?? '').trim() || undefined,
    kind: typeof body.kind === 'string' ? body.kind : undefined,
    behaviours: Array.isArray(body.behaviours) ? body.behaviours.map(String) : undefined,
    template: typeof body.template === 'string' ? body.template : undefined,
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    seed: Array.isArray(body.seed) ? body.seed.map(String) : [],
    inject: String(body.inject ?? '').trim() || undefined,
    reference: String(body.reference ?? '').trim() || undefined,
    desk: body.desk === 'own' || body.desk === 'none' ? body.desk : undefined,
    repos: Array.isArray(body.repos) ? body.repos.map(String) : undefined,
  };
}

export function mikaLaunchBody(input: unknown, selection?: Pick<MikaSelection, 'provider' | 'model'>): Record<string, unknown> {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return {
    session_type: 'cowork_agent',
    name: MIKA_SESSION,
    tags: [RONIN_HELPERS_TEAM],
    // She discusses, recruits nobody, and hands back ideas — never a plan (owner, 2026-09-09).
    mandate: { reach: 'discuss', recruit: 'nobody', output: ['ideas'] },
    prompt: typeof source.prompt === 'string' ? source.prompt : '',
    ...(selection ? { provider: selection.provider, model: selection.model } : {}),
    launch_mode: 'configured',
  };
}

export interface LaunchControl {
  ensureMika(intent?: 'help' | 'setup_provider_ready', tab?: string): Promise<{ ok: boolean; state: 'ready' | 'starting' | 'action_required' | 'refused'; action?: 'pending_user'; session: typeof MIKA_SESSION; team: typeof RONIN_HELPERS_TEAM; loader: typeof RONIN_HELPER_LOADER; already?: boolean; welcome_delivered?: boolean; error?: string; code?: string; available_levels?: unknown }>;
}

export function mikaReadinessFromPane(text: string): 'ready' | 'starting' | 'action_required' {
  const state = classifyStatus(text);
  return state === 'awaiting-input' ? 'action_required' : state === null ? 'starting' : 'ready';
}

export function registerLaunch(app: express.Express): LaunchControl {
  type MikaReady = Awaited<ReturnType<LaunchControl['ensureMika']>>;
  let mikaStarting: Promise<MikaReady> | null = null;
  const loadPaneStatus = createActivityCache(async (name: string) => {
    const text = await capturePane(name, 0);
    return {
      status: classifyStatus(text),
      ctx: scanContext(text),
      model: scanModel(text),
    };
  });
  const loadHome = createWindowedLoader(async () => {
    const list = await withAxes(await listSessions());
    return Promise.all(
      list.map(async (s) => {
        const [pane, contributed, tegami] = await Promise.all([
          loadPaneStatus(s.name, s.activity).catch(() => ({ status: null, ctx: null, model: null })),
          collectRowFields(s.name),
          readTegami(s.name),
        ]);
        return {
          ...s,
          ...pane,
          ...contributed,
          ...(tegami ? { tegami } : {}),
        };
      }),
    );
  }, 2_000);

  app.get('/api/launch-seed', async (req, res) => {
    try {
      const campaign_id = String(req.query.campaign_id ?? '').trim() || await initialCampaignId();
      const team = String(req.query.team ?? '').trim();
      const campaign = campaign_id ? await readCampaign(campaign_id) : null;
      if (!campaign) return res.status(404).json({ error: `Unknown Campaign: ${campaign_id || '(none)'}.` });
      if (team && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(team)) {
        return res.status(400).json({ error: `A team name is lowercase letters, digits, _ and -: "${team}".` });
      }
      const [roster, allRoots, agents, installations, behaviours, resolveCampaign] = await Promise.all([
        team ? readTeamRoster(team, campaign_id).then((found) => found ?? readTeamRoster(team, '')) : Promise.resolve(null),
        listProjectRoots(),
        readAgentsSection(),
        listInstallations(),
        listBehaviours(),
        campaignResolver(),
      ]);
      const roots = allRoots.filter((root) => resolveCampaign(root.campaign_id) === campaign_id);
      if (team && !roster) return res.status(404).json({ error: `Unknown Team "${team}" in Campaign "${campaign_id}".` });
      const { resolved_contributions: _resolved, undelivered: _undelivered, ...seed } = resolveLaunchSeed({
        campaign,
        roster,
        roots,
        sessions: agents.sessions as SessionsDefaults | undefined,
        installations,
        behaviours,
      });
      res.json(shownLaunchSeed(seed));
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  const launch = async (req: express.Request, res: express.Response, houseSeat?: 'mika', loader?: typeof RONIN_HELPER_LOADER): Promise<unknown> => {
    let mikaSelection: MikaSelection | undefined;
    let mikaHome = '';
    let mikaTips = '';
    if (houseSeat === 'mika') {
      if (await sessionExists(MIKA_SESSION)) return res.json({ ok: true, name: MIKA_SESSION, already: true });
      try {
        mikaHome = await ensureMikaHome();
        if (loader === RONIN_HELPER_LOADER) await ensureRoninHelpersTeam();
        mikaSelection = await resolveConfiguredMikaModel();
      } catch (error) {
        if (error instanceof MikaUnavailable) {
          return res.status(error.code === 'invalid_mika_level' ? 400 : 409).json({
            error: error.message,
            code: error.code,
            requested_level: error.requested_level,
            available_levels: error.available_levels,
          });
        }
        return res.status(500).json({ error: `Mika home is unavailable: ${String((error as Error)?.message ?? error)}`, code: 'mika_home_invalid' });
      }
    }
    const accepted = acceptedLaunchBody(houseSeat === 'mika' ? mikaLaunchBody(req.body, mikaSelection) : req.body);
    req.body = accepted.body;
    const sessionType = String(req.body.session_type);
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: '`name` is required for every session type.' });
    if (!isValidName(name)) return res.status(400).json({ error: 'Use letters, digits, _ or - (no spaces, . or :).' });
    if (name === MIKA_SESSION && houseSeat !== 'mika') return res.status(409).json({ error: 'That name is reserved for Mika.', code: 'reserved_house_session' });

    if (sessionType === 'bare_metal_agent') {
      if (!String(req.body?.project_root ?? '').trim()) {
        return res.status(400).json({ error: 'A `bare_metal_agent` requires `project_root` for its working directory; it is placement, not Ronin birth material.' });
      }
    }
    const form = spawnFormFromLaunchBody(req.body, houseSeat);

    let resolved;
    let launch: { argv: string[]; parked: boolean } = { argv: [], parked: false };
    let routineTools: RoutineToolProjection | null = null;
    let birthKey = '';
    let birthDir = '';
    let packet: PacketReport | undefined;
    let runtimeBorn = false;
    try {
      const live = await listSessions();
      const taken = new Set(live.map((s) => s.name));
      if (form.reference && !taken.has(form.reference)) {
        return res.status(409).json({ error: `Session "${form.reference}" is gone — pick another.` });
      }
      const referenceDir = form.reference ? await sessionDir(form.reference) : undefined;
      resolved = await resolveForm(form, taken, referenceDir);
    } catch (e) {
      return res.status(400).json({ error: String((e as Error)?.message ?? e) });
    }
    if (!isValidName(resolved.name)) return res.status(400).json({ error: 'Could not derive a session name.' });
    if (await sessionExists(resolved.name)) return res.status(409).json({ error: `Session "${resolved.name}" already exists.` });
    const teams = new Set((await listTeamRosters()).filter((item) => item.state !== 'archived').map((item) => item.name));
    const unknownTeams = resolved.tags.filter((name) => !teams.has(name));
    if (unknownTeams.length) return res.status(400).json({ error: `Unknown Team: ${unknownTeams.join(', ')}.` });

    if (resolved.assignment) {
      try {
        resolved.assignment = await prepareLaunchDesks(resolved.assignment);
      } catch (e) {
        return res.status(400).json({ error: `Could not prepare selected managed workspace: ${String((e as Error)?.message ?? e)}` });
      }
    }

    if (resolved.session_type === 'cowork_agent' && resolved.agent) {
      birthKey = `${resolved.name}-${Date.now()}`;
      birthDir = sessionRecordDir(birthKey);
      try {
        // Mika's README replaces the ordinary startup shelf: her rules, the Setup
        // walkthrough, and the generated source index — the complete, bounded map of her
        // admitted knowledge. Her typed brief stays two sentences; the reading is here.
        const resolvedSources = [...resolved.birth_reading];
        const sources = houseSeat === 'mika' ? [] : resolvedSources;
        let mikaKnowledgeIndex = '';
        if (houseSeat === 'mika') {
          // A cold Mika launch publishes exactly one verified knowledge generation. The
          // returned index is the only generation path handed into birth; later source
          // opens resolve through mika-knowledge-current rather than caching this path.
          const previousSentence = `Read first: ${resolvedSources.join(', ')}.`;
          const knowledge = await compileMikaKnowledgeAt(mikaHome);
          mikaKnowledgeIndex = knowledge.index;
          // The owner's tips ride in as a document of her own: in the README, and on her
          // Docs list so they open from her tile.
          mikaTips = await mikaTipsSource();
          sources.push(mikaRulesSource(), mikaTips, mikaStartHereSource(), mikaKnowledgeIndex);
          resolved.brief = resolved.brief.replace(previousSentence, `Read first: ${sources.join(', ')}.`);
        }
        const readme = await compileBirthReadmeAt(
          birthDir,
          sources,
          resolved.name,
          (file) => file === mikaKnowledgeIndex || isShelfTeaching(file),
        );
        const sourceSentence = `Read first: ${sources.join(', ')}.`;
        if (!resolved.brief.includes(sourceSentence)) {
          await rm(birthDir, { recursive: true, force: true });
          return res.status(500).json({ error: 'The birth reading was compiled, but its brief did not contain the resolved source list.' });
        }
        packet = await describePacket(readme, resolved.name);
        resolved.brief = resolved.brief.replace(sourceSentence, readFirstSentence(packet));
        resolved.birth_reading = [readme];
      } catch (e) {
        if (birthDir) await rm(birthDir, { recursive: true, force: true });
        return res.status(500).json({ error: `Could not compile this Agent's birth README: ${String((e as Error)?.message ?? e)}` });
      }
    }

    try {
      await emitSessionWillBorn(resolved.name); // rireki resets a reused name's stale tape here
      const launchWords = resolved.session_type === 'bare_metal_agent' ? (form.prompt ?? '') : resolved.brief;
      launch = resolved.agent ? await launchArgv(resolved.cmd, launchWords) : { argv: [], parked: false };
      if (resolved.agent && !launch.argv.length) {
        if (birthDir) await rm(birthDir, { recursive: true, force: true });
        return res.status(400).json({
          error: `Could not find ${resolved.cmd.trim().split(/\s+/)[0]} on this machine. Install it from ⚙ Configuration, then launch again.`,
        });
      }
      const providerSession = newProviderSession(resolved.launchAgent, launch.argv);
      launch.argv = providerSession.argv;
      routineTools = resolved.agent
        ? await projectRoutineTools(
            resolved.name,
            resolved.contributions,
            houseSeat === 'mika' ? MIKA_PARENT_PATH : undefined,
            houseSeat === 'mika'
              ? { includeTmux: false, extraTools: [...MIKA_TOOLS] }
              : { extraTools: resolved.capability_tools },
          )
        : null;
      const campaignId = resolved.session_type === 'bare_metal_agent'
        ? (form.campaign_id || await initialCampaignId())
        : await birthCampaign(resolved.team, form.campaign_id);
      const transcriptOn = (await readCampaign(campaignId))?.config.services.parts.terminal_transcript === true;
      await createSession(resolved.name, resolved.dir, {
        agent: resolved.agent,
        exempt: resolved.capExempt,
        argv: launch.argv,
        // Told at birth, the way tmux tells every shell where its server is: the socket
        // this operator bound. A process that bound none (a dev run) says nothing, and the
        // newborn's tools use the default path.
        env: houseSeat === 'mika'
          ? {
              ...(birthEnv(routineTools?.path, boundOperatorSocket(), agentBinDir(), process.env.PATH ?? '', true) ?? {}),
              RONIN_MACHINE_SETTINGS_AUTHORITY: 'mika',
            }
          : birthEnv(routineTools?.path, boundOperatorSocket(), agentBinDir(), process.env.PATH ?? ''),
        key: birthKey || undefined,
        // The Services switch as resolved for THIS Agent at birth (campaign < team < form):
        // off means RIREKI never records it. Set here and never again — nothing cascades
        // onto a running session (owner, 2026-09-04). A terminal has no Routines and keeps
        // the recorder's own default.
        rireki: resolved.contributions.length
          ? resolved.contributions.some((contribution) => contribution.name === 'ronin_services' && contribution.enabled) && transcriptOn
          : undefined,
        strictCwd: houseSeat === 'mika',
      });
      runtimeBorn = true;
      await setSessionIdentity(resolved.name, resolved.identity || { sessionType: resolved.session_type, cli: resolved.launchAgent, provider: '', model: '' });
      if (birthKey) rememberSessionKey(resolved.name, birthKey);
      if (resolved.tags.length) {
        await setTags(resolved.name, resolved.tags);
        // The birth brief carries Team guidance. Record membership on the board without
        // a second terminal submission racing the CLI's startup or its first turn.
        if (resolved.session_type === 'cowork_agent' && houseSeat !== 'mika') {
          await announceTeamChanges(resolved.name, [], resolved.tags, { notifyAgent: false }).catch(() => {});
        }
      }
      if (form.team_lead && resolved.team) await setLeads(resolved.name, [resolved.team]);
      if (resolved.project_root && resolved.session_type !== 'bare_metal_agent') await setProjectRoot(resolved.name, resolved.project_root);
      await setCampaign(resolved.name, campaignId);
      if (providerSession.id) await setProviderSessionId(resolved.name, providerSession.id);
      if (resolved.session_type === 'cowork_agent') {
        await seedTegami(
          resolved.name,
          resolved.assignment?.desks.length
            ? resolved.assignment.desks.map((d) => ({ repo: d.repo, branch: d.branch, worktree: d.worktree, line: d.line }))
            : await checkoutAt(resolved.dir),
        await deriveTeams(resolved.tags),
        resolved.mandate,
        mikaTips ? [mikaTips] : [],
      );
      }
    } catch (e) {
      if (birthDir && !runtimeBorn) await rm(birthDir, { recursive: true, force: true });
      void appendLaunchLedger(form, resolved, false);
      if (e instanceof AtSessionMax) {
        return res.status(429).json({ error: e.message, max: e.max, live: e.live });
      }
      return res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }

    count('born', { name: resolved.name, born: 'launch' });
    emitSessionBorn({
      name: resolved.name,
      team: resolved.team,
      root: resolved.project_root,
      cmd: resolved.cmd,
    });

    if (resolved.session_type === 'bare_metal_agent') {
      res.json({
        ok: true,
        name: resolved.name,
        session_type: resolved.session_type,
        identity: resolved.identity,
        dir: resolved.dir,
        cmd: resolved.cmd,
        tags: resolved.tags,
        campaign_id: form.campaign_id || await initialCampaignId(),
        birth: 'none',
      });
    } else {
      const receipt = {
        session_type: resolved.session_type,
        identity: resolved.identity,
        team: resolved.team,
        project_root: resolved.project_root,
        dir: resolved.dir,
        cmd: resolved.cmd,
        tags: resolved.tags,
        team_lead: !!form.team_lead && !!resolved.team,
        kind: resolved.kind,
        behaviours: resolved.behaviours,
        ignored: [...new Set([...accepted.ignored, ...resolved.ignored])].sort(),
        undelivered: [...new Set(resolved.undelivered)].sort(),
        stated_by: resolved.stated_by,
        ...(resolved.session_type === 'cowork_agent'
          ? { boot: { state: 'open', brief: launch.parked ? 'parked' : 'argv' } }
          : {}),
        // What the newborn was handed to read: size, section count, the line it ends with,
        // and whether one read delivers it. The receipt says what left; the tape says what
        // arrived (the ACK asks the newborn to quote the terminator).
        ...(packet ? { packet } : {}),
        desks: resolved.assignment?.desks.map((d) => ({ repo: d.repo, branch: d.branch, worktree: d.worktree, line: d.line })) ?? [],
        work_locations: resolved.work_locations,
        arrangement: resolved.work_locations.find((row) => row.repo === resolved.project_root)?.reason ?? '',
        desk_note: await deskNote(resolved),
        // The capability documents this birth read from the folder: which were selected,
        // why the rest were not, and which listed tools the box could not project.
        capabilities: resolved.capabilities.map((capability) => ({
          name: capability.name,
          selected: capability.selected,
          reason: capability.reason,
          tools: capability.delivered,
          missing: capability.missing,
        })),
        installations: resolved.installations.map((installation) => {
          const services = new Set(listServices());
          const missing = installation.enabled
            ? [
                ...installation.tools.filter((tool) => routineTools?.missing.includes(tool)).map((tool) => `tool:${tool}`),
                ...installation.mcp.filter((name) => !services.has(name)).map((name) => `mcp:${name}`),
              ]
            : [];
          return {
            name: installation.name,
            on: installation.enabled,
            delivered: installation.enabled && missing.length === 0,
            missing,
          };
        }),
      };
      try {
        await persistBirthReceipt(resolved.name, receipt);
      } catch (e) {
        return res.status(500).json({ error: `Session was born, but its birth receipt could not be persisted: ${String((e as Error)?.message ?? e)}` });
      }
      const modelSelection = mikaSelection ? {
        requested_level: mikaSelection.requested_level,
        provider: mikaSelection.provider,
        model: mikaSelection.model,
        resolved_level: mikaSelection.resolved_level,
        provider_notice: mikaSelection.provider_notice,
        available_levels: mikaSelection.available_levels,
      } : undefined;
      res.json({ ok: true, name: resolved.name, conversation: birthKey, receipt, ...(modelSelection ? { model_selection: modelSelection } : {}) });
    }
    void appendLaunchLedger(form, resolved, true);
    void (async () => {
      if (resolved.session_type !== 'cowork_agent' || !resolved.agent) return;
      const birthLines = await collectBirthLines(resolved.name, true);
      const shelved = [launch.parked ? resolved.brief : '', birthLines].filter(Boolean).join('\n');
      if (!shelved) return;
      const at = await parkBrief(resolved.name, shelved);
      if (at) {
        await writeGate(
          resolved.name,
          launch.parked
            ? 'Your brief could not be handed to this agent at launch, so it is parked in brief.md beside this session. Read it there.'
            : 'There is a note for this session in brief.md beside it.',
        );
      }
    })().catch((e) => console.error(`[ronin] spawn ${resolved.name}:`, e));
  };
  const launchJob: express.RequestHandler = (req, res) => launch(req, res);
  app.post('/api/launch', launchJob);
  app.post('/api/mika', (req, res) => launch(req, res, 'mika', RONIN_HELPER_LOADER));

  app.get('/api/sessions', async (_req, res) => {
    try {
      res.json(await withAxes(await listSessions()));
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.get('/api/home', async (_req, res) => {
    try {
      res.json(await loadHome());
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.get('/api/session-max', async (_req, res) => {
    try {
      res.json({ max: await readMax(), live: await liveCount() });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.get('/api/owner', async (_req, res) => {
    try {
      res.json({ name: await readOwner() });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.put('/api/session-max', async (req, res) => {
    const raw = req.body?.max;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return res.status(400).json({ error: 'The session max is a whole number, 0 or more (0 = no limit).' });
    }
    try {
      res.json({ max: await writeMax(n), live: await liveCount() });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.post('/api/session', async (req, res, next) => {
    const name = String(req.body?.name ?? '').trim();
    if (name && !isValidName(name)) return res.status(400).json({ error: 'Use letters, digits, _ or - (no spaces, . or :).' });
    const caller = String(req.body?.caller ?? '').trim();
    let team = String(req.body?.team ?? '').trim();
    let teamFrom: 'explicit' | 'caller' | 'none' = team ? 'explicit' : 'none';
    let campaignId = String(req.body?.campaign_id ?? '').trim();
    if (caller) {
      const origin = (await listSessions()).find((s) => s.name === caller);
      const mine = origin?.tags ?? [];
      if (mine.length) {
        if (!team) {
          team = mine[0];
          teamFrom = 'caller';
        }
      }
      if (!campaignId) campaignId = origin?.campaign_id ?? '';
    }
    req.body = { ...req.body, session_type: req.body?.session_type ?? 'cowork_agent', name: name || undefined, team: team || undefined, campaign_id: campaignId || undefined };
    const send = res.json.bind(res);
    res.json = (body: unknown) =>
      send(body && typeof body === 'object' && (body as { ok?: boolean }).ok ? { ...body, team_from: teamFrom } : body);
    return launchJob(req, res, next);
  });
  const ensureMika = async (intent: 'help' | 'setup_provider_ready' = 'help', tab = ''): Promise<MikaReady> => {
    const metadata = { session: MIKA_SESSION, team: RONIN_HELPERS_TEAM, loader: RONIN_HELPER_LOADER };
    const observeLive = async (already: boolean): Promise<MikaReady> => {
      let providerState: ReturnType<typeof mikaReadinessFromPane> = 'starting';
      try { providerState = mikaReadinessFromPane(await capturePane(MIKA_SESSION, 0)); } catch { /* live but not yet drawable */ }
      if (providerState === 'action_required') {
        return { ok: false, state: 'action_required', action: 'pending_user', code: 'provider_confirmation_required', already, ...metadata };
      }
      if (providerState === 'starting') return { ok: false, state: 'starting', already, ...metadata };
      const welcome = await roninHelperWelcomeState();
      if (welcome?.state === 'pending') await recordRoninHelperWelcome(welcome.conversation, 'delivered');
      return { ok: true, state: 'ready', already, welcome_delivered: welcome?.state === 'pending', ...metadata };
    };
    if (await sessionExists(MIKA_SESSION)) return observeLive(true);
    if (mikaStarting) return mikaStarting;
    mikaStarting = (async () => {
      const welcome = intent === 'setup_provider_ready' && (await roninHelperWelcomeState())?.state !== 'delivered';
      const prompt = [
        welcome ? MIKA_PROMPTS.setup_provider_ready : MIKA_PROMPTS.help,
        tab ? `Help was opened in browser tab ${tab}: \`owner_view ${tab}\` shows what the owner sees.` : '',
      ].filter(Boolean).join(' ');
      let status = 200;
      let body: Record<string, unknown> = {};
      const response = {
        status(code: number) { status = code; return this; },
        json(value: unknown) { body = value && typeof value === 'object' ? value as Record<string, unknown> : {}; return value; },
      } as unknown as express.Response;
      await launch({ body: { prompt } } as express.Request, response, 'mika', RONIN_HELPER_LOADER);
      if (status < 400 && body.ok === true && welcome) await recordRoninHelperWelcome(String(body.conversation ?? 'mika'), 'pending');
      return status < 400 && body.ok === true
        ? observeLive(body.already === true)
        : {
            ok: false,
            state: 'refused' as const,
            error: typeof body.code === 'string' && body.code.startsWith('mika_')
              ? String(body.error ?? 'Mika is unavailable at the selected model level.')
              : 'Mika could not start. Check Mika under Configuration, then try again.',
            ...(typeof body.code === 'string' ? { code: body.code } : {}),
            ...(Array.isArray(body.available_levels) ? { available_levels: body.available_levels } : {}),
            ...metadata,
          };
    })();
    const starting = mikaStarting;
    try { return await starting; }
    finally { mikaStarting = null; }
  };
  app.post('/api/mika/ready', async (req, res) => {
    const intent = req.body?.intent === 'setup_provider_ready' ? 'setup_provider_ready' : 'help';
    const ready = await ensureMika(intent, isMikaTab(req.body?.tab) ? req.body.tab : '');
    res.status(ready.ok ? 200 : ready.state === 'starting' ? 202 : 409).json(ready);
  });
  return { ensureMika };
}
