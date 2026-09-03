import fs from 'node:fs';
import type express from 'express';
import {
  type Control,
  getControl,
  getLeads,
  getWipeboards,
  getProviderSessionId,
  getNote,
  getCampaign,
  getProjectRoot,
  getTags,
  isValidName,
  killSessionTree,
  listSessions,
  sessionExists,
  sessionOfPane,
  setControl,
  setLeads,
  setNote,
  setProjectRoot,
  setTags,
  setWipeboards,
  createSession,
  sessionRuntime,
  setLaunchStamp,
  setProviderSessionId,
  setSessionKey,
  setSessionTitle,
  stopSessionTree,
} from '../tmux.js';
import { sendText } from '../send.js';
import { attemptMessage, enqueueMessage, MessageRefused } from '../message-queue.js';
import { sessionKey } from '../session-dir.js';
import { isValidRootName, listProjectRoots } from '../project-roots.js';
import { expandLookup } from '../lookup.js';
import { readCtxLine } from '../ctx.js';
import { count } from '../counts.js';
import { announceTeamChanges } from './wipeboards-api.js';
import { writeTeams } from '../tegami.js';
import { readTegami } from '../tegami-read.js';
import { teamsSopPath } from '../spawn.js';
import { emitSessionEnd } from '../sockets.js';
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

