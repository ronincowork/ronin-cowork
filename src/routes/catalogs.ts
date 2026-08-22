/**
 * CATALOG ROUTES — the markdown-backed lists the commons reads and edits: macros,
 * hotwords, project roots, session_launch_specs, session jobs. Catalogs are parsed at request time
 * (ronin_catalogs/ for stock, the catalogs store for the user's own), so the UI always
 * matches the doc. See docs/project-roots.md.
 */
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import type express from 'express';
import { projectRootsOfSessions } from '../tmux.js';
import { listMacros } from '../macros.js';
import { listSkins } from '../skins.js';
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
import {
  listSavedLaunches,
  saveLaunch,
  removeLaunch,
  seedUserCatalog,
  isShadowable,
  isValidLaunchName,
  type LaunchField,
} from '../catalog.js';
import { findDefinition, listFamilyRoles, listSessionTasks, writeRoleTasks } from '../definitions.js';
import { resolveLaunchProfile } from '../launch-profile.js';

// fs errors carry absolute paths (`ENOENT: open '/home/…'`); the browser gets the
// fault, never the box's layout.
const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replaceAll(homedir(), '~');

/** The fields commons may write. Anything else in a block is the owner's and is preserved. */
// provider/model retired 2026-08-18 — a body carrying them has nowhere to land.
const ROOT_FIELDS: RootField[] = ['dir', 'memory', 'match', 'remit'];
const bodyFields = (body: unknown) => {
  const out: Partial<Record<RootField, string>> = {};
  for (const k of ROOT_FIELDS) {
    const v = (body as Record<string, unknown>)?.[k];
    if (typeof v === 'string') out[k] = v.trim().slice(0, 500);
  }
  // `archived` is ONE BIT, so it is normalised here and never taken as prose: true
  // writes `- **archived:** yes`, false takes the line back out (an empty value is how
  // upsertProjectRoot deletes a key). A body that says nothing about it leaves it alone,
  // which is what lets the edit form keep sending only the four text fields.
  const arch = (body as Record<string, unknown>)?.archived;
  if (arch !== undefined) out.archived = arch === true || arch === 'yes' ? 'yes' : '';
  return out;
};

