import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import type express from 'express';
import { projectRootsOfSessions } from '../tmux.js';
import { listMacros } from '../macros.js';
import { listSkins } from '../skin-catalog.js';
import { listLexicons, resolveLexicon } from '../lexicon-catalog.js';
import { activeDeskProfileName, listDeskProfiles } from '../desk-profiles.js';
import { initialCampaign } from '../campaigns.js';
import { listSops } from '../resources.js';
import { listWays } from '../resources.js';
import { listActions } from '../actions.js';
import { listSessionReadings } from '../session-readings.js';
import { listAgentAvailability } from '../agents.js';
import { dispatchInstall } from '../agent-install.js';
import {
  listProjectRoots,
  listSessionLaunchSpecs,
  upsertProjectRoot,
  removeProjectRoot,
  repoFacts,
  suggestDirs,
  isValidRootName,
  type RootField,
} from '../project-roots.js';
import { campaignFilter, campaignResolver } from '../campaign-scope.js';
import { arrangementProfile, assertArrangementProfileCurrent, readArrangement, setArrangementProfile, validateArrangementProfile } from '../desks/arrangement.js';
import { readDesksSection } from '../machine-state.js';
import {
  listSavedLaunches,
  saveLaunch,
  removeLaunch,
  seedUserCatalog,
  isShadowable,
  isValidLaunchName,
  savedLaunchFields,
} from '../resources.js';
import {
  findDefinition,
  listAgentTemplates,
  listRoleFamilies,
  listRoutines,
  listSessionRoles,
  listTeamTemplates,
  writeRoleTasks,
} from '../resource-adapters.js';
import { removeUserTemplate, saveAgentTemplate, saveTeamTemplate } from '../templates.js';
import { resolveLaunchProfile } from '../launch-profile.js';

const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replaceAll(homedir(), '~');

const ROOT_FIELDS: RootField[] = ['dir', 'memory', 'match', 'remit'];
const bodyFields = (body: unknown) => {
  const out: Partial<Record<RootField, string>> = {};
  for (const k of ROOT_FIELDS) {
    const v = (body as Record<string, unknown>)?.[k];
    if (typeof v === 'string') out[k] = v.trim().slice(0, 500);
  }
  const arch = (body as Record<string, unknown>)?.archived;
  if (arch !== undefined) out.archived = arch === true || arch === 'yes' ? 'yes' : '';
  return out;
};

