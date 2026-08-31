/**
 * TEAM ROSTER ROUTES — the durable half of every team.
 *
 * The team is the organizing concept (owner, 2026-08-23): a `team_roster` carries the
 * team's kind, objective, kit and launch defaults, and exists independent of
 * any live session — a League list must show a team with zero members, and a Team View
 * must open on one. The LIVE half (members, leads) is derived per call from the
 * sessions and served by /api/teams* in sessions-api.ts; nothing here ever stores it.
 *
 * Lifecycle, each refusing out loud: create (POST), edit (PUT — metadata as a unit,
 * only the fields in the settled record), dissolve
 * (DELETE — the roster only; the wipeboard is never deleted by a route, owner
 * 2026-08-07, it reverts to a custom board).
 */
import type express from 'express';
import {
  createTeamRoster,
  deleteTeamRoster,
  isCreatableTeamName,
  listTeamRosters,
  readTeamRoster,
  writeTeamRoster,
  type RosterEdit,
} from '../team-rosters.js';
import { boardExists } from '../wipeboards.js';
import { count } from '../counts.js';
import { getLeads, getTags, listSessions, setLeads, setTags } from '../tmux.js';
import { writeTeams } from '../tegami.js';
import { announceTeamChanges } from './wipeboards-api.js';
import { listTeamTemplates, removeTeamTemplate, saveTeamTemplate } from '../team-templates.js';
import { assertSameCampaignRoot, campaignFilter, campaignResolver, initialCampaignId, machineCampaignId } from '../campaign-scope.js';

const errMsg = (e: unknown): string => String((e as Error)?.message ?? e);

/**
 * The Campaign a WRITE lands in: the one stated, else the initial one. Every write emits an
 * explicit id — the compatibility fallback is a read-side rule only, so that the day it is
 * removed nothing on disk is still relying on it.
 */
async function campaignOf(stated: unknown): Promise<string> {
  const asked = typeof stated === 'string' ? stated.trim() : '';
  return asked || (await initialCampaignId());
}

/** The one shape a write accepts — and the derived facts, refused BY NAME. */
function editOf(body: unknown): RosterEdit {
  const b = (body ?? {}) as Record<string, unknown>;
  for (const k of ['members', 'sessions', 'team_lead', 'leads', 'leaders']) {
    if (b[k] !== undefined) {
      throw new Error(
        `A roster never holds "${k}" — members and leads are derived from the live sessions ` +
          '(each session defines whose team it is on), so storing them here would be the drift ' +
          'this store exists to prevent.',
      );
    }
  }
  const edit: RosterEdit = {};
  if (b.title !== undefined) edit.title = String(b.title).trim().slice(0, 100);
  if (b.kind !== undefined) {
    const kind = String(b.kind).trim();
    if (!['open', 'coding', 'work', 'personal', 'household', 'social', 'school'].includes(kind)) {
      throw new Error('kind is open, coding, work, personal, household, social, or school.');
    }
    edit.kind = kind as RosterEdit['kind'];
  }
  if (b.objective !== undefined) edit.objective = String(b.objective).trim().slice(0, 2000);
  if (b.project_root !== undefined) edit.project_root = String(b.project_root).trim().slice(0, 128);
  if (b.references !== undefined) edit.references = Array.isArray(b.references)
    ? b.references.map(String).map((v) => v.trim().slice(0, 500)).filter(Boolean) : [];
  if (b.routines !== undefined) edit.routines = b.routines && typeof b.routines === 'object' && !Array.isArray(b.routines)
    ? Object.fromEntries(Object.entries(b.routines).filter(([, value]) => typeof value === 'boolean')) : {};
  if (b.behaviours !== undefined) {
    const value = b.behaviours && typeof b.behaviours === 'object' && !Array.isArray(b.behaviours)
      ? b.behaviours as Record<string, unknown> : {};
    edit.behaviours = {
      books: Array.isArray(value.books) ? value.books.map(String).map((v) => v.trim().slice(0, 160)).filter(Boolean) : [],
      required: value.required === true,
    };
  }
  if (b.agent_defaults !== undefined) edit.agent_defaults = b.agent_defaults && typeof b.agent_defaults === 'object' && !Array.isArray(b.agent_defaults)
    ? b.agent_defaults as RosterEdit['agent_defaults'] : {};
  if (b.branch !== undefined) edit.branch = String(b.branch).trim().slice(0, 128);
  if (b.wipeboard !== undefined) edit.wipeboard = String(b.wipeboard).trim().slice(0, 64);
  if (b.state !== undefined) {
    const st = String(b.state).trim().toLowerCase();
    if (st !== 'active' && st !== 'archived') throw new Error('state is "active" or "archived".');
    edit.state = st;
  }
  return edit;
}

