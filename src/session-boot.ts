/**
 * THE SESSION BOOT SHELF — what a new session reads before anything else.
 *
 * Named for booting a SESSION, never the application: nothing here runs when Ronin
 * starts. It is read once, when a session is born.
 *
 * WHY IT EXISTS. A project_root used to carry `read:` — a comma-separated list of literal
 * file paths, pasted into every brief for that root. Four things were wrong with it and
 * only the first is obvious:
 *
 *   - a path goes stale silently. Delete the file and every future session in that root
 *     is told to read something that is not there, and nothing says so;
 *   - it lives in a catalog, so changing what a session reads means editing a catalog
 *     line rather than putting a file somewhere;
 *   - there was exactly one level. Nothing could apply to EVERY session, or to every
 *     session doing a particular kind of work;
 *   - and the user had nowhere of their own to add to it.
 *
 * A shelf answers all four, and it does it by holding files rather than names of files.
 * Nothing is written down, so nothing can go stale: the brief is a directory listing
 * taken at the moment of the launch.
 *
 * TWO HALVES, the same split `ronin_sops` and `ronin_library` already use:
 *
 *   ronin_session_boot/       STOCK, inside the install. Ships, and an upgrade replaces
 *                             it wholesale. Near-empty on purpose.
 *   <session_boot store>/     YOURS, outside every repo. Survives upgrade AND uninstall.
 *
 * FOUR LEVELS — three from the axes a session already knows about itself, and one from
 * the launch's own MCP choice (owner's ruling, 2026-08-17):
 *
 *   all/                  every session, always
 *   <service>_connected/  only sessions launched with MCP on — how a connected session
 *                         learns what it is connected to. Cowork ships NO such folder
 *                         and matches the pattern only: a connected service makes and
 *                         seeds its own (gbrain's setup makes gbrain_connected/), so
 *                         the level is signed by its service (owner's ruling,
 *                         2026-08-20) and the free build never names a vendor
 *   root/<project_root>/  only sessions working in that directory
 *   job/<session_job>/    only sessions doing that kind of work
 *
 * They are ADDITIVE, not a hierarchy — a CutCode session in ronin_cowork reads all of its
 * levels, and nothing overrides anything. `where` and `what for` are independent: the same
 * bug-chasing habits apply in every repo, and the same repo notes apply to every job.
 *
 * ONE ASYMMETRY: stock may ship `job/` folders but never `root/` ones. The jobs are
 * shipped, so we know their names; a project_root is the owner's alone and no install can
 * know it in advance.
 *
 * SHADOWING is by filename within a level: your `all/SHELVES.md` replaces ours whole.
 * Across levels there is no shadowing, because they are answering different questions.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storeDir } from './stores.js';
import { listMacros } from './macros.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Stock: inside the install, beside ronin_sops/ and ronin_library/. */
const STOCK = path.join(__dirname, '..', 'ronin_session_boot');
const SESSION_MACROS_TEMPLATE = path.join(STOCK, 'SESSION_MACROS.md');

/** The three levels, in reading order. `root` and `job` take the session's own value. */
export type Level = 'all' | 'root' | 'job';

const userShelf = () => storeDir('session_boot');

/**
 * The tile and the birth reading have ONE answer for which session macros are active:
 * listMacros(), including the owner's catalog shadow, filtered by `preview: yes`.
 *
 * The prose around the list is hand-authored because it teaches the routing rule. The list
 * itself is generated on every assisted launch into Ronin's disposable data root. A checked-in
 * list would describe the stock catalog, not the active one, the moment the owner customized it.
 */
async function sessionMacrosReading(): Promise<string> {
  const [template, active] = await Promise.all([
    readFile(SESSION_MACROS_TEMPLATE, 'utf8'),
    listMacros().then((macros) => macros.filter((macro) => macro.preview)),
  ]);
  const rendered = active.length
    ? active
        .map((macro) => `- \`+${macro.name}:\` — **${macro.label}**. ${macro.blurb}`)
        .join('\n')
    : '- No session macros are currently previewed on the tile button.';
  const start = '<!-- ACTIVE_SESSION_MACROS:START -->';
  const end = '<!-- ACTIVE_SESSION_MACROS:END -->';
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!pattern.test(template)) throw new Error('SESSION_MACROS.md has no generated-section markers.');

  const dir = storeDir('session_boot_cache');
  const target = path.join(dir, 'SESSION_MACROS.md');
  // Several sessions may be born together. A shared `.tmp` name lets one rename the
  // other's file out from under it; unique writers may safely race, with the last complete
  // catalog snapshot becoming the cache.
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dir, { recursive: true });
  await writeFile(temp, template.replace(pattern, `${start}\n${rendered}\n${end}`));
  await rename(temp, target);
  return target;
}

