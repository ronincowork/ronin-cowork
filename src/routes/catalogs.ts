import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import type express from 'express';
import { projectRootsOfSessions } from '../tmux.js';
import { listSkins } from '../skin-catalog.js';
import { listLexicons, resolveLexicon } from '../lexicon-catalog.js';
import { activeDeskProfileName, listDeskProfiles } from '../desk-profiles.js';
import { initialCampaign, readCampaign } from '../campaigns.js';
import { listWays } from '../resources.js';
import { listSessionReadings } from '../session-readings.js';
import { listAgentAvailability } from '../agents.js';
import { dispatchInstall } from '../agent-install.js';
import { listProviderCatalog, readProviderCatalog } from '../model-providers.js';
import {
  listProjectRoots,
  upsertProjectRoot,
  removeProjectRoot,
  repoFacts,
  checkProjectRootGitAccess,
  suggestDirs,
  isValidRootName,
  type RootField,
} from '../project-roots.js';
import { campaignResolver, machineCampaignId } from '../campaign-scope.js';
import { arrangementProfile, assertArrangementProfileCurrent, readArrangement, setArrangementProfile, validateArrangementProfile } from '../desks/arrangement.js';
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
  listBehaviours,
  listAgentTemplates,
  listInstallations,
  listTeamTemplates,
} from '../resource-adapters.js';
import { availableBehaviours } from '../instruction-cascade.js';
import { removeUserTemplate, saveAgentTemplate, saveTeamTemplate } from '../templates.js';
import { browseFolders, createFolder, withRegisteredRoots } from '../folder-browser.js';
import {
  BehaviourDocumentError,
  createBehaviourDocument,
  readBehaviourDocument,
  updateBehaviourDocument,
} from '../behaviour-documents.js';

const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replaceAll(homedir(), '~');

