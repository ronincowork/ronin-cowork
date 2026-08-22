import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { storeDir } from './stores.js';

const execFileP = promisify(execFile);

/* ---------------------------------------------------------------------------
 * TWO FILES, TWO SCOPES — and the split is the point (DAIKUSAN.md, the test:
 * "if Ronin is upgraded, is this file replaced?").
 *
 *   SYSTEM — ronin_catalogs/PROJECT_ROOTS.md, inside the install. Holds the
 *   provider·model LAUNCH TABLE only: every install needs session_launch_specs, and the table is
 *   stock. Replaced wholesale by an upgrade, which is exactly right for it. It ships
 *   with NO roots — there is no such thing as a stock project root.
 *
 *   USER — <catalogs store>/PROJECT_ROOTS.md, outside every repo. Holds the owner's
 *   own directories. It must SURVIVE an upgrade, so it can never live in the install.
 *   Not shipped, not in git, not made by setup: created by this file the first time
 *   something is written to it, like every other directory Ronin owns.
 *
 * A missing or empty user file is the ORDINARY path, not an error. A fresh install has
 * no roots at all and must boot, serve and render an empty ▣ Project root tab.
 * ------------------------------------------------------------------------- */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** System scope: the shipped catalog. The launch table is read from here, and only here. */
const LAUNCH_TABLE_MD = path.join(__dirname, '..', 'ronin_catalogs', 'PROJECT_ROOTS.md');

/** User scope: Ronin's own directory, outside every repo. Survives upgrade and uninstall. */
export const USER_CATALOGS_DIR = storeDir('catalogs');
/** User scope: the owner's project list. Read where it may be absent, written where it is created. */
export const USER_PROJECT_ROOTS_MD = path.join(USER_CATALOGS_DIR, 'PROJECT_ROOTS.md');

