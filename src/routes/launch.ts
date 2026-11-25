import type { IncomingMessage } from 'node:http';
import express from 'express';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  capturePane,
  createSession,
  exactPane,
  isValidName,
  listSessions,
  sessionDir,
  sessionExists,
  sessionOfPane,
  setSessionIdentity,
  setLeads,
  setCampaign,
  setProjectRoot,
  setTags,
} from '../tmux.js';
import { launchArgv } from '../agents.js';
import { AtSessionMax, readAgentsSection } from '../machine-state.js';
import { PACKET_PLACEHOLDER, resolveForm, type SpawnForm } from '../spawn.js';
import { agentBriefOf } from '../brief-build.js';
import { briefTold } from '../brief-settings.js';
import { HELP_LINE } from '../brief.js';
import { appendLaunchLedger, persistBirthReceipt } from '../launch-ledger.js';
import { mandate } from '../agent-defaults.js';
import { asksForInput, classifyStatus } from '../status.js';
import { enqueueMessage } from '../message-queue.js';
import { scanContext, scanModel } from '../ctx.js';

import { count } from '../counts.js';
import { listTeamRosters } from '../team-rosters.js';
import { announceTeamChanges } from './wipeboards-api.js';
import { checkoutAt, deriveTeams, parkBrief, seedTegami, teamChanged, withAxes, writeBriefRecord, writeConfiguration, type SessionWithAxes } from '../tegami.js';
import { callerOf } from './work-items-api.js';
import { collectBirthLines, sockets } from '../sockets.js';
import { answered, answerKeys, createNoProgress, forgetHooks, keepHookRecord, parseHookEvent, readFields, recordHook } from '../asking.js';
import { tmux } from '../tmux-client.js';
import { stoppedAt } from '../stopped.js';
import { broadcastEvent, listening, pushTeams, type CardPart } from '../ws/events.js';
import { readWorkspace } from '../workspaces.js';
import { initialCampaignId } from '../campaign-scope.js';
import { readTeamRoster } from '../team-rosters.js';
import { readCampaign } from '../campaigns.js';
import { listInstallations } from '../resource-adapters.js';
import { resolveLaunchSeed, shownLaunchSeed } from '../launch-seed.js';
import type { SessionsDefaults } from '../launch-command.js';
import { describePacket, readFirstSentence, writeBriefPacketAt, type PacketReport } from '../birth-brief.js';
import { rememberSessionKey, sessionDir as sessionRecordDir } from '../session-dir.js';
import { callerUser } from '../agent-configuration.js';
import { person } from '../office-people.js';
import type { HouseSeat } from '../house-seats.js';
import { readThread, type InboxEntry } from '../seats.js';
import { readTegami } from '../tegami-read.js';
import { ensureMikaHome, MIKA_PROMPTS, MikaUnavailable, resolveConfiguredMikaModel, type MikaSelection } from '../mika-runtime.js';
import { compileMikaKnowledgeAt } from '../mika-knowledge.js';
import { isMikaTab } from '../mika-context.js';
import { ensureSteercoTeam, recordRoninHelperWelcome, roninHelperWelcomeState, RONIN_HELPER_LOADER, STEERCO_TEAM } from '../ronin-helper.js';
import { REPO_ROOT, storeDir } from '../resources.js';
import { providerPart } from '../provider-parts.js';

const MIKA_SESSION = 'mika_agent' as const;

async function birthCampaign(team: string, explicit = ''): Promise<string> {
  if (explicit) return explicit;
  const roster = team ? await readTeamRoster(team).catch(() => null) : null;
  return roster?.campaign_id || (await initialCampaignId());
}


const LAUNCH_KEYS = new Set([
  'session_type', 'team', 'team_lead', 'role', 'instructions', 'prompt', 'name', 'caller',
  'cmd', 'model', 'provider', 'mandate', 'campaign_id',
  'tags', 'seed', 'inject', 'reference',
  'brief', 'integrations', 'pm',
  'agent_type',
]);
const RETURNED_LAUNCH_KEYS = new Set([
  'assignment', 'work_locations', 'posture', 'opening', 'ack', 'capExempt', 'launchAgent', 'stated_by', 'birth_reading',
]);
const SESSION_TYPES = new Set(['cowork_agent', 'bare_metal_agent', 'terminal']);

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

  if (body.tags !== undefined && !Array.isArray(body.tags)) drop('tags');
  if (body.seed !== undefined && !Array.isArray(body.seed)) drop('seed');
  if (body.role !== undefined && !['coworker', 'lead', 'epic_lead', 'coordinator'].includes(String(body.role))) drop('role');

  const inapplicable = sessionType === 'terminal'
      ? ['provider', 'model', 'instructions', 'prompt', 'mandate', 'brief', 'integrations', 'pm', 'cmd', 'seed', 'inject', 'reference', 'role']
    : sessionType === 'bare_metal_agent'
      ? ['mandate', 'brief', 'integrations', 'pm', 'seed', 'inject', 'reference', 'team_lead', 'role']
      : [];
  for (const key of inapplicable) drop(key);

  return { body, ignored: [...ignored].sort() };
}

