import { readLaunchIdentity } from '../launch-binding.js';
import { resolveLaunchJournal } from '../launch-journal.js';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type express from 'express';
import {
  getLeads,
  getWipeboards,
  getProviderSessionId,
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
  setSessionReady,
  stopSessionTree,
} from '../tmux.js';
import { enqueueMessage } from '../message-queue.js';
import { person } from '../office-people.js';
import { callerOf } from './work-items-api.js';
import { sessionKey } from '../session-dir.js';
import { listWorkspaces, workspaceFolders } from '../workspaces.js';
import { expandLookup } from '../lookup.js';
import { count } from '../counts.js';
import { broadcastEvent, changed, pushTeams } from '../ws/events.js';
import { announceTeamChanges } from './wipeboards-api.js';
import { memberEnded, readBriefRecord, teamChanged, writeConfiguration, writeObjective, writeTeams } from '../tegami.js';
import { readAgentComposition } from '../agent-composition.js';
import { configurationSends, configureBrief, updateConfiguration } from '../agent-configuration.js';
import { agentBriefOf } from '../brief-build.js';
import { mandate } from '../agent-defaults.js';
import { emitSessionEnd } from '../sockets.js';
import { releaseHolder, settleToDo, unfinishedHolds, type WorkItem } from '../work-items.js';
import { resumeAgentArgv } from '../agents.js';
import { listTeamRosters } from '../team-rosters.js';
import { assertSameCampaignTeams, initialCampaignId } from '../campaign-scope.js';
import { sessionDir as sessionRecordDir } from '../session-dir.js';
import {
  expiredArchives,
  listArchives,
  readArchive,
  removeArchive,
  providerSessionInfo,
  writeArchive,
  warmRestorable,
  type ArchivedSession,
} from '../session-archive.js';
import { ignoreEndingRequest, inspectSessionEnding, promptEnding } from '../desks/ending-runtime.js';
import type { EndingRequest } from '../desks/ending.js';
import { resolveEndingRequest } from '../desks/ending-response.js';
import { randomUUID } from 'node:crypto';
import { hardDeleteConfirmation, liveOps, shutdownAgent, ShutdownRefused, ShutdownSlots, type ShutdownProgress } from '../desks/session-shutdown.js';
import { listDeskRecords, listDesks } from '../desks/registry.js';
import { resolveFileLink } from '../file-link.js';
import { readTegami } from '../tegami-read.js';
import { openBases, refusedHere } from '../open-places.js';
import { commitPage } from '../commit-link.js';
import { storeDir } from '../resources.js';
import { parkCarry } from '../machine-park.js';
import { readOfficeRecord } from '../office-record.js';
import { clearHookRecord, readFields } from '../asking.js';
import { providerPart } from '../provider-parts.js';

interface PreparedEnding { proceed: boolean; acknowledgement?: Record<string, unknown> }


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

const publicArchive = ({ id, name, archived_at, agent, tags, desks_left_open }: ArchivedSession) =>
  ({ id, name, archived_at, agent, tags, ...(desks_left_open?.length ? { desks_left_open } : {}) });

const shutdownOperations = new Map<string, ShutdownOperation>();
// A shutdown as it stands: what {t:'want', resource:'shutdown', id} answers a socket that
// reopened mid-shutdown. Finished operations are kept five minutes.
export const shutdownOperation = (id: string): ShutdownOperation | null => shutdownOperations.get(id) ?? null;
const shutdownSlots = new ShutdownSlots();

/** The Agent's open desks, as repo:branch. */
const openDesks = async (name: string): Promise<string[]> =>
  (await listDesks({ owner: name })).filter((desk) => desk.state === 'open').map((desk) => `${desk.repo}:${desk.branch}`);

/** THE DESK CHECK on archive: a nudge, never a wall (owner, 2026-11-15, w623). It names the open
 * desks and the way past them; `ignore_desks: true` (--ignore-desks) archives anyway, every desk
 * left exactly as it is for the Agent's restore. */