/** The user's list, or '' when there is not one yet. Absence is a fresh install, never a fault. */
async function readUserRoots(): Promise<string> {
  try {
    return await readFile(USER_PROJECT_ROOTS_MD, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return '';
    throw e;
  }
}

/** NO provider/model/cmd, and their absence is the ruling (owner, 2026-08-18): a root
 * never chooses a model — sessions have ONE default, `agents.sessions.default`, and
 * the launch form may override per session. Old user files still carrying
 * `- **provider:**` / `- **model:**` lines parse fine: unknown field lines are simply
 * not read, and the write path preserves them byte-for-byte (upsert touches only the
 * keys it is sent). Tolerated, never honored, never written back. */
export interface ProjectRootInfo {
  name: string;
  /** Working directory, ~ already expanded. */
  dir: string;
  match: string[];
  remit: string;
  /**
   * ARCHIVED — off the new-session picker, still on the admin desk.
   *
   * A root the owner has finished with is not a root they want to lose: the directory is
   * still there, sessions still carry its name, and the block still records what it was
   * for. Excluding it would take all of that with it, so the two acts are separate —
   * `archived` is the quiet one, and `exclude` stays the loud one.
   *
   * It is one bit and it hides the root in exactly one place: the list the launcher's
   * ▣ picker is built from (`GET /api/project-roots`). Everything that resolves a root
   * BY NAME — a spawn, a saved launch, a session already running under it — keeps
   * working, because a name that used to launch must never stop meaning what it meant.
   */
  archived: boolean;
}

/** Every launchable `provider · model` the table knows, in table order. */
export interface SessionLaunchSpec {
  provider: string;
  model: string;
  cmd: string;
  /**
   * The provider's own "launch with no MCP servers" flags — appended to `cmd` when a
   * launch asks for MCP off (`- **mcp_off:** \`…\`` in the provider's section). DATA,
   * like the cmd itself: cowork knows no CLI's flags and no MCP server's name; a
   * provider that declares none simply cannot launch with MCP off, and the spawn
   * refuses rather than silently launching connected.
   */
  mcpOff?: string;
}

const expand = (p: string) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

/**
 * The owner's roots, parsed at request time from the catalogs store —
 * the doc IS the catalog (same contract as listMacros). A project_root is a `## name`
 * heading with `- **key:** value` lines. The session_launch_spec comes from the SHIPPED launch table,
 * which is a different file in a different scope: adding a provider stays a row and
 * adding a model a column — never a code path. That is the whole of vendor neutrality.
 *
 * No user file = no roots. Empty list, no throw: that is a fresh install, and the tab
 * renders it as "none yet" rather than an error.
 *
 * `project_root` is the REQUIRED one of the three universal axes — with `family_role` (who
 * the session is) and `session_task` (what it is doing now), in src/definitions.ts. The
 * same keys scope a memory.
 */
export async function listProjectRoots(): Promise<ProjectRootInfo[]> {
  await ensureFirstRoot();
  return parseRoots(await readUserRoots());
}

/* ---------------------------------------------------------------------------
 * THE FLOOR — a fresh box gets one project_root, because zero does not work.
 *
 * This file used to ship deliberately empty of roots, and the reasoning was half right:
 * an upgrade replaces the STOCK catalog, so a root written there would vanish under the
 * owner. That argues for WHERE the file lives — user scope, outside every repo — and not
 * for it being empty the first time they look at it.
 *
 * Empty was not merely a blank list. With no root, three things went wrong at once, and
 * none of them was a decision anyone made:
 *
 *   spawn.ts   dir: kindDir(kind) || root?.dir || ''    -> empty
 *   tmux.ts    if (cwd) args.push('-c', cwd)            -> no -c at all, so the first
 *                                                          session starts wherever the
 *                                                          tmux server happens to sit
 *   spawn.ts   cmd: form.cmd || defaultCmd || 'claude' -> a bare string matching no
 *                                                          launch-table row, so MCP-off
 *                                                          refuses it (mcp_off is matched
 *                                                          by the cmd string)
 *
 * So the floor is `home`: the owner's own directory. It always exists, it is
 * definitionally theirs, and it is definitionally not the install tree — a floor, not a
 * guess about what they work on, which is why it does not breach the rule against
 * speculatively including someone's directories. They rename it, repoint it, or add
 * beside it the moment they know better.
 *
 * Seeded on first READ, not at boot: this is the module that owns the knowledge, it needs
 * no hook in a file other sessions are editing, and it heals a box whose catalog was
 * deleted. Absence of the FILE is the trigger — an owner who emptied their own catalog of
 * roots keeps it empty, because the file is still there.
 * ------------------------------------------------------------------------- */

/** Once per process. A failed seed is not retried in a loop; the next start tries again. */
let flooring: Promise<void> | null = null;

async function ensureFirstRoot(): Promise<void> {
  flooring ??= (async () => {
    try {
      await stat(USER_PROJECT_ROOTS_MD);
      return; // the owner has a catalog; it is theirs, empty of roots or not
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') return;
    }
    try {
      // The floor names no model — nothing does, per the one-default ruling.
      await upsertProjectRoot('home', {
        dir: os.homedir(),
        remit: 'Your home directory — where Ronin starts until you name a project of your own.',
      });
    } catch {
      // A box that cannot write its own catalog still serves: the roster shows no roots
      // and says so. The floor must never take the page down with it.
    }
  })();
  return flooring;
}

/** The parse itself, over text rather than the file — so a WRITE can re-read its own
 * result before committing it (see writeCatalog). Only the fields named below are
 * read; any other `- **key:** value` line — including the retired provider/model
 * lines old user files still carry — is ignored here and preserved on write. */
function parseRoots(raw: string): ProjectRootInfo[] {
  const roots: ProjectRootInfo[] = [];
  for (const chunk of raw.split(/^## +/m).slice(1)) {
    const lines = chunk.split('\n');
    const name = (lines[0] ?? '').trim();
    // The table lives under its own ## heading — it is not a role.
    if (!name || name.includes(' ')) continue;
    const field = (key: string) =>
      (lines.find((l) => new RegExp(`^-\\s*\\*\\*${key}:\\*\\*`, 'i').test(l.trim())) ?? '')
        .replace(new RegExp(`^\\s*-\\s*\\*\\*${key}:\\*\\*\\s*`, 'i'), '')
        .trim();
    const dir = field('dir');
    if (!dir) continue; // a project_root without a directory is not launchable
    roots.push({
      name,
      dir: expand(dir),
      match: field('match')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
      remit: field('remit'),
      // One bit, spelled the way the other catalogs spell theirs (`- **hidden:** yes`
      // in src/catalog.ts). Anything but `yes` — including the line's absence, which is
      // the ordinary case — leaves the root on the picker.
      archived: /^yes$/i.test(field('archived')),
    });
  }
  return roots;
}

/**
 * The launch table: `| provider | opus | sonnet | haiku |` with one row per
 * provider and one column per model. The HEADING ROW names the models — so the
 * dropdown says "anthropic · opus", and a new model is a new column, no code.
 * Each provider's FIRST column is its default.
 */
function parseLaunchTable(raw: string): SessionLaunchSpec[] {
  const cellsOf = (line: string) => {
    const c = line.split('|').map((s) => s.trim());
    return c[0] === '' && c[c.length - 1] === '' ? c.slice(1, -1) : c;
  };
  const out: SessionLaunchSpec[] = [];
  // Per `### Provider` section, so a section's `- **mcp_off:**` line reaches exactly the
  // providers its own table names, wherever in the section it sits.
  for (const section of raw.split(/^### /m)) {
    let models: string[] = [];
    const specs: SessionLaunchSpec[] = [];
    // The provider's no-MCP flags, backticked like every cmd in this file.
    const mcpOff = /^-\s*\*\*mcp_off:\*\*\s*`(.+)`\s*$/m.exec(section)?.[1]?.trim();
    for (const line of section.split('\n')) {
      if (!line.includes('|')) continue;
      const cells = cellsOf(line);
      if (cells.length < 2) continue;
      if (/^provider$/i.test(cells[0])) {
        models = cells.slice(1).map((m) => m.replace(/`/g, '').trim());
        continue;
      }
      const provider = /^`([a-z0-9_-]+)`$/i.exec(cells[0])?.[1];
      if (!provider || !models.length) continue;
      cells.slice(1).forEach((cell, i) => {
        const cmd = /^`(.+)`$/.exec(cell)?.[1];
        const model = models[i];
        if (cmd && model) specs.push({ provider, model, cmd, ...(mcpOff ? { mcpOff } : {}) });
      });
    }
    out.push(...specs);
  }
  return out;
}

/**
 * Every session_launch_spec in the table — what the launcher's model picker lists.
 * SYSTEM SCOPE: read from the install, never from the user's file. session_launch_specs are stock;
 * an upgrade adding a model must reach a box that already has its own root list.
 */
export async function listSessionLaunchSpecs(): Promise<SessionLaunchSpec[]> {
  return parseLaunchTable(await readFile(LAUNCH_TABLE_MD, 'utf8'));
}

/* ---------------------------------------------------------------------------
 * THE WRITE PATH — the commons' Project Root tab edits the USER catalog.
 *
 * Writes go to the catalogs store's PROJECT_ROOTS.md, NEVER to the shipped file: the
 * install is replaced by the next upgrade, so a root written there would vanish under
 * the owner's feet. The directory is made here, on first write — a repo holds code,
 * never data (DAIKUSAN.md).
 *
 * The file stays the source of truth and stays hand-editable: commons is a
 * CO-EDITOR, not an owner. That is why nothing here rewrites the document.
 * One `## name` block is re-emitted and every other byte — comments, the launch
 * table, blank lines, the order things sit in — is passed through untouched.
 *
 * Three rules, and the second is the one that matters:
 *   1. Never store a fact about the world. Only the owner's INTENT lives here
 *      (which directories, what they are called). A remote written into the file
 *      is stale the day someone changes it; repoFacts() reads it live instead.
 *   2. If the result does not parse back to what was asked for, REFUSE — the
 *      file on disk is left exactly as it was. A catalog we could not fully
 *      understand is never rewritten.
 *   3. Write atomically (temp + rename), so a crash mid-save cannot leave half
 *      a catalog behind.
 * ------------------------------------------------------------------------- */

/** What a brand-new user catalog opens with. Prose only — no `##` heading, so it parses
 * to zero roots until the first one is added. */
const NEW_USER_FILE = `# PROJECT_ROOTS — your directories (user scope)

> Ronin made this file; Ronin never replaces it. It is yours, outside every repo, and an
> upgrade cannot touch it. Hand-edit it freely — the commons' ▣ Project root tab is a
> co-editor, not an owner.
>
> One \`## <handle>\` block per directory, with \`- **key:** value\` lines under it
> (\`dir\`, \`memory\`, \`match\`, \`remit\`).
>
> \`- **archived:** yes\` retires a root without losing it: it comes off the new-session
> picker and stays on the ▣ Project root tab, where one button puts it back. Sessions
> already born under it are untouched — the name never stops meaning what it meant.
>
> What a session here READS at birth is not a field — it is the files on this root's
> shelf. Ask \`ronin-store session_boot\` for it, and see docs/session-boot.md.
> The provider/model launch table is stock and lives in the install, not here.
`;

/** Field order for a block this code creates. Hand-written blocks keep their own.
 * provider/model retired 2026-08-18 (one default, one place) — never written again;
 * blocks that still have them keep them untouched, unread. */
const FIELD_ORDER = ['dir', 'memory', 'match', 'remit', 'archived'] as const;
export type RootField = (typeof FIELD_ORDER)[number];

/** A project_root handle: one lowercase word, the `##` heading, the whole shortcut. */
export const isValidRootName = (n: string) => /^[a-z0-9][a-z0-9_-]*$/.test(n) && n.length <= 32;

/** Line index of each `## <single-word>` heading, in file order. */
function headingLines(lines: string[]): { name: string; at: number }[] {
  const out: { name: string; at: number }[] = [];
  lines.forEach((l, i) => {
    const m = /^## +(.+?)\s*$/.exec(l);
    // A heading with a space is prose (the launch table's own), never a project_root.
    if (m && !m[1].includes(' ')) out.push({ name: m[1], at: i });
  });
  return out;
}

/** Where a block ends: the next `## ` heading of any kind, or the end of the file. */
function blockEnd(lines: string[], from: number): number {
  for (let i = from + 1; i < lines.length; i++) if (/^## /.test(lines[i])) return i;
  return lines.length;
}

const fieldLine = (key: string, value: string) => `- **${key}:** ${value}`;
const isFieldLine = (line: string, key: string) => new RegExp(`^\\s*-\\s*\\*\\*${key}:\\*\\*`, 'i').test(line);

/**
 * Write the catalog, but only if it still parses into what the caller expected.
 * `verify` gets the re-parsed roots and returns an error string to refuse, or null.
 */
async function writeCatalog(text: string, verify: (roots: ProjectRootInfo[]) => string | null): Promise<void> {
  let roots: ProjectRootInfo[];
  try {
    roots = parseRoots(text);
  } catch (e) {
    throw new Error(`Refused: the edited catalog does not parse (${String((e as Error)?.message ?? e)}).`);
  }
  const bad = verify(roots);
  if (bad) throw new Error(`Refused: ${bad}`);
  // First write on a fresh box also creates Ronin's own directory. Nothing ships it.
  await mkdir(USER_CATALOGS_DIR, { recursive: true });
  const tmp = `${USER_PROJECT_ROOTS_MD}.tmp-${process.pid}`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, USER_PROJECT_ROOTS_MD);
}

/**
 * Add a project_root, or edit the fields of one that exists. Only the keys present
 * in `fields` are touched; anything else in the block — including keys this code
 * does not know about — is left exactly where the owner put it.
 */
export async function upsertProjectRoot(name: string, fields: Partial<Record<RootField, string>>): Promise<void> {
  if (!isValidRootName(name)) throw new Error(`"${name}" is not a valid handle (lowercase letters, digits, - and _).`);
  const existing = await readUserRoots();
  // The very first root on a box writes the file into existence, with a header saying
  // what it is — it stays hand-editable, and whoever opens it next should know why.
  const raw = existing.trim() ? existing : NEW_USER_FILE;
  const lines = raw.split('\n');
  const found = headingLines(lines).find((h) => h.name === name);

  if (!found) {
    if (!fields.dir) throw new Error('A new project_root needs a directory.');
    const block = [`## ${name}`];
    for (const key of FIELD_ORDER) {
      const v = fields[key];
      if (v) block.push(fieldLine(key, v));
    }
    // One blank line between blocks, and never a run of them at the foot of the file.
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push('', ...block, '');
  } else {
    const end = blockEnd(lines, found.at);
    for (const [key, value] of Object.entries(fields) as [RootField, string][]) {
      if (value === undefined) continue;
      const at = lines.findIndex((l, i) => i > found.at && i < end && isFieldLine(l, key));
      if (value === '') {
        if (at !== -1) lines.splice(at, 1);
        continue;
      }
      if (at !== -1) lines[at] = fieldLine(key, value);
      else {
        // Append after the block's last field line, so a new key never lands
        // above `dir` or below someone's trailing prose.
        let last = found.at;
        for (let i = found.at + 1; i < end; i++) if (/^\s*-\s*\*\*/.test(lines[i])) last = i;
        lines.splice(last + 1, 0, fieldLine(key, value));
      }
    }
  }

  await writeCatalog(lines.join('\n'), (roots) => {
    const got = roots.find((r) => r.name === name);
    if (!got) return `"${name}" is not in the catalog after the edit.`;
    if (fields.dir && got.dir !== expand(fields.dir)) return `"${name}" did not take the directory given.`;
    return null;
  });
}

/** Drop a project_root from the catalog. The directory on disk is never touched. */
export async function removeProjectRoot(name: string): Promise<void> {
  if (!isValidRootName(name)) throw new Error(`"${name}" is not a valid handle.`);
  const raw = await readUserRoots();
  const lines = raw.split('\n');
  const found = headingLines(lines).find((h) => h.name === name);
  if (!found) throw new Error(`"${name}" is not in the catalog.`);
  const end = blockEnd(lines, found.at);
  // Take the blank lines that belonged to the block with it, so removing one does
  // not leave a growing gap behind.
  let from = found.at;
  while (from > 0 && lines[from - 1].trim() === '') from--;
  lines.splice(from, end - from);
  if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');

  await writeCatalog(lines.join('\n'), (roots) =>
    roots.some((r) => r.name === name) ? `"${name}" is still in the catalog after the removal.` : null,
  );
}

/* ---------------------------------------------------------------------------
 * LIVE FACTS — read, never stored.
 * ------------------------------------------------------------------------- */

export interface RootFacts {
  name: string;
  dir: string;
  /** False when the directory has been moved or deleted out from under the catalog. */
  exists: boolean;
  /** Absent when this project_root is not a project_repo — legal, and not a defect. */
  repo?: { remote: string; branch: string };
}

const git = async (dir: string, args: string[]) => {
  const { stdout } = await execFileP('git', ['-C', dir, ...args], { timeout: 4000 });
  return stdout.trim();
};

/**
 * What is true about a project_root right now: does the directory still exist, and is
 * it a project_repo. Deliberately not cached and never written to the catalog — a
 * stored remote goes stale silently, a read one is never wrong.
 */
export async function repoFacts(root: ProjectRootInfo): Promise<RootFacts> {
  // Expand HERE, not only at catalog parse: the inspect route hands a TYPED dir
  // straight in, and un-expanded `~/lab` reported "Folder does not exist" for a folder
  // that exists (owner, 2026-08-21). Idempotent for the already-expanded catalog roots.
  const dir = expand(root.dir);
  const out: RootFacts = { name: root.name, dir, exists: false };
  try {
    out.exists = (await stat(dir)).isDirectory();
  } catch {
    return out;
  }
  try {
    // Inside a repo, but only THIS directory's own repo — a checkout nested in
    // another repo must not inherit its parent's remote.
    if ((await git(dir, ['rev-parse', '--show-toplevel'])) !== dir) return out;
    out.repo = {
      remote: await git(dir, ['remote', 'get-url', 'origin']).catch(() => ''),
      branch: await git(dir, ['branch', '--show-current']).catch(() => ''),
    };
  } catch {
    // Not a repo. That is a legal shape for a project_root — `~/lab` is one.
  }
  return out;
}

/**
 * Directory suggestions for a path being typed — the selection half of the folder
 * field (owner, 2026-08-21: "the working folder has got to be a selection option").
 * The prefix's last segment filters its parent's listing; `~` expands; only real
 * directories come back, and dotted ones only once the typed segment says so. Empty
 * input suggests the home directory's own folders — the place a person starts.
 */
export async function suggestDirs(prefixRaw: string): Promise<string[]> {
  const prefix = expand(String(prefixRaw ?? '').trim() || '~/');
  const endsSep = prefix.endsWith(path.sep);
  const parent = endsSep ? prefix : path.dirname(prefix);
  const frag = endsSep ? '' : path.basename(prefix);
  let entries;
  try {
    entries = await readdir(parent, { withFileTypes: true });
  } catch {
    return []; // an unreadable or half-typed parent suggests nothing, never errors
  }
  return entries
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => n.startsWith(frag) && (frag.startsWith('.') || !n.startsWith('.')))
    .sort()
    .slice(0, 20)
    .map((n) => path.join(parent, n));
}