export function spawnFormFromLaunchBody(body: Record<string, unknown>, houseSeat?: HouseSeat): SpawnForm {
  const sessionType = String(body.session_type);
  const team = String(body.team ?? '').trim();
  const role = body.team_lead === true ? 'lead' : ['coworker', 'lead', 'epic_lead', 'coordinator'].includes(String(body.role)) ? String(body.role) as SpawnForm['role'] : 'coworker';
  return {
    session_type: sessionType as SpawnForm['session_type'],
    house_seat: houseSeat,
    agent_type: body.agent_type === 'irasshai' ? 'irasshai' : undefined,
    team: team || undefined,
    team_lead: role === 'lead',
    role,
    prompt: String(body.instructions ?? body.prompt ?? '').trim(),
    name: String(body.name ?? '').trim(),
    cmd: String(body.cmd ?? '').trim() || undefined,
    model: String(body.model ?? '').trim() || undefined,
    provider: String(body.provider ?? '').trim() || undefined,
    mandate: sessionType === 'cowork_agent' && body.mandate !== undefined ? mandate(body.mandate) : undefined,
    campaign_id: String(body.campaign_id ?? '').trim() || undefined,
    ...(sessionType === 'cowork_agent' ? agentBriefOf(body) : {}),
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    seed: Array.isArray(body.seed) ? body.seed.map(String) : [],
    inject: String(body.inject ?? '').trim() || undefined,
    reference: String(body.reference ?? '').trim() || undefined,
  };
}

export function mikaLaunchBody(input: unknown, selection?: Pick<MikaSelection, 'provider' | 'model'>): Record<string, unknown> {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return {
    session_type: 'cowork_agent',
    name: MIKA_SESSION,
    tags: [STEERCO_TEAM],
    // She discusses, recruits nobody, and hands back ideas — never a plan (owner, 2026-09-09).
    mandate: { reach: 'discuss', recruit: 'nobody', output: ['ideas'] },
    prompt: typeof source.prompt === 'string' ? source.prompt : '',
    ...(selection ? { provider: selection.provider, model: selection.model } : {}),
  };
}

type InProcessLaunch = (body: Record<string, unknown>, from?: Pick<IncomingMessage, 'headers'>) => Promise<{ status: number; body: Record<string, unknown> }>;
let inProcessLaunch: InProcessLaunch | null = null;
/**
 * POST /api/launch from inside the server: the same session creation, the same body New Agent
 * sends, its answer returned. `from` is the browser request a part answers, when there is one:
 * its person is the Agent's user, as on New Agent. Throws before registerLaunch has run.
 */
export function launchSession(body: Record<string, unknown>, from?: Pick<IncomingMessage, 'headers'>): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!inProcessLaunch) throw new Error('launchSession: the launch route is not registered yet.');
  return inProcessLaunch(body, from);
}

export interface LaunchControl {
  ensureMika(intent?: 'help' | 'setup_provider_ready', tab?: string): Promise<{ ok: boolean; state: 'ready' | 'starting' | 'action_required' | 'refused'; action?: 'pending_user'; session: typeof MIKA_SESSION; team: typeof STEERCO_TEAM; loader: typeof RONIN_HELPER_LOADER; already?: boolean; welcome_delivered?: boolean; error?: string; code?: string; available_levels?: unknown }>;
}

export function mikaReadinessFromPane(text: string): 'ready' | 'starting' | 'action_required' {
  const state = classifyStatus(text);
  return state === 'awaiting-input' ? 'action_required' : state === null ? 'starting' : 'ready';
}

