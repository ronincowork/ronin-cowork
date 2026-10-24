import { readLaunchIdentity } from '../launch-binding.js';
import { resolveLaunchJournal } from '../launch-journal.js';
import fs from 'node:fs';
import type express from 'express';
import {
  getLeads,
  getWipeboards,
  getProviderSessionId,
  getCampaign,
  getProjectRoot,
  getTags,
  isValidName,
  killSessionTree,
  listSessions,
  sessionExists,
  sessionOfPane,
  setLeads,
  setProjectRoot,
  setTags,
  setWipeboards,
  createSession,
  sessionRuntime,
  setLaunchStamp,
  setSessionIdentity,
  setProviderSessionId,
  setSessionKey,
  setSessionTitle,
  stopSessionTree,
} from '../tmux.js';
import { enqueueMessage } from '../message-queue.js';
import { callerOf } from './work-items-api.js';
import { sessionKey } from '../session-dir.js';
import { isValidRootName, listProjectRoots } from '../project-roots.js';
import { expandLookup } from '../lookup.js';
import { count } from '../counts.js';
import { broadcastEvent, pushTeams } from '../ws/events.js';
import { announceTeamChanges } from './wipeboards-api.js';
import { memberEnded, teamChanged, writeConfiguration, writeTeams } from '../tegami.js';
import { conditionalBehaviourPath } from '../behaviours.js';
import { readAgentComposition } from '../agent-composition.js';
import { configurationSends, updateConfiguration } from '../agent-configuration.js';
import { mandate } from '../agent-defaults.js';
import { emitSessionEnd } from '../sockets.js';
import { releaseHolder } from '../work-items.js';
import { resumeAgentArgv } from '../agents.js';
import { listTeamRosters } from '../team-rosters.js';
import { assertSameCampaignRoot, assertSameCampaignTeams } from '../campaign-scope.js';
import { sessionDir as sessionRecordDir } from '../session-dir.js';
import {
  listArchives,
  readArchive,
  removeArchive,
  providerSessionInfo,
  writeArchive,
  type ArchivedSession,
} from '../session-archive.js';
import { ignoreEndingRequest, inspectSessionEnding, promptEnding } from '../desks/ending-runtime.js';
import type { EndingRequest } from '../desks/ending.js';
import { resolveEndingRequest } from '../desks/ending-response.js';
import { randomUUID } from 'node:crypto';
import { hardDeleteConfirmation, shutdownAgent, ShutdownRefused, ShutdownSlots, type ShutdownProgress } from '../desks/session-shutdown.js';
import { listDesks } from '../desks/registry.js';

interface PreparedEnding { proceed: boolean; acknowledgement?: Record<string, unknown> }

export const teamLeadAcknowledgement = (teams: readonly string[], reading?: string): string =>
  `You are now the team_lead of ${teams.map((team) => `"${team}"`).join(', ')}. ` +
  `Reading assignment: read ${reading ?? 'the Team lead conditional Behavior'} now for what a Team lead does.`;

interface ShutdownOperation extends ShutdownProgress {
  id: string;
  session: string;
  state: 'running' | 'complete' | 'failed';
  closed: string[];
  error?: string;
  blockers?: ShutdownRefused['blockers'];
  mode?: 'shutdown' | 'hard_delete';
  destructive?: { closed: string[]; quarantined: Array<{ desk: string; quarantine_id: string }> };
}

const publicArchive = ({ id, name, archived_at, agent, tags }: ArchivedSession) => ({ id, name, archived_at, agent, tags });

const shutdownOperations = new Map<string, ShutdownOperation>();
// A shutdown as it stands: what {t:'want', resource:'shutdown', id} answers a socket that
// reopened mid-shutdown. Finished operations are kept five minutes.
export const shutdownOperation = (id: string): ShutdownOperation | null => shutdownOperations.get(id) ?? null;
const shutdownSlots = new ShutdownSlots();

async function openDeskRefusal(name: string): Promise<string> {
  const desks = (await listDesks({ owner: name })).filter((desk) => desk.state === 'open');
  return desks.length
    ? `Session "${name}" owns open desk${desks.length === 1 ? '' : 's'} ${desks.map((desk) => `${desk.repo}:${desk.branch}`).join(', ')}. Archive leaves managed-desk custody unchanged; run session_end or Shut down Agent after closeout instead.`
    : '';
}