const openDeskRefusal = (name: string, desks: string[]): string =>
  `Session "${name}" owns open desk${desks.length === 1 ? '' : 's'} ${desks.join(', ')}. `
  + 'Close out first: commit, hand in, then session_end or Shut down Agent. '
  + `In an emergency (a stuck or dead pane): session_archive ${name} --ignore-desks keeps them for its restore.`;

/** THE ITEM CHECK, the same on every way out (docs/using-ronin/project-management.md, How an
 * item lives): session_end, archive, Delete, Hard Delete. It is a nudge, never a wall (owner,
 * 2026-11-12, KAN-415): an Agent holding work In Progress or In Review is refused once, each item
 * named, with NEXT in order: finish it if you can; if not, flag it; clean your desks; then go.
 * An item the Agent has flagged itself needs nothing more: the flag is the acknowledgement.
 * `ignore_items: true` (--ignore-items, the UI's "close anyway?") goes past the rest. Either way
 * releaseHolds gives each to the Team flagged "Ended without handover", its lead told once.
 * To Do is not named: it goes back to the Team by itself (settleToDo, or releaseHolder). */
class ItemsRefused extends ShutdownRefused {
  constructor(blockers: ShutdownRefused['blockers'], readonly items: Array<{ id: string; status: string; title: string }>) { super(blockers); }
}

/** Flagged, and the flag that stands is the Agent's own. */
const flaggedBy = (item: WorkItem, name: string): boolean =>
  item.flagged && [...item.trail].reverse().find((line) => line.op === 'flag')?.by === name;

async function heldItemsRefusal(name: string, anyway: string, self = false): Promise<ItemsRefused | null> {
  const held = (await unfinishedHolds(name))
    .filter((item) => item.status === 'In Progress' || item.status === 'In Review' || !item.team)
    .filter((item) => !flaggedBy(item, name));
  if (!held.length) return null;
  const who = self ? 'you hold' : `${name} holds`;
  const ids = held.map((item) => item.id);
  const first = ids.length === 1 ? ids[0] : '<id>';
  const blockers: ShutdownRefused['blockers'] = [{
    desk: 'work items',
    reasons: held.map((item) => `${who} ${item.id} (${item.status}) ${item.title}, not flagged by ${self ? 'you' : name}`),
    next_action: [
      `1. Finish ${ids.length === 1 ? 'it' : 'each'} if you can (In Review is finished when your lead or the owner makes it Done).`,
      `2. If you can't, flag it: item flag ${first} "<where it stands; what is missing>".`,
      '3. Clean your desks: commit and hand in.',
      `4. Then go: a flagged item needs nothing more; for one left unflagged, ${anyway}. Each goes to the Team flagged, its lead told.`,
    ].join(' '),
  }];
  return new ItemsRefused(blockers, held.map(({ id, status, title }) => ({ id, status, title })));
}

/** A refusal's answer: 409 with the items, so the UI can ask "close anyway?". */
const refusedBody = (e: ShutdownRefused) => ({
  error: e.message, blockers: e.blockers,
  ...(e instanceof ItemsRefused ? { items_held: e.items, acknowledge: 'ignore_items' } : {}),
});
const UI_ANYWAY = 'close anyway in the confirm';
const ignoringItems = (req: express.Request): boolean => req.body?.ignore_items === true;
const ignoringDesks = (req: express.Request): boolean => req.body?.ignore_desks === true;

/** The ending Agent's holds are released and its leads' members lists drop it; an end never fails
 * on either. An end that archived names the archive and its restore on both lead notices. */
async function releaseHolds(name: string, key: string, how: string, archived?: ArchivedSession | null, said = ''): Promise<void> {
  const restore = archived ? `archived as ${archived.id}: session_restore ${archived.id}` : '';
  await releaseHolder(name, key, restore ? `${how}, ${restore}` : how).catch((e) => console.error(`[ronin] releasing ${name}'s work items:`, e));
  await memberEnded(name, restore ? `${name} ended, ${restore}` : said).catch(() => {});
}