const ROOT_FIELDS: RootField[] = ['title', 'dir', 'memory', 'match', 'remit', 'docs', 'plans', 'campaign_id'];
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
  app.get('/api/folders', async (req, res) => {
    try {
      const listing = await browseFolders(String(req.query.dir ?? ''), {
        hidden: req.query.hidden === 'yes',
        query: String(req.query.q ?? ''),
      });
      res.json(withRegisteredRoots(listing, await listProjectRoots()));
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.post('/api/folders', async (req, res) => {
    try {
      res.json(await createFolder(String(req.body?.parent ?? ''), String(req.body?.name ?? ''), req.body?.init_git === true));
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.get('/api/session-readings', async (_req, res) => {
    try {
      res.json(await listSessionReadings());
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

  app.get('/api/ways/:scope/:name', async (req, res) => {
    try { res.json(await readBehaviourDocument(req.params.scope, req.params.name)); }
    catch (e) { res.status(e instanceof BehaviourDocumentError ? e.status : 500).json({ error: errMsg(e) }); }
  });

  app.post('/api/ways', async (req, res) => {
    try { res.status(201).json(await createBehaviourDocument(req.body ?? {})); }
    catch (e) { res.status(e instanceof BehaviourDocumentError ? e.status : 500).json({ error: errMsg(e) }); }
  });

  app.put('/api/ways/:scope/:name', async (req, res) => {
    try { res.json(await updateBehaviourDocument({ ...req.body, scope: req.params.scope, name: req.params.name })); }
    catch (e) { res.status(e instanceof BehaviourDocumentError ? e.status : 500).json({ error: errMsg(e) }); }
  });

  app.get('/api/campaign-default-options', async (req, res) => {
    try {
      const campaign_id = String(req.query.campaign_id ?? '').trim() || (await initialCampaign())?.id || '';
      const campaign = campaign_id ? await readCampaign(campaign_id) : null;
      if (!campaign) return res.status(404).json({ error: `Unknown Campaign: ${campaign_id || '(none)'}.` });
      const [installations, behaviours] = await Promise.all([listInstallations(), listBehaviours()]);
      const available = availableBehaviours(installations, campaign.config.installations, behaviours);
      res.json({
        available,
        behaviours: behaviours.filter((row) => row.scope === 'selected' && !row.installation).map((row) => ({
          name: row.name, label: row.label, blurb: row.blurb, reading: row.page, scope: row.scope,
        })),
      });
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

  app.get('/api/project-roots', async (req, res) => {
    try {
      const resolve = await campaignResolver();
      const named = ([] as string[]).concat((req.query?.campaign_id as string | string[]) ?? []).filter(Boolean);
      const wanted = named.length ? named : [await machineCampaignId()].filter(Boolean);
      const wantedSet = new Set(wanted);
      res.json(
        (await listProjectRoots())
          .filter((r) => !r.archived && wantedSet.has(resolve(r.campaign_id)))
          .map((r) => ({ ...r, campaign_id: resolve(r.campaign_id) })),
      );
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/project-roots/detail', async (req, res) => {
    try {
      const resolve = await campaignResolver();
      const named = ([] as string[]).concat((req.query?.campaign_id as string | string[]) ?? []).filter(Boolean);
      const wanted = new Set(named.length ? named : [await machineCampaignId()].filter(Boolean));
      const [allRoots, bySession] = await Promise.all([listProjectRoots(), projectRootsOfSessions()]);
      const roots = allRoots.filter((root) => wanted.has(resolve(root.campaign_id)));
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
      });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/project-roots/inspect', async (req, res) => {
    const dir = String(req.query.dir ?? '').trim();
    if (!dir) return res.status(400).json({ error: 'A directory is required.' });
    try {
      const facts = await repoFacts({ name: 'candidate', title: '', dir, remit: '', match: [], docs: [], plans: [], archived: false, campaign_id: '' });
      const arrangement = facts.repo ? await readArrangement('candidate', facts.dir).catch(() => null) : null;
      res.json({
        ...facts,
        arrangement,
        repo_profile: arrangement ? arrangementProfile(arrangement) : null,
      });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.post('/api/project-roots/:name/git-access', async (req, res) => {
    const { name } = req.params;
    if (!isValidRootName(name)) return res.status(400).json({ error: 'Invalid ID.' });
    try {
      const root = (await listProjectRoots()).find((entry) => entry.name === name);
      if (!root) return res.status(404).json({ error: `"${name}" is not in the catalog.` });
      res.json({ ok: true, ...(await checkProjectRootGitAccess(root)) });
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
    if (!isValidRootName(name)) return res.status(400).json({ error: 'ID: lowercase letters, digits, - and _.' });
    const fields = bodyFields(req.body);
    if (!fields.dir) return res.status(400).json({ error: 'A directory is required.' });
    try {
      if ((await listProjectRoots()).some((r) => r.name === name)) {
        return res.status(409).json({ error: `"${name}" is already in the catalog.` });
      }
      const facts = await repoFacts({ name, title: fields.title ?? '', dir: fields.dir, remit: '', match: [], docs: [], plans: [], archived: false, campaign_id: '' });
      if (facts.repo && req.body?.confirmed !== true) return res.status(400).json({ error: 'Confirm the exact repository profile before adding this repository.' });
      if (facts.repo) {
        validateArrangementProfile(req.body?.profile);
        await assertArrangementProfileCurrent(facts.dir, req.body?.before);
      }
      await upsertProjectRoot(name, fields);
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
    if (!isValidRootName(name)) return res.status(400).json({ error: 'Invalid ID.' });
    try {
      await upsertProjectRoot(name, bodyFields(req.body));
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.put('/api/project-roots/:name/repo-profile', async (req, res) => {
    const { name } = req.params;
    if (!isValidRootName(name)) return res.status(400).json({ error: 'Invalid ID.' });
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
    if (!isValidRootName(name)) return res.status(400).json({ error: 'Invalid ID.' });
    try {
      await removeProjectRoot(name);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  // The one catalog read for the client: origin, path, the header's updated day, and every
  // provider with its models.
  app.get('/api/provider-catalog', async (_req, res) => {
    try {
      res.json(await readProviderCatalog());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/agents', async (_req, res) => {
    try {
      // The CLI registry says what is installed; the catalog says whose it is.
      const [agents, catalog] = await Promise.all([listAgentAvailability(), listProviderCatalog()]);
      res.json(agents.map((agent) => ({ ...agent, from: catalog.find((entry) => entry.cli === agent.id)?.label ?? '' })));
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

  app.get('/api/installations', async (_req, res) => {
    try { res.json(await listInstallations()); }
    catch (e) { res.status(500).json({ error: errMsg(e) }); }
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
