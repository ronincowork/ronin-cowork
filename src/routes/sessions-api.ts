/**
 * PER-SESSION ROUTES — everything addressed to one live session by name: end it, tag
 * it, dial it, read its gauge, its ladder, its tape state, and type into it. The
 * session list itself and the launchers live in routes/launch.ts; wipeboards in
 * routes/wipeboards-api.ts.
 */
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
  // `tags` are the Teams the session was on when archived — the Rehydrate Archived
  // surface groups by them. Names only; nothing else of the record is public.
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
      // Refuse before writing or stopping anything: an archive that cannot resume is a delete.
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

  app.delete('/api/sessions/:name', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    // Resolve the key BEFORE the kill, while `name` still means this session — the same
    // ordering rule killSessionTree already follows for removeHandoff. Afterwards the name
    // is a corpse, and asking tmux about a corpse gets you a NEIGHBOUR's answer (exit 0),
    // so the rm below would have taken a live session's directory: tape, render and letter.
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

  /**
   * harakiri — a session ends ITSELF, and Ronin is what ends it.
   *
   * The caller hands over one thing: the pane it is sitting in. It does not name a
   * session, does not sweep viewers, does not run `kill-session`. Ronin resolves the pane
   * to its real (non-viewer) session, checks the dial, and calls the same killSessionTree
   * the UI's delete button uses. So there is ONE implementation of the kill in this
   * codebase, and an agent asking to die is blind to how dying works — the counterpart of
   * commons spawning, which is likewise mechanical Ronin code rather than an agent running
   * tmux steps.
   *
   * Self-inflicted by construction: the only session you can end is the one your own pane
   * belongs to. Ending someone ELSE's session is a different, deliberate act — DELETE
   * /api/sessions/:name, i.e. the trash button — and is not reachable from here.
   */
  app.post('/api/harakiri', async (req, res) => {
    const pane = String(req.body?.pane ?? '').trim();
    if (!/^%\d+$/.test(pane)) {
      return res.status(400).json({ error: 'Expected a tmux pane id like %7.' });
    }
    const name = await sessionOfPane(pane);
    if (!name) return res.status(404).json({ error: `No session owns pane ${pane}.` });
    if ((await getControl(name)) === 'user') {
      return res.status(403).json({ error: `"${name}" is owner-controlled (dial 👤). Ask the owner to end it.` });
    }
    // Answer BEFORE killing: once the session goes, so does the socket, the caller and
    // anything it might have printed. The reply is for the log and for a caller that
    // somehow outlives its session — never a precondition for the kill.
    res.json({ ok: true, session: name });
    console.log(`[ronin] harakiri: ${name} (pane ${pane})`);
    count('ended', { name, end: 'harakiri' });
    setTimeout(() => void killSessionTree(name), 50);
  });

  /**
   * The project_root a session serves — one value, the owner's hand.
   *
   * Sessions born outside the launcher (a human running `tmux new-session`) carry
   * nothing, and that is reported as untagged rather than guessed at. Ronin may SUGGEST
   * one from the working directory; only this call applies it.
   */
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
    // An Agent may serve only a Project root in its own Campaign.
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

  // Per-session "post-it" note, stored on the tmux session itself (see tmux.ts).
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

  // The Agent's stored tags are its one Team-membership record. The public door speaks
  // Teams only; every value is a validated Team id, never a free-form label.
  const saveMembership = async (name: string, wanted: unknown) => {
    const list = (Array.isArray(wanted) ? wanted.map(String) : String(wanted ?? '').split(',')).slice(0, 16);
    const valid = new Set((await listTeamRosters()).filter((team) => team.state !== 'archived').map((team) => team.name));
    const unknown = list.filter((team) => !valid.has(team));
    if (unknown.length) throw new Error(`Unknown Team: ${unknown.join(', ')}.`);
    // A COWORK AND ITS AGENTS ARE ONE CAMPAIGN'S. Refused rather than silently corrected:
    // quietly rewriting the caller's intent is how a scoping bug becomes invisible.
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

  /**
   * THE RETIRED AXES, refused by name — three generations of one door, each pointing at
   * what replaced it, because a caller on old vocabulary deserves better than the blank
   * 404 a typo gets. 410 is the honest code: these doors existed, and they are gone.
   *
   *   session_job    split on 2026-08-22 into a role axis and a task axis;
   *   family_role    the immutable session axis that split created — DISMANTLED on
   *                  2026-08-23 (R35): identity moved off the session onto the TEAM's
   *                  roster, contextual per team, never a session attribute;
   *   session_task   renamed `session_role` in the same ruling.
   */
  for (const retired of ['session_job', 'family_role', 'session_task', 'session_role', 'role_family', 'team_role', 'campaign_kind', 'lifecycle']) {
    app.all(`/api/sessions/:name/${retired}`, (req, res) => {
      res.status(410).json({
        error:
          `${retired} is retired. Birth path is session_type; work readings are selected ` +
          'with behaviours at birth; leadership is the explicit team_lead designation.',
      });
    });
  }

  /**
   * EVERY LIVE TEAM, with members and leads. Derived from the sessions each call — there
   * is no membership registry to drift out of date, and the roster never holds one.
   *
   * The `leaders` map is BACK (R35, 2026-08-23, un-retiring the 人): who coordinates a
   * team is the hand-set `@ronin-lead` designation, never derived from what a session
   * is doing — the secretary can be team lead. `/api/groups` is the retired spelling.
   */
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

  /**
   * ONE TEAM'S LIVE HALF — the members with what a view needs per card: dial and lead
   * flag. The durable half is /api/team-rosters/:name; a team can be
   * real in either half alone (a roster with no live members, a tag with no roster).
   */
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

  /**
   * THE 人 — designate (or clear) the teams this session LEADS. Owner-shaped but not
   * owner-gated: membership and leadership are deliberately rule-free (owner,
   * 2026-08-23 — "little to absolutely no rules; put it there, see what happens").
   *
   * LEADING IMPLIES MEMBERSHIP: designating a lead tags the session into the team if it
   * is not already on it. And a NEWLY-led session is handed the team-building SOP —
   * route 2 of its delivery, the same reading a default_lead_role launch gets at birth —
   * because leadership is designated, not derived, and whoever actually leads must get
   * the reading whichever way they came to it. Delivery obeys the dial and a refusal is
   * reported, not swallowed.
   */
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
      // Route 2 of the SOP: the newly-led get the reading, one message, dial obeyed.
      const fresh = leads.filter((t) => !before.includes(t));
      let delivered: string | null = null;
      if (fresh.length) {
        const control = await getControl(name);
        if (control === 'write') {
          const msg =
            `You are now the team_lead of ${fresh.map((t) => `"${t}"`).join(', ')}. ` +
            `Read first: ${teamsSopPath()} — how to raise supporting sessions and place them into your team.`;
          const sent = await sendText(name, msg).catch(() => null);
          delivered = sent?.started ? 'delivered' : 'not delivered — the prompt was not accepting input';
        } else {
          delivered = `not delivered — "${name}" is dial ${control}; flip it to 🤖 and re-designate to hand over the reading`;
        }
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

  // Control dial (@ronin-control): user / read / write — who may drive this session.
  // Reading is open (that's control-check); FLIPPING is owner-only, enforced in ONE
  // place: the host-side ronin-session-guard hook denies agents any dial flip (tmux or
  // HTTP) before the command runs. The endpoint itself stays open — it is the owner's
  // path (the browser dial), and a server-side owner check only ever managed to lock
  // out the owner (Glen KISS mandate, 2026-08-06: one enforcement point, one open
  // owner path — don't re-add cleverness here).
  // The RIREKI dial + tape-head routes and the TEGAMI read routes are mounted by
  // their services through the ROUTES socket (rireki-api.ts, michi-api.ts).
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

  // Context gauge readout: how full the session's context window is, scraped from the
  // pane's visible tail (the CLI publishes the number into its own status line — Claude
  // via ~/.claude/statusline-ronin.sh, Codex natively). Terminal view only, per the
  // permanent boundary: pane text, never agent internals. Patterns live in src/ctx.ts.
  app.get('/api/sessions/:name/ctx', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    try {
      const reading = await readCtxLine(name); // { ctx, model } — one capture, both readings
      // TOMODACHI's context gauge rides this read; at close the pane is gone, so the last
      // value seen while alive is the only one there will ever be. No sampler, no interval.
      count('ctx', { name, ctx: (reading as { ctx: number | null }).ctx, model: (reading as { model?: string | null }).model ?? null });
      res.json(reading);
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  // Compose target selector: type into ANY session, not just the connected tile.
  // Reliability per co-working/user_repo/wip/RECIPES.md R1/R2: separate Enter, lost-Enter retry,
  // confirm-started — all inside sendText().
  app.post('/api/sessions/:name/send', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    // Speed bump, not a wall (same-Unix-user agents can always reach tmux directly):
    // the dial's job is to make access rules VISIBLE at the moment of posting. Refusals
    // spell out what the poster IS allowed to do; a successful send echoes the dial so
    // even permitted writers see what mode they posted under.
    const control = await getControl(name);
    if (control !== 'write') {
      const warn =
        control === 'user'
          ? `"${name}" is 👤 owner-only — outside agents may not read or type here. Do not flip the dial yourself; report back and ask the owner.`
          : `"${name}" is 👁 watch-only for outside agents — you may observe (capture-pane) but not type. Do not flip the dial yourself; report back and ask the owner to flip it to 🤖.`;
      return res.status(403).json({ error: warn, control });
    }
    const raw = String(req.body?.text ?? '');
    if (!raw.trim()) return res.status(400).json({ error: 'Nothing to send.' });
    try {
      // A lookup macro is answered here and delivered as its own answer; everything
      // else goes through verbatim, exactly as before.
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
