import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
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
 *   provider·model LAUNCH TABLE only: every install needs brains, and the table is
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

export interface ProjectRootInfo {
  name: string;
  /** Working directory, ~ already expanded. */
  dir: string;
  provider: string;
  /** The model by name — `opus`, `sonnet`, `haiku`, … never a tier euphemism. */
  model: string;
  match: string[];
  remit: string;
  /** The CLI to launch, resolved through the provider/model table. '' if unknown. */
  cmd: string;
}

/** Every launchable `provider · model` the table knows, in table order. */
export interface BrainInfo {
  provider: string;
  model: string;
  cmd: string;
}

const expand = (p: string) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

/**
 * The owner's roots, parsed at request time from the catalogs store —
 * the doc IS the catalog (same contract as listMacros). A project_root is a `## name`
 * heading with `- **key:** value` lines. The brain comes from the SHIPPED launch table,
 * which is a different file in a different scope: adding a provider stays a row and
 * adding a model a column — never a code path. That is the whole of vendor neutrality.
 *
 * No user file = no roots. Empty list, no throw: that is a fresh install, and the tab
 * renders it as "none yet" rather than an error.
 *
 * `project_root` is one of the two universal axes — with `session_job` (what for,
 * and therefore who), in src/catalog.ts. The same two keys scope a memory.
 */
export async function listProjectRoots(): Promise<ProjectRootInfo[]> {
  const [raw, launch] = await Promise.all([readUserRoots(), listBrains()]);
  return parseRoots(raw, launch);
}

/** The parse itself, over text rather than the file — so a WRITE can re-read its own
 * result before committing it (see writeCatalog). The launch table is passed IN because
 * it lives in the other scope's file; a root block never carries its own. */
function parseRoots(raw: string, launch: BrainInfo[]): ProjectRootInfo[] {
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
    const provider = field('provider') || 'anthropic';
    // No model named = the provider's first column, which the table declares to be
    // its default (anthropic → opus).
    const model = field('model') || launch.find((b) => b.provider === provider)?.model || '';
    roots.push({
      name,
      dir: expand(dir),
      provider,
      model,
      match: field('match')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
      remit: field('remit'),
      cmd: launch.find((b) => b.provider === provider && b.model === model)?.cmd ?? '',
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
function parseLaunchTable(raw: string): BrainInfo[] {
  const cellsOf = (line: string) => {
    const c = line.split('|').map((s) => s.trim());
    return c[0] === '' && c[c.length - 1] === '' ? c.slice(1, -1) : c;
  };
  let models: string[] = [];
  const out: BrainInfo[] = [];
  for (const line of raw.split('\n')) {
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
      if (cmd && model) out.push({ provider, model, cmd });
    });
  }
  return out;
}

/**
 * Every launchable brain in the table — what the launcher's model picker lists.
 * SYSTEM SCOPE: read from the install, never from the user's file. Brains are stock;
 * an upgrade adding a model must reach a box that already has its own root list.
 */
export async function listBrains(): Promise<BrainInfo[]> {
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
> (\`dir\`, \`memory\`, \`provider\`, \`model\`, \`match\`, \`remit\`).
>
> What a session here READS at birth is not a field — it is the files on this root's
> shelf. Ask \`ronin-store session_boot\` for it, and see docs/session-boot.md.
> The provider/model launch table is stock and lives in the install, not here.
`;

/** Field order for a block this code creates. Hand-written blocks keep their own. */
const FIELD_ORDER = ['dir', 'memory', 'provider', 'model', 'match', 'remit'] as const;
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
    roots = parseRoots(text, await listBrains());
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
  const out: RootFacts = { name: root.name, dir: root.dir, exists: false };
  try {
    out.exists = (await stat(root.dir)).isDirectory();
  } catch {
    return out;
  }
  try {
    // Inside a repo, but only THIS directory's own repo — a checkout nested in
    // another repo must not inherit its parent's remote.
    if ((await git(root.dir, ['rev-parse', '--show-toplevel'])) !== root.dir) return out;
    out.repo = {
      remote: await git(root.dir, ['remote', 'get-url', 'origin']).catch(() => ''),
      branch: await git(root.dir, ['branch', '--show-current']).catch(() => ''),
    };
  } catch {
    // Not a repo. That is a legal shape for a project_root — `~/lab` is one.
  }
  return out;
}