/**
 * Make the shelf so it can be found. A READ-ONLY shelf is never created by the ordinary
 * rule — every other user store springs into existence when something first writes to it,
 * and nothing ever writes here. Left to that rule the directory would simply never exist,
 * and an empty shelf you cannot find is a shelf nobody uses.
 *
 * So it is made the first time Ronin looks at it: an idempotent mkdir on the read path,
 * which is a side effect bought deliberately in exchange for the feature being visible the
 * moment it ships. Failure is swallowed — a session must never fail to launch because a
 * directory could not be made.
 */
export async function ensureShelf(roots: string[] = []): Promise<void> {
  const base = userShelf();
  // No connected level is pre-made: a `<service>_connected/` folder is the seeding
  // service's own act, and an empty one nothing seeded would be a claim about a
  // connection that does not exist.
  const dirs = [
    path.join(base, 'all'),
    path.join(base, 'root'),
    path.join(base, 'job'),
    ...roots.map((r) => path.join(base, 'root', r)),
  ];
  await Promise.all(dirs.map((d) => mkdir(d, { recursive: true }).catch(() => {})));
}

/**
 * Every readable file in one directory, sorted, or nothing at all if it is not there.
 *
 * README.md is NOT excluded, and that took a bug to settle: a doc genuinely called
 * README.md is ordinary content — the first thing you would put on a root's shelf — and
 * skipping it silently dropped one. A shelf's own explainer instead lives at the SHELF
 * ROOT, one level above `all/`, `root/` and `job/`, where nothing ever scans.
 */
async function filesIn(dir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return []; // absent is the ordinary state, never an error
  }
  const out: string[] = [];
  for (const name of names.sort()) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    try {
      // stat, not lstat: a symlink into a repo is the NORMAL case here — it is how a doc
      // that already lives somewhere gets on the shelf without being copied and without
      // drifting from the original. A link whose target has gone simply does not appear.
      if ((await stat(full)).isFile()) out.push(full);
    } catch {
      /* dangling link, or vanished mid-read */
    }
  }
  return out;
}

/**
 * The connected levels on one shelf half: every `<service>_connected/` directory,
 * sorted. Cowork ships none — a connected service seeds its own (gbrain's setup makes
 * `gbrain_connected/`), which is how the level says WHOSE reading it is while the free
 * build never names a vendor.
 */
async function connectedLevels(base: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(base);
  } catch {
    return []; // absent is the ordinary state, never an error
  }
  const out: string[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith('_connected') || name.startsWith('.')) continue;
    const full = path.join(base, name);
    try {
      if ((await stat(full)).isDirectory()) out.push(full);
    } catch {
      /* vanished mid-read */
    }
  }
  return out;
}

/**
 * What this session should read, in reading order: `all`, then its root's, then its job's,
 * stock before the owner's at each level.
 *
 * Deduplicated BY FILENAME, last writer winning, which is what makes the shadow work: your
 * `all/SHELVES.md` displaces ours because yours is read second. Across levels the same
 * name would also collapse — deliberate, and the reason a file meant for one root should
 * not be given a name that stock already uses.
 */
export async function bootFiles(projectRoot: string, sessionJob: string, mcpOn = true): Promise<string[]> {
  const user = userShelf();
  const dirs: string[] = [path.join(STOCK, 'all'), path.join(user, 'all')];
  // The connected shelves ride the launch's own MCP choice: off means no tools AND no
  // reading list about them — the same decision, honored in both places.
  if (mcpOn) dirs.push(...(await connectedLevels(STOCK)), ...(await connectedLevels(user)));
  // Stock cannot have a root/ — it does not know the owner's directories.
  if (projectRoot) dirs.push(path.join(user, 'root', projectRoot));
  if (sessionJob) dirs.push(path.join(STOCK, 'job', sessionJob), path.join(user, 'job', sessionJob));

  const byName = new Map<string, string>();
  for (const dir of dirs) for (const f of await filesIn(dir)) byName.set(path.basename(f), f);
  // Generated last, so the live catalog's macro reading is always the file handed over.
  byName.set('SESSION_MACROS.md', await sessionMacrosReading());
  return [...byName.values()];
}
