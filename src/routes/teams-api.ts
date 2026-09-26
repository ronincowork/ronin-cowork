import type express from 'express';
import {
  createTeamRoster,
  isCreatableTeamName,
  listTeamRosters,
  readTeamRoster,
  writeTeamRoster,
  type RosterEdit,
} from '../team-rosters.js';
import { boardExists } from '../wipeboards.js';
import { count } from '../counts.js';
import { getTags, listSessions, setTags } from '../tmux.js';
import { writeTeams } from '../tegami.js';
import { announceTeamChanges } from './wipeboards-api.js';
import { broadcastEvent } from '../ws/events.js';
import { assertSameCampaignRoot, campaignFilter, campaignResolver, initialCampaignId, machineCampaignId } from '../campaign-scope.js';
import { retireTeam } from '../team-retire.js';
import { readCampaign } from '../campaigns.js';
import { teamAgentDefaults } from '../agent-defaults.js';
import { assignTeamProject, issueTeamProjectId, moveTeamProject, returnTeamProject, writeTeamIdea, type TeamProjectArea } from '../team-projects.js';
import { PROJECT_EXITS, PROJECT_STATUSES, normalizeProject, type Project } from '../projects.js';

const errMsg = (e: unknown): string => String((e as Error)?.message ?? e);

async function campaignOf(stated: unknown): Promise<string> {
  const asked = typeof stated === 'string' ? stated.trim() : '';
  return asked || (await initialCampaignId());
}

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Materialize Campaign defaults only at creation. Existing-team updates deliberately
 * bypass this helper so omission continues to mean preserve. */