/** The ending Agent's holds are released and its leads' members lists drop it; an end never fails on either. */
async function releaseHolds(name: string, key: string, how: string): Promise<void> {
  await releaseHolder(name, key, how).catch((e) => console.error(`[ronin] releasing ${name}'s work items:`, e));
  await memberEnded(name).catch(() => {});
}

async function performAgentShutdown(name: string, progress: (value: ShutdownProgress) => void): Promise<string[]> {
  const key = await sessionKey(name);
  const result = await shutdownAgent(name, progress, undefined, {
    operationTimeoutMs: 25_000, readTimeoutMs: 5_000, closeTimeoutMs: 15_000, stopTimeoutMs: 5_000,
  });
  emitSessionEnd(name, key);
  await releaseHolds(name, key, 'session ended');
  count('ended', { name, end: 'harakiri' });
  return result.closed;
}

async function performAgentHardDelete(name: string, progress: (value: ShutdownProgress) => void, signal: AbortSignal): Promise<NonNullable<ShutdownOperation['destructive']>> {
  signal.throwIfAborted();
  progress({ phase: 'resolving_agent', message: `Resolving Agent ${name}` });
  const key = await sessionKey(name);
  const ending = await inspectSessionEnding(name, 'hard_delete');
  signal.throwIfAborted();
  progress({ phase: 'checking_desks', message: `Checking assigned worktrees (${ending.desks.length} found)`, desk_count: ending.desks.length });
  progress({ phase: 'checking_safety', message: 'Owner confirmed destructive removal; preserving worktree evidence', desk_count: ending.desks.length });
  progress({ phase: 'closing_desks', message: `Preserving evidence and deleting owned worktrees (0/${ending.desks.length})`, desk_count: ending.desks.length });
  const disposition = await ignoreEndingRequest(ending, name, signal);
  signal.throwIfAborted(); // an expired operation may preserve evidence, but may never later kill the Agent
  progress({ phase: 'closing_desks', message: `Preserving evidence and deleting owned worktrees (${ending.desks.length}/${ending.desks.length})`, desk_count: ending.desks.length });
  progress({ phase: 'ending_agent', message: `Hard deleting Agent ${name}`, desk_count: ending.desks.length });
  await killSessionTree(name, { signal, timeoutMs: 4_000 });
  emitSessionEnd(name, key);
  await releaseHolds(name, key, 'hard deleted');
  count('ended', { name, end: 'deleted' });
  progress({ phase: 'complete', message: `Agent ${name} and ${ending.desks.length} owned worktree(s) hard deleted; destructive evidence preserved`, desk_count: ending.desks.length });
  return { closed: disposition.closed, quarantined: disposition.quarantined };
}

async function prepareSessionEnding(
  req: express.Request,
  res: express.Response,
  name: string,
  requested_action: Exclude<EndingRequest, 'retire'>,
): Promise<PreparedEnding> {
  const preflight = await inspectSessionEnding(name, requested_action);
  const disposition = String(req.body?.worktree_disposition ?? '').trim().toLowerCase();
  const decision = await resolveEndingRequest(preflight, disposition, {
    prompt: () => promptEnding(preflight),
    quarantine: () => ignoreEndingRequest(preflight),
  });
  if (decision.response) res.json(decision.response);
  return { proceed: decision.proceed, acknowledgement: decision.acknowledgement };
}

/** The Teams one side has and the other lacks. */
const moved = (before: string[], after: string[]): string[] =>
  [...after.filter((t) => !before.includes(t)), ...before.filter((t) => !after.includes(t))];