// The pane is read for the CLI's own context gauge and model line, and, for a CLI without hooks,
// for a question it draws (KAN-527). What a CLI with hooks is doing is its hook record
// (src/asking.ts); a CLI without them, its output's newest line, through the transcript part's
// row field. Both are the card's fields part.
const readPane = async (name: string) => {
  const text = await capturePane(name, 0).catch(() => '');
  return { ctx: scanContext(text), model: scanModel(text), asking: asksForInput(text) };
};

/** AN AGENT FLAG (owner, 2026-11-15, KAN-527): the Agent itself waits on the owner, not an
 * item. Derived from the CLI's hooks and the pane, never stored: it goes when the CLI moves on. Its
 * card adds it to its work record's `flags` with no id ({ why }), and every surface shows ⚑ for it. */
export const ASKING_FLAG = 'asking';
export const NO_PROGRESS_FLAG = 'no_progress';
export const STOPPED_FLAG = 'stopped'; // its pane died (src/pane-death.ts, KAN-660)
const noProgress = createNoProgress((name) => sockets.rowChanged(name));

// Each card's parts as last read, so a rebuild reads only the part that was marked.
const panes = new Map<string, Awaited<ReturnType<typeof readPane>>>();
const fields = new Map<string, Awaited<ReturnType<typeof readFields>>>();
const records = new Map<string, Awaited<ReturnType<typeof readTegami>>>();
const threads = new Map<string, InboxEntry[]>();
sockets.onSessionEnd((name) => { panes.delete(name); fields.delete(name); records.delete(name); threads.delete(name); });
const part = async <T>(held: Map<string, T>, name: string, again: boolean, read: (name: string) => Promise<T>): Promise<T> => {
  if (again || !held.has(name)) held.set(name, await read(name));
  return held.get(name)!;
};

/** ONE AGENT'S CARD: what /events pushes as {t:'card'} (src/ws/events.ts), from its listing
 * entry, its pane, its parts' row fields and its work record, re-reading only `parts`. */
export async function cardOf(s: SessionWithAxes, parts: ReadonlySet<CardPart>) {
  const [pane, row, tegami] = await Promise.all([
    part(panes, s.name, parts.has('pane'), readPane),
    part(fields, s.name, parts.has('fields'), readFields),
    part(records, s.name, parts.has('record'), readTegami),
  ]);
  // A seat's tile shows its thread where a terminal would be: both ways, marked with its record.
  const thread = s.seat ? await part(threads, s.name, parts.has('record'), (name) => readThread(name)) : null;
  // The CLI's hook record says so (src/asking.ts), or, for a CLI without hooks, the screen does.
  const { asking: onScreen, ...gauges } = pane;
  const { hooked, ...contributed } = row;
  const asking = contributed.stance === 'asking' || (!hooked && onScreen);
  const stopped_at = asking ? undefined : stoppedAt(s.name, contributed.at);
  // Working with nothing new in its conversation for 12 minutes: flagged too (KAN-618).
  const stuck = !asking && !stopped_at && noProgress.check(s.name, contributed.stance, contributed.at);
  const flag = asking ? ASKING_FLAG : stuck ? NO_PROGRESS_FLAG : contributed.stance === 'stopped' ? STOPPED_FLAG : null;
  const reports = contributed.stance_reports;
  return {
    ...s,
    ...gauges,
    ...contributed,
    // A question on the screen is asking, whatever the log's newest line says; a Stop Ronin
    // sent reads interrupted until the Agent writes a line or is sent to (stopped.ts).
    stance: flag ?? (stopped_at ? 'interrupted' : contributed.stance ?? 'unknown'),
    ...(Array.isArray(reports) && !reports.includes('asking') ? { stance_reports: ['asking', ...reports] } : {}),
    ...(stopped_at ? { stopped_at } : {}),
    ...(tegami ? { tegami: flag ? { ...tegami, flags: [...tegami.flags, { why: flag }] } : tegami } : {}),
    ...(thread ? { thread } : {}),
  };
}

