import type express from 'express';
import { rm } from 'node:fs/promises';
import {
  capturePane,
  createSession,
  isValidName,
  listSessions,
  sessionDir,
  sessionExists,
  setControl,
  setLaunchStamp,
  setLeads,
  setProviderSessionId,
  setCampaign,
  setProjectRoot,
  setTags,
} from '../tmux.js';
import { launchArgv, newProviderSession } from '../agents.js';
import { AtSessionMax, liveCount, readAgentsSection, readDesksSection, readMax, readOwner, writeMax, writeOwner } from '../machine-state.js';
import { resolveForm, type SpawnForm } from '../spawn.js';
import { appendLaunchLedger, persistBirthReceipt } from '../launch-ledger.js';
import { mandate } from '../agent-defaults.js';
import { projectRoutineTools, type RoutineToolProjection } from '../routine-tools.js';
import { routineChoices } from '../routines.js';
import { classifyStatus, createActivityCache, type SessionStatus } from '../status.js';
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
import { listRoutines } from '../resource-adapters.js';
import { resolveLaunchSeed } from '../launch-seed.js';
import type { SessionsDefaults } from '../launch-command.js';
import { compileBirthReadmeAt, describePacket, isShelfTeaching, readFirstSentence, type PacketReport } from '../birth-readme.js';
import { rememberSessionKey, sessionDir as sessionRecordDir } from '../session-dir.js';
import { readTegami } from '../tegami-read.js';

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

async function deskNote(r: { assignment?: unknown; routines?: Array<{ name: string; enabled: boolean }>; project_root?: string; agent?: unknown; cmd?: string }): Promise<string> {
  if (r.assignment || !r.cmd || !r.routines?.some((routine) => routine.name === 'ronin_worktrees' && routine.enabled) || !r.project_root) return '';
  const root = (await listProjectRoots()).find((x) => x.name === r.project_root);
  if (!root) return '';
  const a = await readArrangement(root.name, root.dir).catch(() => null);
  if (!a) return `no desk — ${root.name}'s RONIN_REPO could not be read`;
  if (a.source === 'absent') return `no desk — ${root.name} has no RONIN_REPO (add one: mode=reviewed working=dev stable=master desks=managed)`;
  if (a.desks !== 'managed') return `no Worktree — ${root.name} uses its checkout at ${root.dir}; edit directly there`;
  return '';
}

