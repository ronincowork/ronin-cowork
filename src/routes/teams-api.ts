/**
 * TEAM ROSTER ROUTES — the durable half of every team.
 *
 * The team is the organizing concept (owner, 2026-08-23): a `team_roster` carries the
 * team's `team_role`, its objective and its launch defaults, and exists independent of
 * any live session — a League list must show a team with zero members, and a Team View
 * must open on one. The LIVE half (members, leads) is derived per call from the
 * sessions and served by /api/teams* in sessions-api.ts; nothing here ever stores it.
 *
 * Lifecycle, each refusing out loud: create (POST), edit (PUT — metadata as a unit,
 * `team_role` changes included, since it is mutable by ruling), rename, dissolve
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
  renameTeamRoster,
  writeTeamRoster,
  type RosterEdit,
} from '../team-rosters.js';
import { boardExists } from '../wipeboards.js';
import { count } from '../counts.js';

const errMsg = (e: unknown): string => String((e as Error)?.message ?? e);

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
  if (b.team_role !== undefined) edit.team_role = String(b.team_role).trim().slice(0, 64);
  if (b.objective !== undefined) edit.objective = String(b.objective).trim().slice(0, 2000);
  if (b.project_root !== undefined) edit.project_root = String(b.project_root).trim().slice(0, 128);
  if (b.repos !== undefined) {
    edit.repos = (Array.isArray(b.repos) ? b.repos.map(String) : String(b.repos).split(','))
      .map((r) => r.trim())
      .filter(Boolean)
      .slice(0, 16);
  }
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
  // THE LEAGUE LIST — every durable team, zero-member teams included, with whether its
  // board file exists yet (boards materialize on first post, per docs/wipeboards.md).
  app.get('/api/team-rosters', async (_req, res) => {
    try {
      const rosters = await listTeamRosters();
      res.json(
        await Promise.all(
          rosters.map(async (r) => ({ ...r, wipeboard_exists: await boardExists(r.wipeboard) })),
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
      const roster = await createTeamRoster(name, editOf(req.body));
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

  app.post('/api/team-rosters/:name/rename', async (req, res) => {
    const to = String(req.body?.to ?? '').trim();
    try {
      res.json({ ok: true, roster: await renameTeamRoster(req.params.name, to) });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.delete('/api/team-rosters/:name', async (req, res) => {
    try {
      await deleteTeamRoster(req.params.name);
      count('team.dissolve');
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });
}