// Mika is ready when her pane says so, and nothing announces that. While she is starting
// and a browser is connected, the server looks again at the pace a tab used to ask, and
// pushes {t:'mika', ...ready} each time the answer changes, until it is not starting.
let watchingMika: Promise<void> | null = null;
export function watchMika(observe: () => Promise<{ state: string } & Record<string, unknown>>, from: { state: string }, paceMs = 350): Promise<void> | null {
  if (watchingMika || from.state !== 'starting') return watchingMika;
  watchingMika = (async () => {
    let last = from.state;
    while (listening()) {
      await new Promise((resolve) => setTimeout(resolve, paceMs));
      const ready = await observe().catch(() => null);
      if (!ready) return;
      if (ready.state !== last) broadcastEvent({ t: 'mika', ...ready });
      last = ready.state;
      if (ready.state !== 'starting') return;
    }
  })().finally(() => { watchingMika = null; });
  return watchingMika;
}

export function registerLaunch(app: express.Express): LaunchControl {
  type MikaReady = Awaited<ReturnType<LaunchControl['ensureMika']>>;
  let mikaStarting: Promise<MikaReady> | null = null;

  // A CLI hook's event (ronin_bin/ronin-asking), whole or cut short, as text: kept as the
  // Agent's hook record, which pushes its card; answered once kept, so events land in order.
  app.post('/api/asking', express.text({ type: '*/*', limit: '256kb' }), async (req, res) => {
    const name = typeof req.query.pane === 'string' ? await sessionOfPane(req.query.pane) : null;
    if (name && await recordHook(name, parseHookEvent(String(req.body ?? ''))).catch(() => false)) sockets.rowChanged(name);
    res.json({ ok: true });
  });
  sockets.onSessionEnd((name) => { forgetHooks(name); noProgress.forget(name); });

  // AN ANSWER FROM CHAT (KAN-658): the question on the Agent's hook record, answered by typing
  // its keys into the terminal; the record then says so, since a declined prompt fires no hook.
  app.post('/api/sessions/:name/answer', async (req, res) => {
    const session = (await listSessions()).find((s) => s.name === req.params.name);
    if (!session || session.key !== req.body?.key) return res.status(409).json({ error: 'This Agent session changed. Reopen its Tile.' });
    const question = (await readFields(session.name)).question;
    if (!question) return res.status(409).json({ error: 'The question is already answered.' });
    const keys = answerKeys(session.identity?.cli || session.agent, question, req.body?.answer ?? {});
    if (!keys) return res.status(400).json({ error: 'Answer this one in Terminal.' });
    try {
      await tmux.run(['send-keys', '-t', exactPane(session.name), '-X', 'cancel']).catch(() => {});
      // One key at a time: a CLI's menu redraws between them.
      for (const key of keys) {
        await tmux.run(['send-keys', '-t', exactPane(session.name), key]);
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    } catch (e) { return res.status(409).json({ error: (e as Error).message }); }
    await keepHookRecord(session.name, answered(req.body.answer));
    sockets.rowChanged(session.name);
    res.json({ ok: true });
  });

  app.get('/api/launch-seed', async (req, res) => {
    try {
      const campaign_id = String(req.query.campaign_id ?? '').trim() || await initialCampaignId();
      const team = String(req.query.team ?? '').trim();
      const campaign = campaign_id ? await readCampaign(campaign_id) : null;
      if (!campaign) return res.status(404).json({ error: `Unknown Campaign: ${campaign_id || '(none)'}.` });
      if (team && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(team)) {
        return res.status(400).json({ error: `A team name is lowercase letters, digits, _ and -: "${team}".` });
      }
      const [roster, agents] = await Promise.all([
        team ? readTeamRoster(team, campaign_id).then((found) => found ?? readTeamRoster(team, '')) : Promise.resolve(null),
        readAgentsSection(),
      ]);
      if (team && !roster) return res.status(404).json({ error: `Unknown Team "${team}" in Campaign "${campaign_id}".` });
      const seed = resolveLaunchSeed({
        campaign,
        roster,
        workspace: roster?.workspace ? await readWorkspace(roster.campaign_id, roster.workspace) : null,
        sessions: agents.sessions as SessionsDefaults | undefined,
        lead: req.query.lead === '1',
      });
      res.json(shownLaunchSeed(seed));
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  const launch = async (req: express.Request, res: express.Response, houseSeat?: 'mika', loader?: typeof RONIN_HELPER_LOADER): Promise<unknown> => {
    let mikaSelection: MikaSelection | undefined;
    let mikaHome = '';
    if (houseSeat === 'mika') {
      if (await sessionExists(MIKA_SESSION)) return res.json({ ok: true, name: MIKA_SESSION, already: true });
      try {
        mikaHome = await ensureMikaHome();
        if (loader === RONIN_HELPER_LOADER) { await ensureSteercoTeam(); void pushTeams(); }
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

    const form = spawnFormFromLaunchBody(req.body, houseSeat);
    // The user an Agent works for, in a hosted office: the person launching, or for an Agent
    // made by an Agent, that Agent's user (docs/architecture/brief.md, The work record is the source of truth).
    const launcher = person(req) ?? await callerUser(String(req.body?.caller ?? '').trim());
    if (launcher) form.person = launcher;

    let resolved;
    let launch: { argv: string[]; parked: boolean; message?: boolean } = { argv: [], parked: false };
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

    if (resolved.session_type === 'cowork_agent' && resolved.agent) {
      birthKey = `${resolved.name}-${Date.now()}`;
      birthDir = sessionRecordDir(birthKey);
      try {
        // The brief, generated (src/brief.ts). Mika's own addition is her generated source
        // index, the bounded map of her knowledge, carried inside the packet before its end.
        let text = resolved.composed?.text ?? '';
        if (houseSeat === 'mika') {
          const knowledge = await compileMikaKnowledgeAt(mikaHome);
          const index = (await readFile(knowledge.index, 'utf8')).trim();
          text = text.replace(`\n${HELP_LINE}`, `\n${index}\n\n${HELP_LINE}`);
        }
        const brief = await writeBriefPacketAt(birthDir, text, resolved.name);
        packet = await describePacket(brief, resolved.name);
        resolved.brief = resolved.brief.replace(PACKET_PLACEHOLDER, readFirstSentence(packet));
      } catch (e) {
        if (birthDir) await rm(birthDir, { recursive: true, force: true });
        return res.status(500).json({ error: `Could not compile this Agent's birth brief: ${String((e as Error)?.message ?? e)}` });
      }
    }

    try {
      let hermesEnv: Record<string, string> = {};
      if (resolved.identity?.provider === 'hermes') {
        if (!birthDir) throw new Error('Named Hermes setups require a Cowork agent session.');
        // The person on the birth receipt (user_email) labels this Agent's house calls (KAN-621).
        hermesEnv = { RONIN_SETUP_ID: resolved.identity.model, ...(form.person?.email ? { RONIN_PERSON: form.person.email } : {}) };
      }
      const launchWords = resolved.session_type === 'bare_metal_agent' ? (form.prompt ?? '') : resolved.brief;
      launch = resolved.agent ? await launchArgv(resolved.cmd, launchWords) : { argv: [], parked: false };
      // A part's provider (src/provider-parts.ts) wraps the argv of an Agent born on its rows.
      const part = providerPart(resolved.identity?.provider ?? '');
      if (part?.wrapLaunch && launch.argv.length) launch = { ...launch, argv: part.wrapLaunch([...launch.argv], form.person?.email ?? '') };
      if (resolved.agent && !launch.argv.length) {
        if (birthDir) await rm(birthDir, { recursive: true, force: true });
        return res.status(400).json({
          error: `Could not find ${resolved.cmd.trim().split(/\s+/)[0]} on this machine. Install it from ⚙ Configuration, then launch again.`,
        });
      }
      const campaignId = resolved.session_type === 'bare_metal_agent'
        ? (form.campaign_id || await initialCampaignId())
        : await birthCampaign(resolved.team, form.campaign_id);
      const transcriptOn = (await readCampaign(campaignId))?.config.services.parts.terminal_transcript === true;
      await createSession(resolved.name, resolved.dir, {
        agent: resolved.agent,
        cli: resolved.launchAgent,
        team: resolved.team,
        exempt: resolved.capExempt,
        argv: launch.argv,
        // PATH and the operator socket come from processLaunch (birthEnv), for every start.
        env: hermesEnv,
        key: birthKey || undefined,
        // The Services switch as resolved for THIS Agent at birth (campaign < team < form):
        // off means RIREKI never records it. Set here and never again — nothing cascades
        // onto a running session (owner, 2026-09-04). A terminal has no Routines and keeps
        // the recorder's own default.
        rireki: houseSeat !== 'mika'
          ? resolved.installations.some((installation) => installation.name === 'ronin_services' && installation.enabled) && transcriptOn
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
      if (resolved.workspace) await setProjectRoot(resolved.name, resolved.workspace);
      await setCampaign(resolved.name, campaignId);
      if (resolved.session_type === 'cowork_agent') {
        await seedTegami(
          resolved.name,
          await checkoutAt(resolved.dir),
        await deriveTeams(resolved.name, resolved.tags),
        resolved.mandate,
      );
        // The brief document, whole: the session's one authority for its brief from here on.
        if (resolved.composed) await writeBriefRecord(resolved.name, resolved.composed.doc);
      }
      await writeConfiguration(resolved.name).catch(() => {});
      // By whoever made the Agent (session_create's caller, else the browser's owner), so a
      // lead who raises a member is not told of its own act.
      if (resolved.tags.length) await teamChanged(resolved.tags, String(req.body?.caller ?? '').trim() || callerOf(req)).catch(() => {});
    } catch (e) {
      if (birthDir && !runtimeBorn) await rm(birthDir, { recursive: true, force: true });
      void appendLaunchLedger(form, resolved, false);
      if (e instanceof AtSessionMax) {
        return res.status(429).json({ error: e.message, max: e.max, live: e.live });
      }
      return res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }

    count('born', { name: resolved.name, born: 'launch' });


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
        workspace: resolved.workspace,
        dir: resolved.dir,
        cmd: resolved.cmd,
        tags: resolved.tags,
        team_lead: !!form.team_lead && !!resolved.team,
        role: form.role ?? (form.team_lead ? 'lead' : 'coworker'),
        ...(form.person?.email ? { user_email: form.person.email } : {}),
        mandate: resolved.mandate,
        // What the brief told, by name and depth, and why (docs/architecture/brief.md, Layers and brief settings).
        told: resolved.composed ? briefTold(resolved.composed.resolved) : [],
        ignored: [...new Set([...accepted.ignored, ...resolved.ignored])].sort(),
        stated_by: resolved.stated_by,
        ...(resolved.session_type === 'cowork_agent'
          ? { boot: { state: 'open', brief: launch.parked ? 'parked' : launch.message ? 'message' : 'argv' } }
          : {}),
        // What the newborn was handed to read: size, section count, the line it ends with,
        // and whether one read delivers it. The receipt says what left; the tape says what
        // arrived (the ACK asks the newborn to quote the terminator).
        ...(packet ? { packet } : {}),
        installations: resolved.installations.map((installation) => ({
          name: installation.name,
          on: installation.enabled,
          delivered: installation.enabled,
          missing: [],
        })),
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
      // A CLI with no prompt-and-stay-open flag gets its brief as its first message, held in the
      // queue until its screen reads ready (docs/agents/README.md, launch_initial: message).
      if (launch.message) await enqueueMessage(resolved.name, resolved.brief, 'house', undefined, null, { when: 'ready' });
      const birthLines = await collectBirthLines(resolved.name, true);
      const shelved = [launch.parked ? resolved.brief : '', birthLines].filter(Boolean).join('\n');
      if (!shelved) return;
      // A brief that never reached the Agent is parked in brief.md beside the session; no
      // work item is made for it (docs/using-ronin/running-work-items.md: items only for work).
      await parkBrief(resolved.name, shelved);
    })().catch((e) => console.error(`[ronin] spawn ${resolved.name}:`, e));
  };
  const launchJob: express.RequestHandler = (req, res) => launch(req, res);
  // The same launch, called from inside the server (a part): the browser request it answers, if any.
  inProcessLaunch = async (body, from) => {
    let status = 200;
    let answer: Record<string, unknown> = {};
    const response = {
      status(code: number) { status = code; return this; },
      json(value: unknown) { answer = value && typeof value === 'object' ? value as Record<string, unknown> : {}; return value; },
    } as unknown as express.Response;
    await launch({ body, headers: from?.headers ?? {} } as express.Request, response);
    return { status, body: answer };
  };
  app.post('/api/launch', launchJob);
  app.post('/api/mika', (req, res) => launch(req, res, 'mika', RONIN_HELPER_LOADER));

  app.get('/api/sessions', async (_req, res) => {
    try {
      res.json(await withAxes(await listSessions()));
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
    const metadata = { session: MIKA_SESSION, team: STEERCO_TEAM, loader: RONIN_HELPER_LOADER };
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
    const tab = isMikaTab(req.body?.tab) ? req.body.tab : '';
    const ready = await ensureMika(intent, tab);
    res.status(ready.ok ? 200 : ready.state === 'starting' ? 202 : 409).json(ready);
    watchMika(() => ensureMika(intent, tab), ready);
  });
  return { ensureMika };
}