export function registerSessions(app: express.Express): void {
  app.get('/api/sessions/:name/composition', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    try {
      // What the brief carries, so the Configuration shows every behaviour, not only the choices.
      const sends = await configurationSends(name).then((rows) => ({ rows }), (e) => ({ error: String((e as Error)?.message ?? e) }));
      res.json({ ...await readAgentComposition(name), sends });
    }
    catch (e) { res.status(409).json({ error: String((e as Error)?.message ?? e) }); }
  });

  // UPDATE (owner, 2026-10-24): the Configuration's one act — write the mandate and the whole
  // chosen Behaviors list, rebuild the brief, tell the Agent once to read it.
  app.put('/api/sessions/:name/configuration', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    const behaviours = Array.isArray(req.body?.behaviours) ? req.body.behaviours.map((row: unknown) => String(row ?? '').trim()).filter(Boolean) : [];
    try { res.json({ ok: true, queued: true, ...await updateConfiguration(name, { mandate: mandate(req.body?.mandate), behaviours }) }); }
    catch (e) { res.status(500).json({ error: String((e as Error)?.message ?? e) }); }
  });

  app.get('/api/archived-sessions', async (_req, res) => {
    try {
      res.json((await listArchives()).map(publicArchive));
    }
    catch (e) { res.status(500).json({ error: String((e as Error)?.message ?? e) }); }
  });

  app.post('/api/sessions/:name/archive', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    try {
      const refusal = await openDeskRefusal(name);
      if (refusal) return res.status(409).json({ error: refusal });
      const prepared = await prepareSessionEnding(req, res, name, 'archive');
      if (!prepared.proceed) return;
      const key = await sessionKey(name);
      const runtime = await sessionRuntime(name);
      const launchIdentity = await readLaunchIdentity(key);
      if (launchIdentity) await resolveLaunchJournal(launchIdentity);
      const provider = launchIdentity
        ? (launchIdentity.providerSession ? { agent: launchIdentity.cli, id: launchIdentity.providerSession } : null)
        : await providerSessionInfo(runtime.agent, runtime.cwd, runtime.pid, await getProviderSessionId(name));
      if (!provider) return res.status(409).json({ error: `Could not identify a resumable ${runtime.agent || 'agent'} conversation.` });
      const archived: ArchivedSession = {
        version: 1, id: key, name, key, archived_at: new Date().toISOString(), cwd: runtime.cwd,
        identity: (await listSessions()).find((s) => s.name === name)?.identity,
        agent: provider.agent, provider_session_id: provider.id, tags: await getTags(name), leads: await getLeads(name),
        wipeboards: await getWipeboards(name), project_root: await getProjectRoot(name),
      };
      await writeArchive(archived);
      try { await stopSessionTree(name); }
      catch (e) {
        if (await sessionExists(name)) await removeArchive(archived.id).catch(() => {});
        throw e;
      }
      await releaseHolds(name, key, 'archived');
      count('ended', { name, end: 'archived' });
      res.json({ ok: true, archived: publicArchive(archived), ...(prepared.acknowledgement ? { worktree_acknowledgement: prepared.acknowledgement } : {}) });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.post('/api/archived-sessions/:id/rehydrate', async (req, res) => {
    try {
      const archived = await readArchive(req.params.id);
      if (await sessionExists(archived.name)) {
        return res.status(409).json({ error: `Session "${archived.name}" already exists.` });
      }
      const argv = await resumeAgentArgv(archived.agent, archived.provider_session_id);
      if (!argv.length) return res.status(409).json({ error: `${archived.agent} cannot be resumed on this machine.` });
      await createSession(archived.name, archived.cwd, { agent: true, argv, cli: archived.agent, key: archived.key, resume: true });
      try {
        await setSessionKey(archived.name, archived.key);
        await setTags(archived.name, archived.tags);
        await setLeads(archived.name, archived.leads);
        await setWipeboards(archived.name, archived.wipeboards);
        await setProjectRoot(archived.name, archived.project_root);
        if (archived.identity) await setSessionIdentity(archived.name, archived.identity);
        else await setLaunchStamp(archived.name, archived.agent);
        await setProviderSessionId(archived.name, archived.provider_session_id);
        await writeTeams(archived.name, archived.tags);
        await writeConfiguration(archived.name).catch(() => {});
      } catch (e) {
        await stopSessionTree(archived.name);
        throw e;
      }
      await removeArchive(archived.id); // only after runtime and all metadata are restored
      await teamChanged(archived.tags, callerOf(req), archived.name).catch(() => {});
      res.json({ ok: true, name: archived.name });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      res.status(code === 'ENOENT' ? 404 : 500).json({ error: code === 'ENOENT' ? 'No such archive.' : String((e as Error)?.message ?? e) });
    }
  });

  app.delete('/api/archived-sessions/:id', async (req, res) => {
    try {
      const archived = await readArchive(req.params.id);
      const prepared = await prepareSessionEnding(req, res, archived.name, 'hard_delete');
      if (!prepared.proceed) return;
      emitSessionEnd(archived.name, archived.key);
      await releaseHolds(archived.name, archived.key, 'hard deleted');
      await fs.promises.rm(sessionRecordDir(archived.key), { recursive: true, force: true });
      await removeArchive(archived.id);
      res.json({ ok: true, ...(prepared.acknowledgement ? { worktree_acknowledgement: prepared.acknowledgement } : {}) });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      res.status(code === 'ENOENT' ? 404 : 500).json({ error: code === 'ENOENT' ? 'No such archive.' : String((e as Error)?.message ?? e) });
    }
  });

  app.delete('/api/sessions/:name', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    const key = await sessionKey(name);
    try {
      const result = await shutdownAgent(name);
      emitSessionEnd(name, key); // rireki deletes the tape: no graveyard, eventually is fine
      await releaseHolds(name, key, 'deleted');
      count('ended', { name, end: 'deleted' });
      res.json({ ok: true, closed: result.closed });
    } catch (e) {
      if (e instanceof ShutdownRefused) {
        return res.status(409).json({ error: e.message, blockers: e.blockers });
      }
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.post('/api/sessions/:name/shutdown', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    const mode = req.body?.mode === 'hard_delete' ? 'hard_delete' : 'shutdown';
    if (mode === 'hard_delete') {
      const expected = hardDeleteConfirmation(name);
      if (req.body?.confirmation !== expected) return res.status(409).json({ error: `Hard Delete is irreversible. Confirm the exact targets with: ${expected}` });
    }
    const existingId = shutdownSlots.current(name);
    const existing = existingId ? shutdownOperations.get(existingId) : undefined;
    if (existing?.state === 'running') return res.status(202).json(existing);
    const id = randomUUID();
    if (!shutdownSlots.begin(name, id)) return res.status(409).json({ error: `A lifecycle operation for Agent ${name} is already running.` });
    const operation: ShutdownOperation = {
      id, session: name, mode, state: 'running', phase: 'resolving_agent', message: `Resolving Agent ${name}`, closed: [],
    };
    shutdownOperations.set(id, operation);
    res.status(202).json(operation); // acknowledge before desk or git inspection begins
    // Each phase, and the end, is pushed whole as {t:'shutdown', ...operation}.
    const progressed = (value: Partial<ShutdownOperation>) => {
      Object.assign(operation, value);
      broadcastEvent({ t: 'shutdown', ...operation });
    };
    setImmediate(() => void (async () => {
      const controller = new AbortController();
      const serverTimeoutMs = mode === 'hard_delete' ? 120_000 : 30_000;
      let deadline: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          (async () => {
            if (mode === 'hard_delete') {
              const destructive = await performAgentHardDelete(name, progressed, controller.signal);
              operation.destructive = destructive;
              operation.closed = [...destructive.closed, ...destructive.quarantined.map((row) => row.desk)];
            } else {
              operation.closed = await performAgentShutdown(name, progressed);
            }
          })(),
          new Promise<never>((_resolve, reject) => {
            deadline = setTimeout(() => {
              controller.abort();
              reject(new Error(`Server deadline expired after ${serverTimeoutMs / 1000}s; the operation is terminal and retryable.`));
            }, serverTimeoutMs);
          }),
        ]);
        operation.state = 'complete';
      } catch (e) {
        operation.state = 'failed';
        operation.phase = 'failed';
        operation.error = String((e as Error)?.message ?? e);
        operation.message = operation.error;
        if (e instanceof ShutdownRefused) operation.blockers = e.blockers;
      } finally {
        controller.abort();
        if (deadline) clearTimeout(deadline);
      }
      broadcastEvent({ t: 'shutdown', ...operation });
      shutdownSlots.terminal(name, id); // terminal: a retry always gets a fresh operation
      setTimeout(() => {
        shutdownOperations.delete(id);
      }, 5 * 60_000).unref();
    })());
  });

  app.put('/api/sessions/:name/title', async (req, res) => {
    const { name } = req.params;
    const title = String(req.body?.title ?? '').trim();
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid session name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    try {
      await setSessionTitle(name, title);
      await writeConfiguration(name, callerOf(req)).catch(() => {});
      res.json({ ok: true, name, title });
    } catch (e) {
      res.status(400).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.post('/api/harakiri', async (req, res) => {
    const pane = String(req.body?.pane ?? '').trim();
    if (!/^%\d+$/.test(pane)) {
      return res.status(400).json({ error: 'Expected a tmux pane id like %7.' });
    }
    const name = await sessionOfPane(pane);
    if (!name) return res.status(404).json({ error: `No session owns pane ${pane}.` });
    try {
      const closed = await performAgentShutdown(name, () => {});
      res.json({ ok: true, session: name, closed });
      console.log(`[ronin] harakiri: ${name} (pane ${pane}); closed ${closed.length} desk(s)`);
    } catch (e) {
      if (e instanceof ShutdownRefused) {
        return res.status(409).json({ error: e.message, blockers: e.blockers });
      }
      const error = String((e as Error)?.message ?? e);
      console.error(`[ronin] harakiri: ${name} (pane ${pane}) failed: ${error}`);
      res.status(500).json({ error });
    }
  });

  app.get('/api/sessions/:name/project-root', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    res.json({ project_root: await getProjectRoot(name) });
  });

  app.post('/api/sessions/:name/project-root', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    const root = String(req.body?.project_root ?? '').trim();
    if (root && !isValidRootName(root)) return res.status(400).json({ error: 'Invalid Workspace Folder handle.' });
    try {
      await assertSameCampaignRoot(await getCampaign(name), root);
    } catch (e) {
      return res.status(400).json({ error: String((e as Error)?.message ?? e) });
    }
    if (root && !(await listProjectRoots()).some((r) => r.name === root)) {
      return res.status(404).json({ error: `"${root}" is not in the catalog.` });
    }
    try {
      const project_root = await setProjectRoot(name, root);
      await writeConfiguration(name, callerOf(req)).catch(() => {});
      res.json({ ok: true, project_root });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  const saveMembership = async (name: string, wanted: unknown, by: string) => {
    const list = (Array.isArray(wanted) ? wanted.map(String) : String(wanted ?? '').split(',')).slice(0, 16);
    const valid = new Set((await listTeamRosters()).filter((team) => team.state !== 'archived').map((team) => team.name));
    const unknown = list.filter((team) => !valid.has(team));
    if (unknown.length) throw new Error(`Unknown Team: ${unknown.join(', ')}.`);
    await assertSameCampaignTeams(name, list);
    const before = await getTags(name), teams = await setTags(name, list);
    const leads = await getLeads(name), keptLeads = leads.filter((team) => teams.includes(team));
    if (keptLeads.length !== leads.length) await setLeads(name, keptLeads);
    await teamChanged(moved(before, teams), by, name).catch(() => {});
    return { teams, notices: await announceTeamChanges(name, before, teams) };
  };
  app.get('/api/sessions/:name/teams', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    res.json({ teams: await getTags(name) });
  });

  // A membership or lead change moves what the teams push carries (whose items a Team's
  // row lists, whose epic is its lead's), so the rosters are pushed again after it.
  app.use(['/api/sessions/:name/teams', '/api/sessions/:name/team_lead'], (req, res, next) => {
    if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) void pushTeams(); });
    next();
  });

  app.put('/api/sessions/:name/teams', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    try {
      count('team.membership.set');
      res.json({ ok: true, ...(await saveMembership(name, req.body?.teams, callerOf(req))) });
    } catch (e) {
      res.status(400).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  for (const retired of ['session_job', 'family_role', 'session_task', 'role_family', 'team_role', 'campaign_kind', 'lifecycle']) {
    app.all(`/api/sessions/:name/${retired}`, (req, res) => {
      res.status(410).json({
        error:
          `${retired} is retired. Birth path is session_type; work readings are selected ` +
          'with behaviours at birth; leadership is the explicit team_lead designation.',
      });
    });
  }

  app.post('/api/sessions/:name/team_lead', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    const body = req.body?.teams;
    const wanted = (Array.isArray(body) ? body.map(String) : String(body ?? '').split(','))
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 16);
    try {
      const before = await getLeads(name);
      const tagsBefore = await getTags(name);
      const missing = wanted.filter((t) => !tagsBefore.includes(t));
      let tags = tagsBefore;
      if (missing.length) {
        tags = await setTags(name, [...tagsBefore, ...missing].slice(0, 16));
        await announceTeamChanges(name, tagsBefore, tags).catch(() => {});
      }
      const leads = await setLeads(name, wanted);
      await teamChanged([...moved(tagsBefore, tags), ...moved(before, leads)], callerOf(req), name).catch(() => {});
      count('lead.set', { n: leads.length });
      const fresh = leads.filter((t) => !before.includes(t));
      let delivered: string | null = null;
      if (fresh.length) {
        const reading = await conditionalBehaviourPath('team-lead');
        const msg = teamLeadAcknowledgement(fresh, reading);
        delivered = await enqueueMessage(name, msg, 'house').then(() => 'queued', () => 'not queued');
      }
      res.json({ ok: true, team_lead: leads, tags, delivery: delivered });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.post('/api/sessions/:name/send', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    const raw = String(req.body?.text ?? '');
    if (!raw.trim()) return res.status(400).json({ error: 'Nothing to send.' });
    try {
      const expanded = await expandLookup(raw);
      const text = expanded ?? raw;
      const item = await enqueueMessage(name, text, 'owner');
      res.json({ ok: true, expanded: expanded != null, queued: true, started: false, message: item });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
}