export function registerSessions(app: express.Express): void {
  const publicArchive = ({ id, name, archived_at, agent, tags }: ArchivedSession) => ({ id, name, archived_at, agent, tags });
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
      const key = await sessionKey(name);
      const runtime = await sessionRuntime(name);
      const provider = await providerSessionInfo(runtime.agent, runtime.cwd, runtime.pid, await getProviderSessionId(name));
      if (!provider) return res.status(409).json({ error: `Could not identify a resumable ${runtime.agent || 'agent'} conversation.` });
      const archived: ArchivedSession = {
        version: 1,
        id: key,
        name,
        key,
        archived_at: new Date().toISOString(),
        cwd: runtime.cwd,
        agent: provider.agent,
        provider_session_id: provider.id,
        tags: await getTags(name),
        leads: await getLeads(name),
        wipeboards: await getWipeboards(name),
        note: await getNote(name),
        control: await getControl(name),
        project_root: await getProjectRoot(name),
      };
      await writeArchive(archived); // durable first; tmux remains live on any failure above
      try {
        await stopSessionTree(name);  // no handoff removal and no SessionEnd event
      } catch (e) {
        if (await sessionExists(name)) await removeArchive(archived.id).catch(() => {});
        throw e;
      }
      count('ended', { name, end: 'archived' });
      res.json({ ok: true, archived: publicArchive(archived) });
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
      await createSession(archived.name, archived.cwd, { agent: true, argv });
      try {
        await setSessionKey(archived.name, archived.key);
        await setTags(archived.name, archived.tags);
        await setLeads(archived.name, archived.leads);
        await setWipeboards(archived.name, archived.wipeboards);
        await setNote(archived.name, archived.note);
        await setProjectRoot(archived.name, archived.project_root);
        await setLaunchStamp(archived.name, archived.agent);
        await setProviderSessionId(archived.name, archived.provider_session_id);
        await setControl(archived.name, archived.control);
        await writeTeams(archived.name, archived.tags);
      } catch (e) {
        await stopSessionTree(archived.name);
        throw e;
      }
      await removeArchive(archived.id); // only after runtime and all metadata are restored
      res.json({ ok: true, name: archived.name });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      res.status(code === 'ENOENT' ? 404 : 500).json({ error: code === 'ENOENT' ? 'No such archive.' : String((e as Error)?.message ?? e) });
    }
  });

  app.delete('/api/archived-sessions/:id', async (req, res) => {
    try {
      const archived = await readArchive(req.params.id);
      emitSessionEnd(archived.name, archived.key);
      await fs.promises.rm(sessionRecordDir(archived.key), { recursive: true, force: true });
      await removeArchive(archived.id);
      res.json({ ok: true });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      res.status(code === 'ENOENT' ? 404 : 500).json({ error: code === 'ENOENT' ? 'No such archive.' : String((e as Error)?.message ?? e) });
    }
  });

  app.get('/api/sessions/:name/tegami', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    try {
      res.json(await readTegami(name));
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.delete('/api/sessions/:name', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    const key = await sessionKey(name);
    await killSessionTree(name);
    emitSessionEnd(name, key); // rireki deletes the tape: no graveyard, eventually is fine
    count('ended', { name, end: 'deleted' });
    res.json({ ok: true });
  });

  app.put('/api/sessions/:name/title', async (req, res) => {
    const { name } = req.params;
    const title = String(req.body?.title ?? '').trim();
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid session name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    try {
      await setSessionTitle(name, title);
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
    res.json({ ok: true, session: name });
    console.log(`[ronin] harakiri: ${name} (pane ${pane})`);
    count('ended', { name, end: 'harakiri' });
    setTimeout(() => void killSessionTree(name), 50);
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
    if (root && !isValidRootName(root)) return res.status(400).json({ error: 'Invalid project_root handle.' });
    try {
      await assertSameCampaignRoot(await getCampaign(name), root);
    } catch (e) {
      return res.status(400).json({ error: String((e as Error)?.message ?? e) });
    }
    if (root && !(await listProjectRoots()).some((r) => r.name === root)) {
      return res.status(404).json({ error: `"${root}" is not in the catalog.` });
    }
    try {
      res.json({ ok: true, project_root: await setProjectRoot(name, root) });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.get('/api/sessions/:name/note', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    res.json({ note: await getNote(name) });
  });

  app.post('/api/sessions/:name/note', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    const note = String(req.body?.note ?? '').slice(0, 8000); // a post-it, not a doc
    try {
      await setNote(name, note);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  const saveMembership = async (name: string, wanted: unknown) => {
    const list = (Array.isArray(wanted) ? wanted.map(String) : String(wanted ?? '').split(',')).slice(0, 16);
    const valid = new Set((await listTeamRosters()).filter((team) => team.state !== 'archived').map((team) => team.name));
    const unknown = list.filter((team) => !valid.has(team));
    if (unknown.length) throw new Error(`Unknown Team: ${unknown.join(', ')}.`);
    await assertSameCampaignTeams(name, list);
    const before = await getTags(name), teams = await setTags(name, list);
    const leads = await getLeads(name), keptLeads = leads.filter((team) => teams.includes(team));
    if (keptLeads.length !== leads.length) await setLeads(name, keptLeads);
    await writeTeams(name, teams).catch(() => {});
    return { teams, notices: await announceTeamChanges(name, before, teams) };
  };
  app.get('/api/sessions/:name/teams', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    res.json({ teams: await getTags(name) });
  });

  app.put('/api/sessions/:name/teams', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    try {
      count('team.membership.set');
      res.json({ ok: true, ...(await saveMembership(name, req.body?.teams)) });
    } catch (e) {
      res.status(400).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  for (const retired of ['session_job', 'family_role', 'session_task', 'session_role', 'role_family', 'team_role', 'campaign_kind', 'lifecycle']) {
    app.all(`/api/sessions/:name/${retired}`, (req, res) => {
      res.status(410).json({
        error:
          `${retired} is retired. Birth path is session_type; work readings are selected ` +
          'with behaviours at birth; leadership is the explicit team_lead designation.',
      });
    });
  }

  app.get('/api/teams', async (_req, res) => {
    try {
      const teams: Record<string, string[]> = {};
      const leaders: Record<string, string[]> = {};
      for (const s of await listSessions()) {
        for (const t of s.tags) (teams[t] ||= []).push(s.name);
        for (const t of s.leads) (leaders[t] ||= []).push(s.name);
      }
      res.json({ teams, leaders });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.get('/api/teams/:name/live', async (req, res) => {
    const { name } = req.params;
    try {
      const members = (await listSessions()).filter((s) => s.tags.includes(name));
      res.json({
        team: name,
        members: await Promise.all(
          members.map(async (s) => ({
            name: s.name,
            dial: await getControl(s.name),
            team_lead: s.leads.includes(name),
          })),
        ),
      });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

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
      await writeTeams(name, tags).catch(() => {});
      count('lead.set', { n: leads.length });
      const fresh = leads.filter((t) => !before.includes(t));
      let delivered: string | null = null;
      if (fresh.length) {
          const msg =
            `You are now the team_lead of ${fresh.map((t) => `"${t}"`).join(', ')}. ` +
            `Read first: ${teamsSopPath()} — how to raise supporting sessions and place them into your team.`;
          const sent = await sendText(name, msg).catch(() => null);
          delivered = sent?.started ? 'delivered' : 'not delivered — the prompt was not accepting input';
      }
      res.json({ ok: true, team_lead: leads, tags, delivery: delivered });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.get('/api/sessions/:name/team_lead', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    res.json({ team_lead: await getLeads(name) });
  });

  app.get('/api/sessions/:name/control', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    res.json({ control: await getControl(name) });
  });

  app.post('/api/sessions/:name/control', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    const control = String(req.body?.control ?? '');
    if (control !== 'user' && control !== 'read' && control !== 'write') {
      return res.status(400).json({ error: 'control must be user, read or write.' });
    }
    try {
      await setControl(name, control as Control);
      count('dial.set', { dial: control });
      res.json({ ok: true, control });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.get('/api/sessions/:name/ctx', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    try {
      const reading = await readCtxLine(name); // { ctx, model } — one capture, both readings
      count('ctx', { name, ctx: (reading as { ctx: number | null }).ctx, model: (reading as { model?: string | null }).model ?? null });
      res.json(reading);
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.post('/api/sessions/:name/send', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    const control = await getControl(name);
    const raw = String(req.body?.text ?? '');
    if (!raw.trim()) return res.status(400).json({ error: 'Nothing to send.' });
    try {
      const expanded = await expandLookup(raw);
      const text = expanded ?? raw;
      const item = await enqueueMessage(name, text, 'owner');
      const retained = await attemptMessage(item.id, 'safe');
      res.json({ ok: true, control, expanded: expanded != null, queued: retained !== null, started: retained === null, message: retained });
    } catch (e) {
      if (e instanceof MessageRefused) return res.status(404).json({ error: e.message, code: 'target_missing' });
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
}