/** THE ONE ARCHIVE (session_archive, the tile's Archive, session_end): write the resumable manifest,
 * then stop the Agent. Answers the manifest, or null when no exact provider conversation is known;
 * then nothing is written and nothing is stopped. Holds are the caller's (releaseHolds). */
async function archiveAgent(name: string, desksLeftOpen: string[] = []): Promise<ArchivedSession | null> {
  const provider = await archiveProvider(name);
  return 'error' in provider ? null : archiveWith(name, provider, desksLeftOpen);
}

/** The exact provider conversation an archive will resume, or why there is none. A park asks
 * this of every Agent before any is stopped. The launch identity is read from disk, so a dead
 * pane (its process gone, the pane kept by remain-on-exit) archives the same as a live one. */
async function archiveProvider(name: string): Promise<{ agent: string; id: string } | { error: string }> {
  const key = await sessionKey(name);
  const runtime = await sessionRuntime(name);
  const launchIdentity = await readLaunchIdentity(key);
  if (launchIdentity) await resolveLaunchJournal(launchIdentity);
  const provider = launchIdentity
    ? (launchIdentity.providerSession ? { agent: launchIdentity.cli, id: launchIdentity.providerSession } : null)
    : await providerSessionInfo(runtime.agent, runtime.cwd, runtime.pid, await getProviderSessionId(name));
  return provider ?? { error: `Could not identify a resumable ${runtime.agent || 'agent'} conversation.` };
}