export function registerCatalogs(app: express.Express): void {
  /* THE LOOK, as entries. A skin is a set of design tokens and nothing else — no selector,
   * no rule — so this route serves data the client sets as custom properties and could not
   * turn into markup if it tried (src/skins.ts). Shadowable like any catalog: shipped
   * skins update with the repo, a skin of yours is yours and an upgrade cannot touch it. */
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

  // The project_root list: parsed live from the USER catalog (catalogs store, PROJECT_ROOTS.md)
  // so the launcher always matches the doc — where to work, what to read first, which session_launch_spec.
  // Same contract as /api/macros. No user file yet = an empty list, not an error: that is a
  // fresh install. The session_launch_spec each root resolves to comes from the SHIPPED launch table
  // (/api/session-launch-specs below) — system scope, because they are stock and the roots are not.
  // The hotwords routes are KOE's, mounted through the ROUTES socket (koe/hotwords-api.ts).
  //
  // ARCHIVED ROOTS ARE NOT HERE. This is the list the launcher's ▣ picker is built
  // from, and the whole of what archiving does is drop out of it — a root you have
  // finished with should not sit at the top of the form acting like a default. It is a
  // FILTER ON ONE LIST, never a deletion: /api/project-roots/detail still carries it,
  // and every path that resolves a root BY NAME (spawn, saved launches, the tag on a
  // running session) reads listProjectRoots() whole, so nothing that used to launch stops.
  app.get('/api/project-roots', async (_req, res) => {
    try {
      res.json((await listProjectRoots()).filter((r) => !r.archived));
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
   *
   * ARCHIVED ROOTS ARE HERE, flagged. This pane is where they still exist — seeing one,
   * and putting it back, is the other half of what archiving means.
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

  /** cowork_setup asks about a directory before it becomes a root. This is a live,
   * read-only fact check; existence and Git identity are never stored as answers. */
  app.get('/api/project-roots/inspect', async (req, res) => {
    const dir = String(req.query.dir ?? '').trim();
    if (!dir) return res.status(400).json({ error: 'A directory is required.' });
    try {
      res.json(await repoFacts({ name: 'candidate', dir, remit: '', match: [], archived: false }));
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  // The folder field's selection half: real subdirectories matching what is typed so
  // far, for a datalist. Local operator, owner's own disk — same trust as inspect.
  app.get('/api/project-roots/suggest', async (req, res) => {
    try {
      res.json({ dirs: await suggestDirs(String(req.query.prefix ?? '')) });
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
  app.get('/api/session-launch-specs', async (_req, res) => {
    try {
      res.json(await listSessionLaunchSpecs());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  // Which supported agent CLIs are present on THIS machine — the fact that decides whether
  // Setup asks "use it?" or "install it?" of each one. Installed or not, and nothing about
  // whether it is signed in: the owner's accounts are not ours to inspect. `src/agents.ts`
  // carries why the probe has to be a login shell and not this process's PATH.
  app.get('/api/agents', async (_req, res) => {
    try {
      res.json(await listAgentAvailability());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /**
   * THE INSTALL OPERATION — the one door that executes the mechanical half of needed[].
   *
   * Beside the probe on purpose: the probe is what decides whether a row asks "use it?"
   * or "install it?", and this is the answer to the second question. It is an OPERATION,
   * not a service and not a surface — the setup page calls it at Save and ⚙ calls it any
   * day after, and there is no third path, because a second one is a defect.
   *
   * The body is `{ items: [{ kind, name }] }` — the registry's own vocabulary, so the day
   * a second kind becomes mechanical no caller changes. It answers with what it STARTED,
   * never with what it achieved: the reply names a session per item, and whether the thing
   * is installed is `GET /api/agents`'s to say, later. Nothing here waits for a runner and
   * nothing here writes a record.
   *
   * 200 even when every item is refused. A refusal is an answer, it is per item, and the
   * caller has to read the list either way (src/agent-install.ts).
   */
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

  /**
   * THE OTHER TWO AXES — `family_role` (who a session is) and `session_task` (what it is
   * doing now). Same contract as /api/project-roots: the markdown IS the catalog, merged
   * stock ⊕ user at request time, provenance on every row.
   *
   * The role rows carry their own `session_tasks:` — the session_tasks presented under
   * that role, which is what the board's sections are built from. A task in no role's
   * family is a LOOSE task and the board draws it in the blank-role tail: a real launch,
   * not a leftover. Family is association, so the same task may sit in several.
   */
  app.get('/api/family-roles', async (_req, res) => {
    try {
      res.json(await listFamilyRoles());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/session-tasks', async (_req, res) => {
    try {
      res.json(await listSessionTasks());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /**
   * SET A ROLE'S TASK FAMILY — the tasks presented under it, and nothing else.
   *
   * Creating a role, deleting one, and authoring a task all belong to the next build-out.
   * This is the one board edit that already existed as a Job Group shelf and had to keep
   * working: drag a task onto a role, or toggle it in the ✎ editor.
   *
   * 400 for anything the write refuses, with the message written for the owner: an
   * unknown task, too many in one family, or a definition that would not read back.
   */
  app.put('/api/family-roles/:name/session_tasks', async (req, res) => {
    const list = req.body?.session_tasks;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'Send { session_tasks: [...] }.' });
    try {
      res.json({ ok: true, session_tasks: await writeRoleTasks(req.params.name, list as string[]) });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  /**
   * THE RESOLVED PROFILE for one (role, task) pair — what the ＋ New form asks for when
   * the pick changes, so the client never re-implements the cascade.
   *
   * It has to be a PAIR and not a row: `mcpAlways` is true for `personalassistant` with a
   * blank task and false for `developer` with `CutCode`, so no per-row field could answer
   * it. Either half may be blank; both blank is a legal question with a system-default
   * answer, which is exactly what the form needs before anything is picked.
   *
   * 400 on a refusal, with the cascade's own message — a locked `mcp:` contradicted, an
   * agentless launch handed agent fields, an illegal `dir:`. The form shows it at pick
   * time rather than at launch time, which is where the owner can still do something
   * about it.
   */
  app.get('/api/launch-profile', async (req, res) => {
    const role = String(req.query?.family_role ?? '').trim();
    const task = String(req.query?.session_task ?? '').trim();
    try {
      const [roleDef, taskDef] = await Promise.all([
        findDefinition('family_roles', role),
        findDefinition('session_tasks', task),
      ]);
      if (role && !roleDef) return res.status(404).json({ error: `Unknown family_role "${role}".` });
      if (task && !taskDef) return res.status(404).json({ error: `Unknown session_task "${task}".` });
      res.json(resolveLaunchProfile(roleDef, taskDef));
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
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
    for (const k of ['label', 'family_role', 'session_task', 'project_root', 'team', 'mode', 'prompt'] as LaunchField[]) {
      const v = (req.body as Record<string, unknown>)?.[k];
      if (typeof v === 'string') fields[k] = v.trim().slice(0, 500);
    }
    // `group` is the retired spelling of the team field — read from an old caller,
    // never written back: the saved block says `team:` either way.
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