async function creationEdit(campaign_id: string, stated: RosterEdit): Promise<RosterEdit> {
  const campaign = await readCampaign(campaign_id);
  if (!campaign) throw new Error(`Unknown Campaign: ${campaign_id || '(none)'}.`);
  const inherited = campaign.config.defaults;
  const cowork = object(campaign.config.cowork_defaults);
  const edit: RosterEdit = {
    ...(typeof cowork.kind === 'string' ? { kind: cowork.kind as RosterEdit['kind'] } : {}),
    ...(typeof cowork.project_root === 'string' ? { project_root: cowork.project_root } : {}),
    ...(Array.isArray(cowork.repos) ? { repos: cowork.repos.map(String) } : {}),
    ...(typeof cowork.branch === 'string' ? { branch: cowork.branch } : {}),
    ...(object(cowork.branches) ? { branches: Object.fromEntries(Object.entries(object(cowork.branches)).map(([k, v]) => [k, String(v)])) } : {}),
    ...stated,
    behaviours: stated.behaviours ?? { selected: [...inherited.behaviours], required: [] },
    agent_defaults: { ...teamAgentDefaults(inherited), ...(stated.agent_defaults ?? {}) },
  };
  await assertSameCampaignRoot(campaign_id, edit.project_root ?? '');
  return edit;
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
  if (b.behaviours !== undefined) {
    const value = b.behaviours && typeof b.behaviours === 'object' && !Array.isArray(b.behaviours)
      ? b.behaviours as Record<string, unknown> : {};
    edit.behaviours = {
      selected: Array.isArray(value.selected) ? value.selected.map(String).map((v) => v.trim().slice(0, 160)).filter((v) => Boolean(v) && v !== 'mandates') : [],
      required: Array.isArray(value.required) ? value.required.map(String).map((v) => v.trim().slice(0, 160)).filter((v) => Boolean(v) && v !== 'mandates') : [],
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

function ideaEditOf(body: unknown): Partial<Project> {
  const b = object(body);
  const edit: Partial<Project> = {};
  if (b.title !== undefined) edit.title = String(b.title).trim().slice(0, 200);
  if (b.objective !== undefined) edit.objective = String(b.objective).trim().slice(0, 2000);
  if (b.exit !== undefined) {
    if (!PROJECT_EXITS.includes(b.exit as Project['exit'])) throw new Error(`exit is ${PROJECT_EXITS.join(', ')}.`);
    edit.exit = b.exit as Project['exit'];
  }
  if (b.status !== undefined) {
    if (!PROJECT_STATUSES.includes(b.status as Project['status'])) throw new Error(`status is ${PROJECT_STATUSES.join(', ')}.`);
    edit.status = b.status as Project['status'];
  }
  if (b.ladder !== undefined) {
    const shaped = normalizeProject({
      id: '_', title: '_', objective: '', stage: 'IDEAS', exit: 'lead', status: 'yellow', ladder: b.ladder, evidence: [],
    });
    if (!shaped) throw new Error('ladder is not a valid project ladder.');
    edit.ladder = shaped.ladder;
  }
  if (b.evidence !== undefined) edit.evidence = Array.isArray(b.evidence) ? b.evidence.map(String) : [];
  return edit;
}

export function registerTeams(app: express.Express): void {
  // Every write below changes what GET /api/team-rosters answers. The server knows when it
  // wrote, so it says so: {t:'teams'} is a nudge with no payload, and the browser store re-reads.
  app.use(['/api/team-rosters', '/api/team'], (req, res, next) => {
    if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) broadcastEvent({ t: 'teams' }); });
    next();
  });

  app.post('/api/team-rosters/:name/projects', async (req, res) => {
    try {
      const result = await writeTeamIdea(req.params.name, undefined, ideaEditOf(req.body));
      res.json({ ok: true, ...result, acknowledgement: `Project ${result.project.id} created with stable id ${result.project.id}. Next: team project read ${req.params.name} ${result.project.id}. Remember to update your project.` });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.post('/api/team-rosters/:name/projects/issue', async (req, res) => {
    try {
      res.json({ ok: true, id: await issueTeamProjectId(req.params.name) });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.put('/api/team-rosters/:name/projects/:id', async (req, res) => {
    try {
      res.json({ ok: true, ...(await writeTeamIdea(req.params.name, req.params.id, ideaEditOf(req.body))) });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.post('/api/team-rosters/:name/projects/:id/assign', async (req, res) => {
    try {
      const session = String(req.body?.session ?? '').trim();
      if (!session) throw new Error('assign needs a session.');
      const project = await assignTeamProject(req.params.name, req.params.id, session);
      res.json({ ok: true, project, acknowledgement: `Project ${project.id} moved whole from Team ${req.params.name} Inbox to ${session}. Run work-record project read ${project.id}, then update it.` });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.post('/api/team-rosters/:name/projects/:id/return', async (req, res) => {
    try {
      const session = String(req.body?.session ?? '').trim();
      if (!session) throw new Error('return needs a session.');
      const area = String(req.body?.area ?? 'inbox').toLowerCase() as TeamProjectArea;
      if (!['inbox', 'done', 'backlog'].includes(area)) throw new Error('return area must be inbox, done or backlog.');
      const result = await returnTeamProject(req.params.name, req.params.id, session, area);
      res.json({ ok: true, ...result, area, acknowledgement: `Project ${result.project.id} moved whole to Team ${req.params.name} ${area[0]!.toUpperCase() + area.slice(1)}; holder: Team ${req.params.name}; focus: ${result.focus ?? 'none'}. Remember to update your project.` });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.post('/api/team-rosters/:name/projects/:id/backlog', async (req, res) => {
    try {
      const { project, from } = await moveTeamProject(req.params.name, req.params.id, 'backlog');
      res.json({ ok: true, project, area: 'backlog', acknowledgement: `Project ${project.id} moved whole from Team ${req.params.name} ${from} to Backlog. Remember to update your project.` });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.post('/api/team-rosters/:name/projects/:id/restore', async (req, res) => {
    try {
      const { project, from } = await moveTeamProject(req.params.name, req.params.id, 'inbox');
      res.json({ ok: true, project, area: 'inbox', acknowledgement: `Project ${project.id} restored from Team ${req.params.name} ${from} to Inbox; next: team project assign ${req.params.name} ${project.id} <session>. Remember to update your project.` });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.post('/api/team-rosters/:name/projects/:id/done', async (req, res) => {
    try {
      const { project, from } = await moveTeamProject(req.params.name, req.params.id, 'done');
      res.json({ ok: true, project, area: 'done', acknowledgement: `Project ${project.id} moved whole from Team ${req.params.name} ${from} to Done. Remember to update your project.` });
    } catch (e) { res.status(400).json({ error: errMsg(e) }); }
  });

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
      const edit = await creationEdit(campaign_id, editOf(req.body));
      // Every team-creation entrance reaches this door. Some, such as New Agent's
      // abbreviated "A new team" path, state only identity. Materialize the Campaign
      // layer here so an omitted browser field cannot become a complete map of `false`.
      // Values the caller did state remain the final word.
      let template;
      const token = String(req.body?.template ?? '').trim();
      if (token) {
        const { listAgentTemplates } = await import('../resource-adapters.js');
        const box = (await listAgentTemplates()).find((row) => row.name === token);
        if (!box) template = { source: token, ignored: 'not an agent template on this box' };
        else template = { source: token };
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
      const disposition = String(req.body?.worktree_disposition ?? 'inspect').trim().toLowerCase();
      const result = await retireTeam(req.params.name, disposition === 'prompt' || disposition === 'ignore' ? disposition : 'inspect');
      if (result.ok !== true) return res.json(result);
      count('team.dissolve');
      res.json(result);
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
      const campaign_id = await campaignOf(req.body?.campaign_id);
      const reapplyCampaign = req.body?.campaign_defaults === true;
      const roster = existing
        ? await writeTeamRoster(name, reapplyCampaign ? await creationEdit(campaign_id, edit) : edit)
        : await createTeamRoster(name, await creationEdit(campaign_id, edit), campaign_id);
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