/** The archive step itself, for a known provider conversation: manifest first, then stop. */
async function archiveWith(name: string, provider: { agent: string; id: string }, desksLeftOpen: string[] = [], warm = false): Promise<ArchivedSession> {
  const key = await sessionKey(name);
  const runtime = await sessionRuntime(name);
  const archived: ArchivedSession = {
    ...(desksLeftOpen.length ? { desks_left_open: desksLeftOpen } : {}),
    ...(warm ? { warm_restart: true as const } : {}),
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
  void expireArchives();
  return archived;
}

/** An archive's Hard Delete: the end is told, holds released, the retained session folder and the
 * manifest removed. Expiry removes an archive the same way. */
async function deleteArchived(archived: ArchivedSession, said = ''): Promise<void> {
  emitSessionEnd(archived.name, archived.key);
  await releaseHolds(archived.name, archived.key, 'hard deleted', null, said);
  await fs.promises.rm(sessionRecordDir(archived.key), { recursive: true, force: true });
  await removeArchive(archived.id);
}

/** What expiry tells the lead of an archive made with --ignore-desks: its desks are kept. Expiry
 * removes the session folder and manifest only; it never touches a worktree. */
export const expiryNotice = ({ id, name, desks_left_open: desks = [] }: ArchivedSession): string => desks.length
  ? `${name}'s archive ${id} expired; its open desk${desks.length === 1 ? '' : 's'} ${desks.join(', ')} ${desks.length === 1 ? 'was' : 'were'} left as ${desks.length === 1 ? 'it is' : 'they are'}, not deleted: close or hand over with worktree-desk.`
  : '';

/** Remove every archive older than ARCHIVE_DAYS (src/session-archive.ts). Never throws. */
export async function expireArchives(now = Date.now()): Promise<string[]> {
  const removed: string[] = [];
  try {
    for (const archived of expiredArchives(await listArchives(), now)) {
      try { await deleteArchived(archived, expiryNotice(archived)); removed.push(archived.id); }
      catch (e) { console.error(`[archive] expiring ${archived.id}:`, e); }
    }
  } catch (e) { console.error('[archive] expiry failed:', e); }
  if (removed.length) console.log(`[archive] removed ${removed.length} expired archive(s)`);
  return removed;
}

/** An Agent's own end (session_end, and so Done on its last item): its desks close as a Delete's do,
 * then it is archived, so session_restore brings it back. Only a conversation Ronin cannot resume
 * ends outright. Its holds go to the Team as any ending's do; a restored Agent takes back what it wants. */
async function performAgentEnd(name: string): Promise<{ closed: string[]; archived: ArchivedSession | null }> {
  const key = await sessionKey(name);
  const end: { archived: ArchivedSession | null } = { archived: null };
  const result = await shutdownAgent(name, () => {}, {
    ...liveOps,
    stop: async (session, signal) => { end.archived = await archiveAgent(session); if (!end.archived) await liveOps.stop(session, signal); },
  }, { operationTimeoutMs: 25_000, readTimeoutMs: 5_000, closeTimeoutMs: 15_000, stopTimeoutMs: 10_000 });
  const { archived } = end;
  if (!archived) emitSessionEnd(name, key); // archive keeps the tape and the folder
  await releaseHolds(name, key, 'session ended', archived);
  count('ended', { name, end: archived ? 'archived' : 'harakiri' });
  return { closed: result.closed, archived };
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

async function rehydrate(id: string, caller: string): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const archived = await readArchive(id);
    if (await sessionExists(archived.name)) {
      return { status: 409, body: { error: `Session "${archived.name}" already exists.` } };
    }
    // Its birth receipt: the command it was born with (KAN-661) and the person it was born for.
    const receipt = JSON.parse(await readFile(path.join(sessionRecordDir(archived.key), 'birth-receipt.json'), 'utf8').catch(() => '{}')) as { cmd?: unknown; user_email?: unknown };
    let argv = await resumeAgentArgv(archived.agent, archived.provider_session_id, typeof receipt.cmd === 'string' ? receipt.cmd : '');
    if (!argv.length) return { status: 409, body: { error: `${archived.agent} cannot be resumed on this machine.` } };
    const part = providerPart(archived.identity?.provider ?? '');
    // An Agent born on a part's provider (src/provider-parts.ts) is restored on it, for the
    // person it was born for, so its house calls stay theirs (KAN-659).
    if (part?.wrapResume) {
      argv = part.wrapResume([...argv], archived.identity?.model ?? '', typeof receipt.user_email === 'string' ? receipt.user_email : '');
    }
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
    await teamChanged(archived.tags, caller, archived.name).catch(() => {});
    return { status: 200, body: { ok: true, name: archived.name } };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    return code === 'ENOENT'
      ? { status: 404, body: { error: 'No such archive.' } }
      : { status: 500, body: { error: String((e as Error)?.message ?? e) } };
  }
}

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

  // The Configuration's one act: write its existing authorities, rebuild the brief, tell once.
  app.put('/api/sessions/:name/configuration', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    const role = ['coworker', 'lead', 'epic_lead', 'coordinator'].includes(req.body?.role) ? req.body.role : 'coworker';
    const team = String(req.body?.team ?? '').trim();
    const validTeams = new Set((await listTeamRosters()).filter((row) => row.state !== 'archived').map((row) => row.name));
    if (team && !validTeams.has(team)) return res.status(400).json({ error: `Unknown Team: ${team}.` });
    try { res.json({ ok: true, queued: true, ...await updateConfiguration(name, {
      objective: String(req.body?.objective ?? ''), title: String(req.body?.title ?? ''), role, team,
      mandate: mandate(req.body?.mandate), agent: agentBriefOf(req.body), by: callerOf(req),
    }) }); }
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
      const desks = await openDesks(name);
      if (desks.length && !ignoringDesks(req)) return res.status(409).json({ error: openDeskRefusal(name, desks), desks_open: desks, acknowledge: 'ignore_desks' });
      const items = ignoringItems(req) ? null : await heldItemsRefusal(name, `session_archive ${name} --ignore-items, or ${UI_ANYWAY}`);
      if (items) return res.status(409).json(refusedBody(items));
      // --ignore-desks: no ending preflight, whose fallback would quarantine a dirty desk. Every desk stays as it is.
      const prepared = ignoringDesks(req) ? { proceed: true } as PreparedEnding : await prepareSessionEnding(req, res, name, 'archive');
      if (!prepared.proceed) return;
      const key = await sessionKey(name);
      const archived = await archiveAgent(name, ignoringDesks(req) ? desks : []);
      if (!archived) return res.status(409).json({ error: `Could not identify a resumable ${(await sessionRuntime(name)).agent || 'agent'} conversation.` });
      await releaseHolds(name, key, 'archived', archived);
      count('ended', { name, end: 'archived' });
      res.json({ ok: true, archived: publicArchive(archived), ...(prepared.acknowledgement ? { worktree_acknowledgement: prepared.acknowledgement } : {}) });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  // PARK: archive every Agent at once, for bin/ronin-archive (docs/operating/park.md, KAN-502).
  // The whole office travels, so nothing is handed back: no desk or item refusal, holds stay
  // with their Agent, no Team is told. Every Agent is identified before any is stopped — one
  // that cannot be resumed refuses the park with the office untouched.
  app.post('/api/machine/park', async (_req, res) => {
    try {
      const names = (await listSessions()).filter((s) => s.agent).map((s) => s.name);
      const providers = await Promise.all(names.map(async (name) => ({ name, provider: await archiveProvider(name) })));
      const refused = providers.flatMap(({ name, provider }) => 'error' in provider ? [`${name}: ${provider.error}`] : []);
      if (refused.length) return res.status(409).json({ error: `Not parked — no Agent was stopped. ${refused.join(' ')}` });
      const archived: ArchivedSession[] = [];
      for (const { name, provider } of providers) {
        archived.push(await archiveWith(name, provider as { agent: string; id: string }));
        count('ended', { name, end: 'parked' });
      }
      const office = await readOfficeRecord();
      res.json({
        ok: true,
        office_id: office.hosting === 'office_unit' ? office.record.office_id : '',
        agents: archived.map(({ id, name, agent }) => ({ id, name, agent })),
        ...await parkCarry(archived),
      });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  // WARM RESTART (KAN-672): archive all saves every live Agent through the one archive, for a
  // planned stop of the office; restore all brings each back by the one restore. Like the park,
  // the whole office stays: no desk or item refusal, holds and desks stay with their Agent, no
  // Team is told. Unlike the park, one Agent that cannot be saved does not hold the rest: each
  // is named in the answer. The calling Agent (`pane`) is saved last, so the others are saved
  // before its own call is stopped. Both are idempotent: archive all saves only live Agents, and
  // restore all brings back only what archive all saved and is not already running.
  app.post('/api/machine/archive-all', async (req, res) => {
    try {
      const pane = String(req.body?.pane ?? '').trim();
      const caller = /^%\d+$/.test(pane) ? await sessionOfPane(pane) : null;
      const names = (await listSessions()).filter((s) => s.agent).map((s) => s.name)
        .sort((a, b) => Number(a === caller) - Number(b === caller));
      const saved: Array<{ name: string; id: string; agent: string }> = [];
      const not_saved: Array<{ name: string; error: string }> = [];
      for (const name of names) {
        try {
          const provider = await archiveProvider(name);
          if ('error' in provider) { not_saved.push({ name, error: provider.error }); continue; }
          const archived = await archiveWith(name, provider, [], true);
          await clearHookRecord(name);
          saved.push({ name, id: archived.id, agent: archived.agent });
          count('ended', { name, end: 'warm_restart' });
        } catch (e) { not_saved.push({ name, error: String((e as Error)?.message ?? e) }); }
      }
      res.json({ ok: true, saved, not_saved });
    } catch (e) { res.status(500).json({ error: String((e as Error)?.message ?? e) }); }
  });

  app.post('/api/machine/restore-all', async (req, res) => {
    try {
      const live = new Set((await listSessions()).map((s) => s.name));
      const { restore, running } = warmRestorable(await listArchives(), live);
      const restored: Array<{ name: string; id: string }> = [];
      const not_restored = running.map(({ name, id }) => ({ name, id, error: `Session "${name}" already exists.` }));
      for (const { name, id } of restore.reverse()) { // oldest first: the order archive all saved them
        const { status, body } = await rehydrate(id, callerOf(req));
        if (status === 200) restored.push({ name, id });
        else not_restored.push({ name, id, error: String(body.error ?? `HTTP ${status}`) });
      }
      res.json({ ok: true, restored, not_restored });
    } catch (e) { res.status(500).json({ error: String((e as Error)?.message ?? e) }); }
  });

  // RESUME A STOPPED AGENT (KAN-660): its dead pane is archived and restored at once, so the CLI
  // starts again on the same provider conversation, Teams, leads and items, as session_restore does.
  app.post('/api/sessions/:name/resume', async (req, res) => {
    const session = (await listSessions()).find((s) => s.name === req.params.name);
    if (!session || session.key !== req.body?.key) return res.status(409).json({ error: 'This Agent session changed. Reopen its Tile.' });
    if ((await readFields(session.name)).stance !== 'stopped') return res.status(409).json({ error: `${session.name} is running.` });
    try {
      const archived = await archiveAgent(session.name);
      if (!archived) return res.status(409).json({ error: `${session.name}'s conversation cannot be resumed.` });
      await clearHookRecord(session.name);
      const { status, body } = await rehydrate(archived.id, callerOf(req));
      res.status(status).json(body);
    } catch (e) { res.status(500).json({ error: String((e as Error)?.message ?? e) }); }
  });

  app.post('/api/archived-sessions/:id/rehydrate', async (req, res) => {
    const { status, body } = await rehydrate(req.params.id, callerOf(req));
    res.status(status).json(body);
  });

  app.delete('/api/archived-sessions/:id', async (req, res) => {
    try {
      const archived = await readArchive(req.params.id);
      const prepared = await prepareSessionEnding(req, res, archived.name, 'hard_delete');
      if (!prepared.proceed) return;
      await deleteArchived(archived);
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
      const items = ignoringItems(req) ? null : await heldItemsRefusal(name, UI_ANYWAY);
      if (items) throw items;
      const result = await shutdownAgent(name);
      emitSessionEnd(name, key); // rireki deletes the tape: no graveyard, eventually is fine
      await releaseHolds(name, key, 'deleted');
      count('ended', { name, end: 'deleted' });
      res.json({ ok: true, closed: result.closed });
    } catch (e) {
      if (e instanceof ShutdownRefused) return res.status(409).json(refusedBody(e));
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
    const items = ignoringItems(req) ? null : await heldItemsRefusal(name, UI_ANYWAY);
    if (items) return res.status(409).json(refusedBody(items));
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

  // READY (KAN-694): `ready` from inside an Agent's pane marks this moment on its session; a chat
  // that honours it (Setup's Helpful Assistant) draws only what follows. It acknowledges, never refuses.
  app.post('/api/ready', async (req, res) => {
    const pane = String(req.body?.pane ?? '').trim();
    if (!/^%\d+$/.test(pane)) return res.status(400).json({ error: 'Expected a tmux pane id like %7.' });
    const name = await sessionOfPane(pane);
    if (!name) return res.status(404).json({ error: `No session owns pane ${pane}.` });
    try {
      const at = await setSessionReady(name);
      changed();
      res.json({ ok: true, name, at });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
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
      // session_end hands over, never drops (docs/using-ronin/project-management.md, How an item
      // lives): To Do goes back to the Team by itself; then the one item check every way out
      // shares (heldItemsRefusal) names In Progress and In Review, unless --ignore-items.
      await settleToDo(name);
      const items = ignoringItems(req) ? null : await heldItemsRefusal(name, 'session_end --ignore-items', true);
      if (items) throw items;
      const { closed, archived } = await performAgentEnd(name);
      res.json({ ok: true, session: name, closed, ...(archived ? { archived: publicArchive(archived) } : {}) });
      console.log(`[ronin] harakiri: ${name} (pane ${pane}); closed ${closed.length} desk(s); ${archived ? `archived as ${archived.id}` : 'not resumable, ended'}`);
    } catch (e) {
      if (e instanceof ShutdownRefused) return res.status(409).json(refusedBody(e));
      const error = String((e as Error)?.message ?? e);
      console.error(`[ronin] harakiri: ${name} (pane ${pane}) failed: ${error}`);
      res.status(500).json({ error });
    }
  });

  // A file link in this Agent's Chat, written as ~/… or relative to where it works, as the full
  // path Docs opens (public/js/tile-transcript.js fileLinkPath).
  // Where what an Agent names in Chat is looked for (KAN-701): its repos (desks, working folder,
  // the Workspace folders), its session folder and drop/ (a file handed to it), the folders that
  // hold the Workspace folders (a path written from above them: samurai_lab/ronin_cloud/X.md),
  // the library (ABOUT_USER.md and the like), and in an office the whole home folder (open-places.ts).
  const chatPlaces = async (name: string) => {
    const desks = await listDeskRecords({ owner: name }).catch(() => []);
    const cwd = await sessionRuntime(name).then((r) => r.cwd, () => '');
    const roots = (await workspaceFolders().catch(() => [])).map((f) => f.dir);
    const own = await sessionKey(name).then((key) => sessionRecordDir(key), () => '');
    const repos = [...desks.map((d) => d.worktree), cwd, ...roots];
    return { own, repos, files: [...repos, own, own && path.join(own, 'drop'), ...new Set(roots.map((dir) => path.dirname(dir))), storeDir('library'), ...(await openBases())] };
  };

  app.get('/api/sessions/:name/file-link', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    const file = resolveFileLink(String(req.query.path ?? ''), (await chatPlaces(name)).files, (await readTegami(name))?.docs ?? []);
    // Chat links only what opens: a hidden file in an office is not a link.
    if (!file || await refusedHere(file, await fs.promises.realpath(file).catch(() => ''))) return res.status(404).json({ error: 'No such file.' });
    res.json({ path: file });
  });

  // A commit hash in this Agent's Chat: when it is a commit in one of its repos, `git show --stat -p`
  // of it as a page in its session folder (written once), { path } for Docs to open or a drop to place.
  app.get('/api/sessions/:name/commit', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    const { own, repos } = await chatPlaces(name);
    const page = own ? await commitPage(String(req.query.ref ?? ''), repos, path.join(own, 'commits')).catch(() => null) : null;
    if (!page) return res.status(404).json({ error: 'No such commit.' });
    res.json({ sha: path.basename(page, '.html'), path: page });
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
    if (root && !(await listWorkspaces(await initialCampaignId())).some((w) => w.name === root)) {
      return res.status(404).json({ error: `No Workspace "${root}". work-record workspace list names them.` });
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
  // ITS OWN RECORD over HTTP: what `work-record read` shows (objective, Teams, holds, watches,
  // documents) and the objective it updates. A daimyo's seat has no shell to run work-record
  // in, so the daimyo API reads and writes its record here, as the seat.
  app.get('/api/sessions/:name/record', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    const record = await readTegami(name);
    if (!record) return res.status(404).json({ error: `@${name} has no work record.` });
    res.json(record);
  });
  app.patch('/api/sessions/:name/record', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (typeof req.body?.objective !== 'string') return res.status(400).json({ error: 'Send { "objective": "…" }.' });
    try { res.json({ ok: true, objective: await writeObjective(name, req.body.objective, callerOf(req) || name) }); }
    catch (e) { res.status(404).json({ error: String((e as Error)?.message ?? e) }); }
  });

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
      // Made lead (or no longer): the brief says so, and sends only what changed.
      // The brief document's Team stays while the Agent is still on it.
      const doc = await readBriefRecord(name).catch(() => null);
      const team = doc && tags.includes(doc.agent.team) ? doc.agent.team : tags[0] ?? '';
      const delivered = await configureBrief(name, { team, lead: !!team && leads.includes(team) })
        .then((r) => r.sent ? 'queued' : null, () => 'not queued');
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
      const item = await enqueueMessage(name, text, 'owner', undefined, person(req));
      res.json({ ok: true, expanded: expanded != null, queued: true, started: false, message: item });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
}
