/**
 * byoin_user_check — the third-party user's test, inside BYOIN's machine half.
 *
 * `byoin_check`s ask whether OUR tree is honest with itself; this asks whether YOUR
 * customization of this install still surfaces. The readers drop what they cannot use
 * by design — a session task with no `opening:` simply vanishes from the launcher —
 * and for the shipped catalogs check-catalogs turns that silence into a failure. For
 * the USER stores nothing did, and hand-editing them is the encouraged front door. So
 * this check runs the same parsing the server uses over the stores that are yours, and
 * every silent drop becomes a named finding with its remedy. The failure text is the
 * guidance: it tells you what the machinery needed, not just that something is wrong.
 *
 * Never in the verify chain and never in CI: a runner has no user stores. BYOIN runs
 * it beside ronin-doctor, and `docs/test-protocols.md` is the page that says when to
 * run BYOIN. Empty or absent stores are a clean pass — a fresh box is not a finding.
 *
 * THE RETIRED-CUSTOMIZATION CHECK IS THE POINT OF THIS FILE, NOT AN EXTRA. The role/task
 * split moved the readers to src/definitions.ts and deleted the old ones outright — no
 * alias, no dual-read, by the cutover rule. So an owner who wrote a `SESSION_JOBS.md`, a
 * `JOB_CLASSES.md`, or a `job/<name>/` boot shelf still HAS those files and nothing reads
 * them any more. That is the exact silence this check exists to break: their work did not
 * fail, it went dark, and only a named finding tells them where to move it.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../src/stores.js';
import { splitSections, entryValue } from '../src/catalog.js';

let findings = 0;
let looked = 0;
const find = (msg: string, remedy: string) => {
  console.error(`  FIND  ${msg}`);
  console.error(`        remedy: ${remedy}`);
  findings++;
};
const note = (msg: string) => console.log(`  note  ${msg}`);

const exists = async (p: string) => !!(await stat(p).catch(() => null));
const mdFiles = async (dir: string): Promise<string[]> =>
  (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.md'));

/** Probe a reader module without a compile-time dependency on it. */
async function probe(rel: string): Promise<Record<string, unknown> | null> {
  try {
    return (await import(rel)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* ---- 1 · catalog shadows: every entry you wrote must surface or be a deliberate hide ---- */

// Per-file required fields, mirroring what each reader drops entries over. A file not
// named here gets the generic parse check only.
const REQUIRED: Record<string, { keys: string[]; unless?: (e: { get: (k: string) => string }) => boolean }> = {
  'MACROS.md': { keys: ['label', 'blurb'] },
};

/**
 * User-store files the cut RETIRED. Nothing reads these; the owner's content is intact and
 * unreachable. Each names what replaced it, because "this is dead" without "put it here"
 * is only half a remedy.
 */
const RETIRED: Record<string, { was: string; now: string }> = {
  'SESSION_JOBS.md': {
    was: 'the combined session_job catalog',
    now: 'one file per task in session_tasks/<name>.md — see ronin_catalogs/session_tasks/README.md',
  },
  'JOB_CLASSES.md': {
    was: 'the Job Group manifest',
    now: 'one file per role in family_roles/<name>.md, each carrying its own `session_tasks:` — see ronin_catalogs/family_roles/README.md',
  },
};

async function checkCatalogFile(dir: string, file: string, label: string): Promise<void> {
  looked++;
  const raw = await readFile(path.join(dir, file), 'utf8');
  const sections = splitSections(raw, 'user').filter((s) => s.head === s.name);
  const body = raw.replace(/^#.*$/gm, '').replace(/^>.*$/gm, '').trim();
  if (!sections.length) {
    if (body)
      find(
        `${label}: no \`## <name>\` entries parse from this file, but it is not empty`,
        `an entry is a \`## name\` heading with \`- **key:** value\` lines under it — see the shipped ronin_catalogs/${file.includes('/') ? file : file} for the format`,
      );
    return;
  }
  const req = REQUIRED[file];
  for (const s of sections) {
    const get = (k: string) => entryValue(s.lines, k);
    if (entryValue(s.lines, 'hidden').toLowerCase() === 'yes') continue; // a deliberate hide
    if (!req) continue;
    if (req.unless?.({ get })) continue;
    for (const k of req.keys) {
      if (!get(k))
        find(
          `${label}: your entry "${s.name}" has no \`${k}:\` line, so the reader DROPS it — it will not appear on any surface`,
          `add \`- **${k}:** …\` (the shipped ronin_catalogs/${file} shows every field), or \`- **hidden:** yes\` if hiding it was the intent`,
        );
    }
  }
}

/* ---- 2 · the task/role readers: does what you wrote actually come out? ---- */

async function checkDefinitionsSurface(catalogsDir: string): Promise<void> {
  const defs = await probe('../src/definitions.js');
  if (defs && typeof defs.listSessionTasks === 'function') {
    // session_tasks/ and family_roles/ are directories of one file per definition, in the
    // repo and in your store alike.
    for (const kind of ['session_tasks', 'family_roles'] as const) {
      const dir = path.join(catalogsDir, kind);
      if (!(await exists(dir))) continue;
      const listed = (await (kind === 'session_tasks'
        ? (defs.listSessionTasks as () => Promise<{ name: string }[]>)()
        : (defs.listFamilyRoles as () => Promise<{ name: string }[]>)()
      ).catch(() => [] as { name: string }[])).map((r) => r.name.toLowerCase());
      for (const f of await mdFiles(dir)) {
        if (f.toLowerCase() === 'readme.md') continue;
        looked++;
        const name = f.replace(/\.md$/, '');
        if (!listed.includes(name.toLowerCase()))
          find(
            `${kind}/${f} (yours): "${name}" does not surface from the ${kind} reader — half-written, or dropped by a filter`,
            `read ronin_catalogs/${kind}/README.md for the required fields, or delete the file if it is abandoned`,
          );
      }
    }
  }
}

/* ---- 2b · what the cut retired: your files are still there, and nothing reads them ---- */

async function checkRetired(catalogsDir: string): Promise<void> {
  for (const [file, { was, now }] of Object.entries(RETIRED)) {
    if (!(await exists(path.join(catalogsDir, file)))) continue;
    looked++;
    find(
      `${file} (yours): RETIRED — this was ${was}, and no reader has looked at it since the family_role/session_task split. Your entries are intact and unreachable`,
      `move each entry to ${now}, then delete the old file. Nothing converts it for you: the cut ships no compatibility reader on purpose`,
    );
  }

  // The boot shelf's old level. `ensureShelf` now makes role/ and task/, so a leftover
  // job/ sits beside them looking live.
  const jobShelf = path.join(storeDir('session_boot'), 'job');
  const shelves = (await readdir(jobShelf, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory());
  if (shelves.length) {
    looked++;
    find(
      `session_boot store: job/ is RETIRED and still holds ${shelves.length} shelf(s) — ${shelves
        .map((e) => e.name)
        .join(', ')}. No session has been given this reading since the split`,
      `a shelf named for work moves to task/<session_task>/; one named for who the session IS moves to role/<family_role>/. Both levels already exist beside it, and they ADD UP rather than override — then delete job/`,
    );
  }
}

/* ---- 3 · sops / library / session_boot shadows: readable, and not empty ---- */

async function checkShadowStore(id: string, stockDir: string): Promise<void> {
  const dir = storeDir(id);
  if (!(await exists(dir))) return;
  const walk = async (d: string, rel = ''): Promise<void> => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(d, e.name), r);
      else if (e.name.endsWith('.md')) {
        looked++;
        const p = path.join(d, e.name);
        const body = (await readFile(p, 'utf8').catch(() => '')).trim();
        if (!body)
          find(
            `${id} store: ${r} is empty — it shadows (or adds to) ${stockDir}/ but says nothing`,
            `write the content, or delete the file; an empty shadow replaces a shipped page with silence`,
          );
      }
    }
  };
  await walk(dir);
}

/* ---- run ---- */

const catalogsDir = storeDir('catalogs');
if (await exists(catalogsDir)) {
  for (const f of await mdFiles(catalogsDir)) {
    if (f in RETIRED) continue; // reported by checkRetired; validating it against a dead reader would mislead
    await checkCatalogFile(catalogsDir, f, `${f} (yours)`);
  }
  await checkDefinitionsSurface(catalogsDir);
}
await checkRetired(catalogsDir);
await checkShadowStore('sops', 'ronin_sops');
await checkShadowStore('library', 'ronin_library');
await checkShadowStore('session_boot', 'ronin_session_boot');

if (!looked) {
  console.log('  ok    byoin_user_check — no user customization on this box yet (nothing to check is a clean pass)');
} else if (!findings) {
  console.log(`  ok    byoin_user_check — ${looked} customization file(s)/entr(ies) looked at, all surface`);
}
process.exit(findings ? 1 : 0);
