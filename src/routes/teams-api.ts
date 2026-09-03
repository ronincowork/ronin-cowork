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
import { assertSameCampaignRoot, campaignFilter, campaignResolver, initialCampaignId, machineCampaignId } from '../campaign-scope.js';

const errMsg = (e: unknown): string => String((e as Error)?.message ?? e);

async function campaignOf(stated: unknown): Promise<string> {
  const asked = typeof stated === 'string' ? stated.trim() : '';
  return asked || (await initialCampaignId());
}

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
  if (b.repos !== undefined) edit.repos = (Array.isArray(b.repos) ? b.repos : String(b.repos).split(','))
    .map(String).map((v) => v.trim().slice(0, 128)).filter(Boolean);
  if (b.branches !== undefined) edit.branches = b.branches && typeof b.branches === 'object' && !Array.isArray(b.branches)
    ? Object.fromEntries(Object.entries(b.branches as Record<string, unknown>)
        .map(([repo, branch]) => [repo.trim().slice(0, 128), String(branch ?? '').trim().slice(0, 128)])
        .filter(([repo, branch]) => repo && branch)) : {};
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
  app.get('/api/team-rosters', async (req, res) => {
    try {
      const resolve = await campaignResolver();
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
      await assertSameCampaignRoot(campaign_id, edit.project_root ?? '');
      let template;
      const token = String(req.body?.template ?? '').trim();
      if (token) {
        const { listAgentTemplates } = await import('../resource-adapters.js');
        const box = (await listAgentTemplates()).find((row) => row.name === token);
        if (!box) template = { source: token, ignored: 'not an agent template on this box' };
        else {
          if (edit.routines === undefined) {
            const { readCampaign } = await import('../campaigns.js');
            const stored = (await readCampaign(campaign_id))?.config?.agent_defaults as
              { routines?: Record<string, boolean> } | undefined;
            const { listRoutines } = await import('../resource-adapters.js');
            edit.routines = stored?.routines
              ? { ...stored.routines }
              : Object.fromEntries((await listRoutines()).map((row) => [row.name, row.bundles.includes('base')]));
          }
          for (const on of box.routines_on) edit.routines[on] = true;
          for (const off of box.routines_off) edit.routines[off] = false;
          template = { source: token, routines_on: box.routines_on, routines_off: box.routines_off };
        }
      }
      const roster = await createTeamRoster(name, edit, campaign_id);
      count('team.create');
      res.json({ ok: true, roster, ...(template ? { template } : {}) });
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