const LAUNCH_KEYS = new Set([
  'session_type', 'session_role', 'team', 'team_lead', 'instructions', 'prompt', 'name',
  'dial', 'project_root', 'cmd', 'model', 'provider', 'mandate', 'campaign_id', 'gbrain_mode', 'launch_mode',
  'tags', 'seed', 'inject', 'reference', 'desk', 'repos',
  'kind', 'behaviours', 'routines',
  'template',
]);
const RETIRED_LAUNCH_KEYS = new Set([
  'role_family', 'family_role', 'session_task', 'team_role', 'campaign_kind', 'lifecycle', 'permissions', 'mcp',
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
    if (!LAUNCH_KEYS.has(key) || RETIRED_LAUNCH_KEYS.has(key) || RETURNED_LAUNCH_KEYS.has(key)) drop(key);
  }

  const statedType = typeof body.session_type === 'string' ? body.session_type.trim() : body.session_type;
  const sessionType = typeof statedType === 'string' && SESSION_TYPES.has(statedType)
    ? statedType
    : 'cowork_agent';
  if (body.session_type !== undefined && sessionType !== statedType) ignored.add('session_type');
  body.session_type = sessionType;

  if (body.dial !== undefined && body.dial !== 'user' && body.dial !== 'read' && body.dial !== 'write') drop('dial');
  if (body.desk !== undefined && body.desk !== 'own' && body.desk !== 'none') drop('desk');
  if (body.gbrain_mode !== undefined && body.gbrain_mode !== 'connected' && body.gbrain_mode !== 'disconnected') drop('gbrain_mode');
  if (body.launch_mode !== undefined && body.launch_mode !== 'configured' && body.launch_mode !== 'live_dangerously') drop('launch_mode');
  if (body.repos !== undefined && (!Array.isArray(body.repos) || body.repos.some((r: unknown) => typeof r !== 'string'))) drop('repos');
  if (body.repos !== undefined && sessionType !== 'cowork_agent') drop('repos');
  if (body.tags !== undefined && !Array.isArray(body.tags)) drop('tags');
  if (body.seed !== undefined && !Array.isArray(body.seed)) drop('seed');
  if (body.kind !== undefined && (typeof body.kind !== 'string' || !KINDS.has(body.kind.trim()))) drop('kind');
  if (body.kind !== undefined) body.kind = String(body.kind).trim();
  if (body.behaviours !== undefined && !Array.isArray(body.behaviours)) drop('behaviours');
  if (body.routines !== undefined && (!body.routines || typeof body.routines !== 'object' || Array.isArray(body.routines))) drop('routines');
  if (body.routines !== undefined) {
    body.routines = Object.fromEntries(Object.entries(body.routines as Record<string, unknown>)
      .filter(([name, value]) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(name) && typeof value === 'boolean'));
  }
  if (body.template !== undefined && (typeof body.template !== 'string' || !/^[\w-]{1,64}$/.test(body.template.trim()))) drop('template');
  if (body.template !== undefined) body.template = String(body.template).trim();

  const inapplicable = sessionType === 'terminal'
      ? ['provider', 'model', 'instructions', 'prompt', 'kind', 'mandate', 'behaviours', 'template', 'routines', 'sops', 'cmd', 'gbrain_mode', 'launch_mode', 'seed', 'inject', 'reference', 'session_role']
    : sessionType === 'bare_metal_agent'
      ? ['kind', 'mandate', 'behaviours', 'template', 'routines', 'sops', 'seed', 'inject', 'reference', 'session_role', 'team_lead']
      : [];
  for (const key of inapplicable) drop(key);
  if (sessionType === 'bare_metal_agent' && body.desk === 'own') drop('desk');

  return { body, ignored: [...ignored].sort() };
}

export function mikaLaunchBody(input: unknown): Record<string, unknown> {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return {
    session_type: 'cowork_agent',
    name: 'mika',
    tags: ['mika'],
    prompt: typeof source.prompt === 'string' ? source.prompt : '',
  };
}

