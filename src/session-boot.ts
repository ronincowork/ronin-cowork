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
 * THREE LEVELS, from the two axes a session already knows about itself:
 *
 *   all/                every session, always
 *   root/<project_root>/  only sessions working in that directory
 *   job/<session_job>/    only sessions doing that kind of work
 *
 * They are ADDITIVE, not a hierarchy — a CutCode session in ronin_cowork reads all three,
 * and nothing overrides anything. `where` and `what for` are independent: the same
 * bug-chasing habits apply in every repo, and the same repo notes apply to every job.
 *
 * ONE ASYMMETRY: stock may ship `job/` folders but never `root/` ones. The jobs are
 * shipped, so we know their names; a project_root is the owner's alone and no install can
 * know it in advance.
 *
 * SHADOWING is by filename within a level: your `all/SHELVES.md` replaces ours whole.
 * Across levels there is no shadowing, because they are answering different questions.
 */
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storeDir } from './stores.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Stock: inside the install, beside ronin_sops/ and ronin_library/. */
const STOCK = path.join(__dirname, '..', 'ronin_session_boot');

/** The three levels, in reading order. `root` and `job` take the session's own value. */
export type Level = 'all' | 'root' | 'job';

const userShelf = () => storeDir('session_boot');

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
 * What this session should read, in reading order: `all`, then its root's, then its job's,
 * stock before the owner's at each level.
 *
 * Deduplicated BY FILENAME, last writer winning, which is what makes the shadow work: your
 * `all/SHELVES.md` displaces ours because yours is read second. Across levels the same
 * name would also collapse — deliberate, and the reason a file meant for one root should
 * not be given a name that stock already uses.
 */
export async function bootFiles(projectRoot: string, sessionJob: string): Promise<string[]> {
  const user = userShelf();
  const dirs: string[] = [path.join(STOCK, 'all'), path.join(user, 'all')];
  // Stock cannot have a root/ — it does not know the owner's directories.
  if (projectRoot) dirs.push(path.join(user, 'root', projectRoot));
  if (sessionJob) dirs.push(path.join(STOCK, 'job', sessionJob), path.join(user, 'job', sessionJob));

  const byName = new Map<string, string>();
  for (const dir of dirs) for (const f of await filesIn(dir)) byName.set(path.basename(f), f);
  return [...byName.values()];
}