export function registerTeams(app: express.Express): void {
  app.get('/api/team-templates', async (_req, res) => {
    try {
      const resolve = await campaignResolver();
      res.json((await listTeamTemplates()).map((t) => ({ ...t, campaign_id: resolve(t.campaign_id) })));
    } catch (e) { res.status(500).json({ error: errMsg(e) }); }
  });
  app.post('/api/team-templates', async (req, res) => {
    try {
      // A save states its Campaign, or lands in the initial one: every WRITE emits an
      // explicit id, which is what lets the read-side fallback be deleted later.
      const campaign_id = await campaignOf(req.body?.campaign_id);
      await saveTeamTemplate(String(req.body?.name ?? '').trim().toLowerCase(), req.body?.draft ?? {}, campaign_id);
      res.json({ ok: true, campaign_id });
    }
    catch (e) { res.status(400).json({ error: errMsg(e) }); }
  });
  app.delete('/api/team-templates/:name', async (req, res) => {
    try {
      await removeTeamTemplate(req.params.name, await campaignOf(req.query?.campaign_id));
      res.json({ ok: true });
    }
    catch (e) { res.status(400).json({ error: errMsg(e) }); }
  });
  // THE LEAGUE LIST — every durable team, zero-member teams included, with whether its
  // board file exists yet (boards materialize on first post, per docs/wipeboards.md).
  app.get('/api/team-rosters', async (req, res) => {
    try {
      const resolve = await campaignResolver();
      // A machine shows one Campaign. An explicit query is retained for the Campaign
      // management seam; ordinary Cowork screens name none and receive only the machine's.
      const named = ([] as string[]).concat((req.query?.campaign_id as string | string[]) ?? []).filter(Boolean);
      const wanted = named.length ? named : [await machineCampaignId()].filter(Boolean);
      const keep = await campaignFilter(wanted);
      const rosters = (await listTeamRosters()).filter((r) => keep(r.campaign_id));
      res.json(
        await Promise.all(
          rosters.map(async (r) => ({
            ...r,
            campaign_id: resolve(r.campaign_id),
            wipeboard_exists: await boardExists(r.wipeboard),
          })),
        ),
      );
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.post('/api/team-rosters', async (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!isCreatableTeamName(name)) {
      return res.status(400).json({ error: 'A team name is lowercase letters, digits, _ and - (it is also the tag).' });
    }
    try {
      const campaign_id = await campaignOf(req.body?.campaign_id);
      const edit = editOf(req.body);
      // A Cowork may only default to a Project root in its own Campaign.
      await assertSameCampaignRoot(campaign_id, edit.project_root ?? '');
      const roster = await createTeamRoster(name, edit, campaign_id);
      count('team.create');
      res.json({ ok: true, roster });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.get('/api/team-rosters/:name', async (req, res) => {
    const roster = await readTeamRoster(req.params.name);
    if (!roster) return res.status(404).json({ error: `Team "${req.params.name}" has no roster.` });
    res.json({ ...roster, wipeboard_exists: await boardExists(roster.wipeboard) });
  });

  app.put('/api/team-rosters/:name', async (req, res) => {
    try {
      res.json({ ok: true, roster: await writeTeamRoster(req.params.name, editOf(req.body)) });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.delete('/api/team-rosters/:name', async (req, res) => {
    try {
      await deleteTeamRoster(req.params.name);
      for (const session of await listSessions()) {
        if (!session.tags.includes(req.params.name)) continue;
        const teams = await setTags(session.name, session.tags.filter((team) => team !== req.params.name));
        const leads = await getLeads(session.name);
        if (leads.includes(req.params.name)) await setLeads(session.name, leads.filter((team) => team !== req.params.name));
        await writeTeams(session.name, teams).catch(() => {});
        await announceTeamChanges(session.name, session.tags, teams).catch(() => {});
      }
      count('team.dissolve');
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  /**
   * THE TEAM DOOR — `PUT /api/team { name, …fields?, session_names?: string[] }` (owner,
   * 2026-08-26): one upsert. A name with no roster CREATES one from whatever fields are
   * present; a name with a roster UPDATES only the fields present and leaves the rest.
   * `session_names` tags those LIVE sessions onto the team — additive, never removing
   * anyone; a name that is not live is reported back by name, and the rest still go
   * through. Membership stays derived from tags (the roster stores none of it — `editOf`
   * still refuses `members` by name); this door only gives the roster call a way to do
   * the tagging in the same breath. The rare door: most sessions are born onto a team by
   * `/api/session`, and only a team's creation or a change to its facts comes here.
   */
  app.put('/api/team', async (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!isCreatableTeamName(name)) {
      return res.status(400).json({ error: 'A team name is lowercase letters, digits, _ and - (it is also the tag).' });
    }
    const wanted = (Array.isArray(req.body?.session_names) ? req.body.session_names : String(req.body?.session_names ?? '').split(','))
      .map((s: unknown) => String(s).trim())
      .filter(Boolean)
      .slice(0, 32);
    try {
      const edit = editOf(req.body);
      const existing = await readTeamRoster(name);
      const roster = existing ? await writeTeamRoster(name, edit) : await createTeamRoster(name, edit);
      count(existing ? 'team.update' : 'team.create');
      const live = new Set((await listSessions()).map((s) => s.name));
      const added: string[] = [];
      const notLive: string[] = [];
      for (const s of wanted) {
        if (!live.has(s)) {
          notLive.push(s);
          continue;
        }
        const before = await getTags(s);
        if (before.includes(name)) continue;
        const after = await setTags(s, [...before, name].slice(0, 16));
        await announceTeamChanges(s, before, after).catch(() => {});
        await writeTeams(s, after).catch(() => {});
        added.push(s);
      }
      res.json({ ok: true, created: !existing, roster, added, not_live: notLive });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });
}