export function registerLaunch(app: express.Express): void {
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
      const [roster, allRoots, agents, routines, desks, resolveCampaign] = await Promise.all([
        team ? readTeamRoster(team, campaign_id).then((found) => found ?? readTeamRoster(team, '')) : Promise.resolve(null),
        listProjectRoots(),
        readAgentsSection(),
        listRoutines(),
        readDesksSection(),
        campaignResolver(),
      ]);
      const roots = allRoots.filter((root) => resolveCampaign(root.campaign_id) === campaign_id);
      if (team && !roster) return res.status(404).json({ error: `Unknown Team "${team}" in Campaign "${campaign_id}".` });
      const { resolved_routines: _resolved, ...seed } = resolveLaunchSeed({
        campaign,
        roster,
        roots,
        sessions: agents.sessions as SessionsDefaults | undefined,
        routines,
        desk: desks.new_project === 'none' ? 'none' : 'own',
      });
      res.json(seed);
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  const launch = async (req: express.Request, res: express.Response, houseSeat?: 'mika'): Promise<unknown> => {
    const accepted = acceptedLaunchBody(houseSeat === 'mika' ? mikaLaunchBody(req.body) : req.body);
    req.body = accepted.body;
    const sessionType = String(req.body.session_type);
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: '`name` is required for every session type.' });
    if (!isValidName(name)) return res.status(400).json({ error: 'Use letters, digits, _ or - (no spaces, . or :).' });

    if (sessionType === 'bare_metal_agent') {
      if (!String(req.body?.project_root ?? '').trim()) {
        return res.status(400).json({ error: 'A `bare_metal_agent` requires `project_root` for its working directory; it is placement, not Ronin birth material.' });
      }
    }
    const sessionRole = String(req.body?.session_role ?? '').trim();
    const team = String(req.body?.team ?? '').trim();
    const form: SpawnForm = {
      session_type: sessionType as SpawnForm['session_type'],
      house_seat: houseSeat,
      session_role: sessionRole,
      team: team || undefined,
      team_lead: req.body?.team_lead === true,
      prompt: String(req.body?.instructions ?? req.body?.prompt ?? '').trim(),
      name,
      dial: req.body?.dial === 'user' || req.body?.dial === 'read' || req.body?.dial === 'write' ? req.body.dial : undefined,
      project_root: String(req.body?.project_root ?? '').trim() || undefined,
      cmd: String(req.body?.cmd ?? '').trim() || undefined,
      model: String(req.body?.model ?? '').trim() || undefined,
      provider: String(req.body?.provider ?? '').trim() || undefined,
      launch_mode: req.body?.launch_mode === 'configured' || req.body?.launch_mode === 'live_dangerously'
        ? req.body.launch_mode
        : undefined,
      mandate: sessionType === 'cowork_agent' && req.body?.mandate !== undefined
        ? mandate(req.body.mandate)
        : undefined,
      campaign_id: String(req.body?.campaign_id ?? '').trim() || undefined,
      kind: typeof req.body?.kind === 'string' ? req.body.kind : undefined,
      behaviours: Array.isArray(req.body?.behaviours) ? req.body.behaviours.map(String) : undefined,
      routines: req.body?.routines && typeof req.body.routines === 'object' && !Array.isArray(req.body.routines)
        ? routineChoices(req.body.routines)
        : undefined,
      template: typeof req.body?.template === 'string' ? req.body.template : undefined,
      gbrain_mode: req.body?.gbrain_mode === 'connected' || req.body?.gbrain_mode === 'disconnected' ? req.body.gbrain_mode : undefined,
      tags: Array.isArray(req.body?.tags) ? req.body.tags.map(String) : [],
      seed: Array.isArray(req.body?.seed) ? req.body.seed.map(String) : [],
      inject: String(req.body?.inject ?? '').trim() || undefined,
      reference: String(req.body?.reference ?? '').trim() || undefined,
      desk: req.body?.desk === 'own' || req.body?.desk === 'none' ? req.body.desk : undefined,
    };

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
        if (!resolved.assignment.desks.length) {
          resolved.assignment = null;
          resolved.dir = (await listProjectRoots()).find((root) => root.name === resolved.project_root)?.dir ?? resolved.dir;
        }
      } catch (e) {
        console.warn(`[launch] desk preparation warning: ${String((e as Error)?.message ?? e)}`);
        resolved.assignment = null;
        resolved.dir = (await listProjectRoots()).find((root) => root.name === resolved.project_root)?.dir ?? resolved.dir;
      }
    }

    if (resolved.session_type === 'cowork_agent' && resolved.agent) {
      birthKey = `${resolved.name}-${Date.now()}`;
      birthDir = sessionRecordDir(birthKey);
      try {
        const sources = [...resolved.birth_reading];
        const readme = await compileBirthReadmeAt(birthDir, sources, resolved.name, isShelfTeaching);
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
        ? await projectRoutineTools(resolved.name, resolved.routines)
        : null;
      await createSession(resolved.name, resolved.dir, {
        agent: resolved.agent,
        exempt: resolved.capExempt,
        argv: launch.argv,
        env: routineTools ? { PATH: routineTools.path } : undefined,
        control: resolved.agent ? 'user' : undefined,
        key: birthKey || undefined,
        // The Services switch as resolved for THIS Agent at birth (campaign < team < form):
        // off means RIREKI never records it. Set here and never again — nothing cascades
        // onto a running session (owner, 2026-09-04). A terminal has no Routines and keeps
        // the recorder's own default.
        rireki: resolved.routines.length ? resolved.routines.some((routine) => routine.name === 'ronin_services' && routine.enabled) : undefined,
      });
      runtimeBorn = true;
      if (birthKey) rememberSessionKey(resolved.name, birthKey);
      if (resolved.tags.length) {
        await setTags(resolved.name, resolved.tags);
        await announceTeamChanges(resolved.name, [], resolved.tags).catch(() => {});
      }
      if (form.team_lead && resolved.team) await setLeads(resolved.name, [resolved.team]);
      if (resolved.project_root && resolved.session_type !== 'bare_metal_agent') await setProjectRoot(resolved.name, resolved.project_root);
      const campaignId = resolved.session_type === 'bare_metal_agent'
        ? (form.campaign_id || await initialCampaignId())
        : await birthCampaign(resolved.team, form.campaign_id);
      await setCampaign(resolved.name, campaignId);
      await setLaunchStamp(resolved.name, resolved.launchAgent);
      if (providerSession.id) await setProviderSessionId(resolved.name, providerSession.id);
      if (resolved.session_type === 'cowork_agent') {
        await seedTegami(
          resolved.name,
          resolved.assignment?.desks.length
            ? resolved.assignment.desks.map((d) => ({ repo: d.repo, branch: d.branch, worktree: d.worktree, line: d.line }))
            : await checkoutAt(resolved.dir),
        await deriveTeams(resolved.tags),
        resolved.mandate,
      );
      }
      await setControl(resolved.name, resolved.dial);
    } catch (e) {
      if (birthDir && !runtimeBorn) await rm(birthDir, { recursive: true, force: true });
      void appendLaunchLedger(form, resolved, false);
      if (e instanceof AtSessionMax) {
        return res.status(429).json({ error: e.message, max: e.max, live: e.live });
      }
      return res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }

    count('born', {
      name: resolved.name,
      born: 'launch',
      role: resolved.session_role,
    });
    emitSessionBorn({
      name: resolved.name,
      role: resolved.session_role,
      team: resolved.team,
      root: resolved.project_root,
      cmd: resolved.cmd,
    });

    if (resolved.session_type === 'bare_metal_agent') {
      res.json({
        ok: true,
        name: resolved.name,
        session_type: resolved.session_type,
        dir: resolved.dir,
        cmd: resolved.cmd,
        tags: resolved.tags,
        campaign_id: form.campaign_id || await initialCampaignId(),
        birth: 'none',
      });
    } else {
      const receipt = {
        session_type: resolved.session_type,
        session_role: resolved.session_role,
        team: resolved.team,
        project_root: resolved.project_root,
        dir: resolved.dir,
        cmd: resolved.cmd,
        dial: resolved.dial,
        tags: resolved.tags,
        gbrain_mode: resolved.gbrain_mode,
        team_lead: !!form.team_lead && !!resolved.team,
        kind: resolved.kind,
        behaviours: resolved.behaviours,
        ignored: [...new Set([...accepted.ignored, ...resolved.ignored])].sort(),
        stated_by: resolved.stated_by,
        ...(resolved.session_type === 'cowork_agent'
          ? { boot: { state: 'open', brief: launch.parked ? 'parked' : 'argv' } }
          : {}),
        // What the newborn was handed to read: size, section count, the line it ends with,
        // and whether one read delivers it. The receipt says what left; the tape says what
        // arrived (the ACK asks the newborn to quote the terminator).
        ...(packet ? { packet } : {}),
        desks: resolved.assignment?.desks.map((d) => ({ repo: d.repo, branch: d.branch, worktree: d.worktree, line: d.line })) ?? [],
        desk_note: await deskNote(resolved),
        routines: resolved.routines.map((routine) => {
          const services = new Set(listServices());
          const missing = routine.enabled
            ? [
                ...routine.tools.filter((tool) => routineTools?.missing.includes(tool)).map((tool) => `tool:${tool}`),
                ...routine.mcp.filter((name) => !services.has(name)).map((name) => `mcp:${name}`),
              ]
            : [];
          return {
            name: routine.name,
            on: routine.enabled,
            stated_by: routine.stated_by,
            delivered: routine.enabled && missing.length === 0,
            missing,
            mcp: routine.enabled ? routine.mcp.filter((name) => services.has(name)) : [],
          };
        }),
      };
      try {
        await persistBirthReceipt(resolved.name, receipt);
      } catch (e) {
        return res.status(500).json({ error: `Session was born, but its birth receipt could not be persisted: ${String((e as Error)?.message ?? e)}` });
      }
      res.json({ ok: true, name: resolved.name, receipt });
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
  app.post('/api/mika', (req, res) => launch(req, res, 'mika'));

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
}
