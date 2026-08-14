/**
 * CATALOG ROUTES — the markdown-backed lists the commons reads and edits: macros,
 * hotwords, project roots, brains, session jobs. Catalogs are parsed at request time
 * (ronin_catalogs/ for stock, the catalogs store for the user's own), so the UI always
 * matches the doc. See docs/project-roots.md.
 */
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import type express from 'express';
import { projectRootsOfSessions } from '../tmux.js';
import { listMacros } from '../macros.js';
import {
  listProjectRoots,
  listBrains,
  upsertProjectRoot,
  removeProjectRoot,
  repoFacts,
  isValidRootName,
  type RootField,
} from '../project-roots.js';
import {
  listSessionJobs,
  listSavedLaunches,
  saveLaunch,
  removeLaunch,
  seedUserCatalog,
  isShadowable,
  isValidLaunchName,
  type LaunchField,
} from '../catalog.js';

// fs errors carry absolute paths (`ENOENT: open '/home/…'`); the browser gets the
// fault, never the box's layout.
const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replaceAll(homedir(), '~');

/** The fields commons may write. Anything else in a block is the owner's and is preserved. */
const ROOT_FIELDS: RootField[] = ['dir', 'read', 'memory', 'provider', 'model', 'match', 'remit'];
const bodyFields = (body: unknown) => {
  const out: Partial<Record<RootField, string>> = {};
  for (const k of ROOT_FIELDS) {
    const v = (body as Record<string, unknown>)?.[k];
    if (typeof v === 'string') out[k] = v.trim().slice(0, 500);
  }
  return out;
};

export function registerCatalogs(app: express.Express): void {
  app.get('/api/macros', async (_req, res) => {
    try {
      res.json(await listMacros());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  // The project_root list: parsed live from the USER catalog (catalogs store, PROJECT_ROOTS.md)
  // so the launcher always matches the doc — where to work, what to read first, which brain.
  // Same contract as /api/macros. No user file yet = an empty list, not an error: that is a
  // fresh install. The brain each root resolves to comes from the SHIPPED launch table
  // (/api/brains below) — system scope, because brains are stock and the roots are not.
  // The hotwords routes are KOE's, mounted through the ROUTES socket (koe/hotwords-api.ts).
  app.get('/api/project-roots', async (_req, res) => {
    try {
      res.json(await listProjectRoots());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /**
   * The Project Root tab's view: the catalog plus what is true right now — does the
   * directory still exist, is it a project_repo, how many sessions serve it.
   *
   * The live half is READ, never stored (docs/project-roots.md): a remote written into
   * the catalog is stale the day someone changes it. `untagged` is reported alongside,
   * because a session nobody tagged must be visible as untagged rather than bucketed.
   */
  app.get('/api/project-roots/detail', async (_req, res) => {
    try {
      const [roots, bySession] = await Promise.all([listProjectRoots(), projectRootsOfSessions()]);
      const facts = await Promise.all(roots.map((r) => repoFacts(r)));
      const counts: Record<string, number> = {};
      let untagged = 0;
      for (const root of Object.values(bySession)) {
        if (root) counts[root] = (counts[root] ?? 0) + 1;
        else untagged++;
      }
      res.json({
        roots: roots.map((r, i) => ({ ...r, facts: facts[i], sessions: counts[r.name] ?? 0 })),
        untagged,
      });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  // Include a directory — the whole point of the catalog. Arbitrary absolute paths at any
  // depth are first-class forever; Ronin does not manage the user's filesystem.
  app.post('/api/project-roots', async (req, res) => {
    const name = String(req.body?.name ?? '').trim().toLowerCase();
    if (!isValidRootName(name)) return res.status(400).json({ error: 'Handle: lowercase letters, digits, - and _.' });
    const fields = bodyFields(req.body);
    if (!fields.dir) return res.status(400).json({ error: 'A directory is required.' });
    try {
      if ((await listProjectRoots()).some((r) => r.name === name)) {
        return res.status(409).json({ error: `"${name}" is already in the catalog.` });
      }
      await upsertProjectRoot(name, fields);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  // Edit one block in place. Only the keys sent are touched.
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

  // Exclude a directory. The catalog entry goes; nothing on disk is touched.
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

  // The launch table itself: every `provider · model` a session can be born on,
  // in table order (first column = that provider's default). The launcher's model
  // picker lists these, so a model is a column in the markdown, never a code path.
  app.get('/api/brains', async (_req, res) => {
    try {
      res.json(await listBrains());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  // The other universal axis: session_job (what a session is for, and therefore who).
  // Same contract as /api/project-roots — the markdown IS the catalog.
  app.get('/api/session-jobs', async (_req, res) => {
    try {
      res.json(await listSessionJobs());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /**
   * SAVED LAUNCHES — the launcher form, filled in ahead of time and named. User scope
   * only: nothing ships, so an empty list is the ordinary state of a fresh install.
   */
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
    const fields: Partial<Record<LaunchField, string>> = {};
    for (const k of ['label', 'session_job', 'project_root', 'group', 'mode', 'prompt'] as LaunchField[]) {
      const v = (req.body as Record<string, unknown>)?.[k];
      if (typeof v === 'string') fields[k] = v.trim().slice(0, 500);
    }
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

  /**
   * "Add your own" — create the user's copy of a catalog if it is not there yet and
   * hand back the path. The path is the answer: the front door that actually gets used
   * is a person telling their own agent to edit that file (ATARASHI_SESSION §5), so the
   * button's job is to make the file exist and say where, not to be an editor.
   */
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
