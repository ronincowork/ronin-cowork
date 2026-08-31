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
import { listLexicons, resolveLexicon } from '../lexicons.js';
import { activeDeskProfileName, listDeskProfiles } from '../desk-profiles.js';
import { listSops } from '../sops.js';
import { listWays } from '../ways.js';
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
import { assertArrangementProfileCurrent, readArrangement, setArrangementProfile, validateArrangementProfile } from '../desks/arrangement.js';
import { readDesksSection } from '../user-config.js';
import {
  listSavedLaunches,
  saveLaunch,
  removeLaunch,
  seedUserCatalog,
  isShadowable,
  isValidLaunchName,
  savedLaunchFields,
} from '../catalog.js';
import {
  findDefinition,
  listRoleFamilies,
  listRoutines,
  listSessionRoles,
  listTemplates,
  writeRoleTasks,
} from '../definitions.js';
import { saveTemplate } from '../templates.js';
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
  /** Five-level session boot shelf. Leaf links are explicit inclusions; absolute paths
   * and symlinked directories never cross this typed read surface. */
  app.get('/api/session-readings', async (_req, res) => {
    try {
      res.json(await listSessionReadings());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /** Resolved ACTIONS.md entries. Readable instructions with entry-level provenance;
   * authoring remains the existing seed-and-agent handoff. */
  app.get('/api/actions', async (_req, res) => {
    try {
      res.json(await listActions());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /** Resolved SOP shelf: stock plus whole-file owner shadows, full text included so the
   * Customize read-only view can genuinely read the selected procedure. */
  app.get('/api/sops', async (_req, res) => {
    try {
      res.json(await listSops());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /** The ways shelf, for the loadout trays — labels and blurbs, never launch constants
   *  (a way is reading, not a session identity). Stock-only until a `ways` store is
   *  ruled into the registry. */
  app.get('/api/ways', async (_req, res) => {
    try {
      res.json(await listWays());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

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
  app.get('/api/project-roots', async (req, res) => {
    try {
      const resolve = await campaignResolver();
      // Same filter contract as /api/team-rosters: name none and you get every Campaign.
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
      // THE ARRANGEMENT, apart from the branch that happens to be mounted at the root:
      // reviewed or direct, managed desks or a shared checkout, read from the repo's
      // checked-in RONIN_REPO (absent = today's behaviour, reported as such — never
      // guessed from the branch). docs/control-surface.md § 5, "Project-root Admin".
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
        roots: roots.map((r, i) => ({ ...r, facts: facts[i], arrangement: arrangements[i], sessions: counts[r.name] ?? 0 })),
        untagged,
        new_project_desks: (await readDesksSection()).new_project,
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
      // A CANDIDATE, not a root: nothing has been included yet, so it belongs to no
      // Campaign. `repoFacts` reads the directory and never the Campaign.
      const facts = await repoFacts({ name: 'candidate', dir, remit: '', match: [], docs: [], plans: [], archived: false, campaign_id: '' });
      const arrangement = facts.repo ? await readArrangement('candidate', facts.dir).catch(() => null) : null;
      res.json({ ...facts, arrangement, new_project_desks: (await readDesksSection()).new_project });
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
      res.json({ ok: true, arrangement });
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

  // THE REPOSITORY PROFILE on the editor: after one explicit before/after confirmation,
  // rewrite RONIN_REPO directly. This is configuration, not a migration: no refs, desks,
  // running Agents or recovery state are changed here.
  app.put('/api/project-roots/:name/repo-profile', async (req, res) => {
    const { name } = req.params;
    if (!isValidRootName(name)) return res.status(400).json({ error: 'Invalid handle.' });
    if (req.body?.confirmed !== true) return res.status(400).json({ error: 'Confirm the exact repository profile before applying it.' });
    try {
      const root = (await listProjectRoots()).find((r) => r.name === name);
      if (!root) return res.status(404).json({ error: `"${name}" is not in the catalog.` });
      res.json({ ok: true, arrangement: await setArrangementProfile(root.dir, req.body?.profile, req.body?.before) });
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
   * THE DEFINITION CATALOGS — `role_family` (a New Session grouping of session_roles —
   * presentation, never a session fact), `session_role` (what a session is doing now),
   * Same contract
   * as /api/project-roots: the markdown IS the catalog, merged stock ⊕ user at request
   * time, provenance on every row.
   *
   * The family rows carry their own `session_roles:` — presented under that shelf with
   * the `default_lead_role` pinned first. A session_role in no family is LOOSE and the
   * board draws it in the tail: a real launch, not a leftover. Family is association,
   * so the same role may sit in several.
   */
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

  // Routine definitions are one shared catalog for every surface which offers
  // a way-of-working switch; consumers do not maintain private copies.
  app.get('/api/routines', async (_req, res) => {
    try {
      res.json(await listRoutines());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /**
   * THE TEMPLATE CATALOG (NEW_AGENT.md leg 6) — the tray both launch forms draw.
   * `?kind=` narrows to the boxes whose `kinds` include it; absent or `open` is the
   * whole shelf, because `open` means no requirement and screens nothing. The option
   * space is derived here and never stored as a menu (§ 7.1).
   */
  app.get('/api/templates', async (req, res) => {
    try {
      const kind = String(req.query?.kind ?? '').trim();
      const rows = await listTemplates();
      res.json(!kind || kind === 'open' ? rows : rows.filter((row) => row.kinds.includes(kind)));
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  // Save-as-new only — the forms' conditional save. A shipped template is edited on the
  // campaign page, never written over from a launch form (src/templates.ts refuses).
  app.post('/api/templates', async (req, res) => {
    try {
      res.json({ ok: true, template: await saveTemplate(req.body ?? {}) });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  /* THE DESK PROFILES (R38) — the list with `origin`, and which one settei holds as
   * active. One request at boot answers both, which is why `active` rides the list
   * rather than a second route. `active: ''` is the ordinary answer of every install
   * older than the catalog and means "as stock" everywhere. */
  app.get('/api/desk-profiles', async (_req, res) => {
    try {
      res.json({ active: await activeDeskProfileName(), profiles: await listDeskProfiles() });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /* THE LEXICONS — the list, and one resolved flat through its `base:` chain
   * (src/lexicons.ts). The client only ever asks for the flat one. */
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

  /**
   * SET A FAMILY'S SESSION_ROLES — the roles presented under it, and nothing else.
   *
   * Creating a family, deleting one, and authoring a session_role all belong to the next
   * build-out. This is the one board edit that already existed as a Job Group shelf and
   * had to keep working: drag a role onto a family, or toggle it in the ✎ editor.
   *
   * 400 for anything the write refuses, with the message written for the owner: an
   * unknown role, too many in one family, a definition that would not read back — or an
   * edit that would orphan the family's pinned `default_lead_role`.
   */
  app.put('/api/role-families/:name/session_roles', async (req, res) => {
    const list = req.body?.session_roles;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'Send { session_roles: [...] }.' });
    try {
      res.json({ ok: true, session_roles: await writeRoleTasks(req.params.name, list as string[]) });
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
    // The retired axis, refused by name: a form still asking with role_family is asking
    // a question the model no longer has (R35).
    if (req.query?.role_family !== undefined) {
      return res.status(400).json({
        error: 'role_family is retired (R35, 2026-08-23) — a launch profile is resolved from the session_role alone.',
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
    const fields = savedLaunchFields(req.body);
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