export function registerCatalogs(app: express.Express): void {
  app.get('/api/session-readings', async (_req, res) => {
    try {
      res.json(await listSessionReadings());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/actions', async (_req, res) => {
    try {
      res.json(await listActions());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/sops', async (_req, res) => {
    try {
      res.json(await listSops());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/ways', async (_req, res) => {
    try {
      res.json(await listWays());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/skins', async (_req, res) => {
    try {
      res.json(await listSkins());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/macros', async (_req, res) => {
    try {
      res.json(await listMacros());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/project-roots', async (req, res) => {
    try {
      const resolve = await campaignResolver();
      const wanted = ([] as string[]).concat((req.query?.campaign_id as string | string[]) ?? []).filter(Boolean);
      const keep = await campaignFilter(wanted);
      res.json(
        (await listProjectRoots())
          .filter((r) => !r.archived && keep(r.campaign_id))
          .map((r) => ({ ...r, campaign_id: resolve(r.campaign_id) })),
      );
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/project-roots/detail', async (_req, res) => {
    try {
      const [roots, bySession] = await Promise.all([listProjectRoots(), projectRootsOfSessions()]);
      const facts = await Promise.all(roots.map((r) => repoFacts(r)));
      const arrangements = await Promise.all(
        facts.map((f, i) => (f.repo ? readArrangement(roots[i].name, f.dir).catch(() => null) : Promise.resolve(null))),
      );
      const counts: Record<string, number> = {};
      let untagged = 0;
      for (const root of Object.values(bySession)) {
        if (root) counts[root] = (counts[root] ?? 0) + 1;
        else untagged++;
      }
      res.json({
        roots: roots.map((r, i) => ({
          ...r,
          facts: facts[i],
          arrangement: arrangements[i],
          repo_profile: arrangements[i] ? arrangementProfile(arrangements[i]) : null,
          sessions: counts[r.name] ?? 0,
        })),
        untagged,
        new_project_worktrees: (await readDesksSection()).new_project === 'none' ? 'disabled' : 'enabled',
      });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/project-roots/inspect', async (req, res) => {
    const dir = String(req.query.dir ?? '').trim();
    if (!dir) return res.status(400).json({ error: 'A directory is required.' });
    try {
      const facts = await repoFacts({ name: 'candidate', dir, remit: '', match: [], docs: [], plans: [], archived: false, campaign_id: '' });
      const arrangement = facts.repo ? await readArrangement('candidate', facts.dir).catch(() => null) : null;
      res.json({
        ...facts,
        arrangement,
        repo_profile: arrangement ? arrangementProfile(arrangement) : null,
        new_project_worktrees: (await readDesksSection()).new_project === 'none' ? 'disabled' : 'enabled',
      });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/project-roots/suggest', async (req, res) => {
    try {
      res.json({ dirs: await suggestDirs(String(req.query.prefix ?? '')) });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.post('/api/project-roots', async (req, res) => {
    const name = String(req.body?.name ?? '').trim().toLowerCase();
    if (!isValidRootName(name)) return res.status(400).json({ error: 'Handle: lowercase letters, digits, - and _.' });
    const fields = bodyFields(req.body);
    if (!fields.dir) return res.status(400).json({ error: 'A directory is required.' });
    try {
      if ((await listProjectRoots()).some((r) => r.name === name)) {
        return res.status(409).json({ error: `"${name}" is already in the catalog.` });
      }
      const facts = await repoFacts({ name, dir: fields.dir, remit: '', match: [], docs: [], plans: [], archived: false, campaign_id: '' });
      if (facts.repo && req.body?.confirmed !== true) return res.status(400).json({ error: 'Confirm the exact repository profile before adding this repository.' });
      if (facts.repo) {
        validateArrangementProfile(req.body?.profile);
        await assertArrangementProfileCurrent(facts.dir, req.body?.before);
      }
      await upsertProjectRoot(name, fields, { declareArrangement: false });
      const root = (await listProjectRoots()).find((r) => r.name === name);
      const arrangement = root && facts.repo
        ? await setArrangementProfile(root.dir, req.body?.profile, req.body?.before)
        : null;
      res.json({ ok: true, repo_profile: arrangement ? arrangementProfile(arrangement) : null });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.put('/api/project-roots/:name', async (req, res) => {
    const { name } = req.params;
    if (!isValidRootName(name)) return res.status(400).json({ error: 'Invalid handle.' });
    try {
      await upsertProjectRoot(name, bodyFields(req.body));
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.put('/api/project-roots/:name/repo-profile', async (req, res) => {
    const { name } = req.params;
    if (!isValidRootName(name)) return res.status(400).json({ error: 'Invalid handle.' });
    if (req.body?.confirmed !== true) return res.status(400).json({ error: 'Confirm the exact repository profile before applying it.' });
    try {
      const root = (await listProjectRoots()).find((r) => r.name === name);
      if (!root) return res.status(404).json({ error: `"${name}" is not in the catalog.` });
      const arrangement = await setArrangementProfile(root.dir, req.body?.profile, req.body?.before);
      res.json({ ok: true, repo_profile: arrangementProfile(arrangement) });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.delete('/api/project-roots/:name', async (req, res) => {
    const { name } = req.params;
    if (!isValidRootName(name)) return res.status(400).json({ error: 'Invalid handle.' });
    try {
      await removeProjectRoot(name);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.get('/api/session-launch-specs', async (_req, res) => {
    try {
      res.json(await listSessionLaunchSpecs());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/agents', async (_req, res) => {
    try {
      res.json(await listAgentAvailability());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.post('/api/install', async (req, res) => {
    const raw = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!raw) return res.status(400).json({ error: 'Send { items: [{ kind, name }] }.' });
    const items = (raw as Array<Record<string, unknown>>)
      .map((i) => ({ kind: String(i?.kind ?? '').trim(), name: String(i?.name ?? '').trim() }))
      .filter((i) => i.kind && i.name);
    try {
      res.json(await dispatchInstall(items));
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/role-families', async (_req, res) => {
    try {
      res.json(await listRoleFamilies());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/session-roles', async (_req, res) => {
    try {
      res.json(await listSessionRoles());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/routines', async (_req, res) => {
    try {
      res.json(await listRoutines());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  const byKind = <T extends { kinds: string[] }>(rows: T[], raw: unknown): T[] => {
    const kind = String(raw ?? '').trim();
    return !kind || kind === 'open' ? rows : rows.filter((row) => row.kinds.includes(kind));
  };
  app.get('/api/templates/agents', async (req, res) => {
    try {
      res.json(byKind(await listAgentTemplates(), req.query?.kind));
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });
  app.get('/api/templates/teams', async (req, res) => {
    try {
      res.json(byKind(await listTeamTemplates(), req.query?.kind));
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.post('/api/templates/agents', async (req, res) => {
    try {
      res.json({ ok: true, template: await saveAgentTemplate(req.body ?? {}) });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });
  app.post('/api/templates/teams', async (req, res) => {
    try {
      res.json({ ok: true, template: await saveTeamTemplate(req.body ?? {}) });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });
  app.delete('/api/templates/:shelf/:name', async (req, res) => {
    const shelf = String(req.params.shelf);
    if (shelf !== 'agents' && shelf !== 'teams') return res.status(400).json({ error: 'A shelf is agents or teams.' });
    try {
      res.json({ ok: true, ...(await removeUserTemplate(shelf, String(req.params.name))) });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.get('/api/desk-profiles', async (_req, res) => {
    try {
      res.json({
        active: await activeDeskProfileName(),
        profiles: await listDeskProfiles(),
        desk: (await initialCampaign())?.desk ?? null,
      });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/lexicons', async (_req, res) => {
    try {
      res.json(await listLexicons());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });
  app.get('/api/lexicons/:name', async (req, res) => {
    try {
      const lex = await resolveLexicon(String(req.params.name));
      if (!lex) return res.status(404).json({ error: `no lexicon named '${req.params.name}'` });
      res.json(lex);
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.put('/api/role-families/:name/session_roles', async (req, res) => {
    const list = req.body?.session_roles;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'Send { session_roles: [...] }.' });
    try {
      res.json({ ok: true, session_roles: await writeRoleTasks(req.params.name, list as string[]) });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.get('/api/launch-profile', async (req, res) => {
    if (req.query?.role_family !== undefined) {
      return res.status(400).json({
        error: 'role_family is retired — a launch profile is resolved from the session_role alone.',
      });
    }
    const task = String(req.query?.session_role ?? '').trim();
    try {
      const taskDef = await findDefinition('session_roles', task);
      if (task && !taskDef) return res.status(404).json({ error: `Unknown session_role "${task}".` });
      res.json(resolveLaunchProfile(taskDef));
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.get('/api/saved-launches', async (_req, res) => {
    try {
      res.json(await listSavedLaunches());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.post('/api/saved-launches', async (req, res) => {
    const name = String(req.body?.name ?? '').trim().toLowerCase();
    if (!isValidLaunchName(name)) return res.status(400).json({ error: 'Handle: lowercase letters, digits, - and _.' });
    const fields = savedLaunchFields(req.body);
    const legacy = (req.body as Record<string, unknown>)?.group;
    if (!fields.team && typeof legacy === 'string') fields.team = legacy.trim().slice(0, 500);
    try {
      await saveLaunch(name, fields);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.delete('/api/saved-launches/:name', async (req, res) => {
    try {
      await removeLaunch(req.params.name);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.post('/api/catalogs/seed', async (req, res) => {
    const file = String((req.body as { file?: unknown })?.file ?? '');
    if (!isShadowable(file)) return res.status(400).json({ error: `"${file}" is not a catalog you can shadow.` });
    try {
      res.json(await seedUserCatalog(file));
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });
}
