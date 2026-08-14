import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { storeDir } from './stores.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** System scope: the shipped catalogs. Replaced wholesale by an upgrade — never written. */
/** The shipped catalogs. Exported so a service reading stock (KOE's hotwords) shares
 * the one resolution instead of computing its own — see `config.ts` REPO_ROOT. */
export const STOCK_DIR = path.join(__dirname, '..', 'ronin_catalogs');

/**
 * Shared reader for the `## name` catalogs (SESSION_JOBS.md here; MACROS.md through
 * macros.ts), and the resolution rule every reader shares (DAIKUSAN's stock/custom law,
 * generalized — see docs/shadowing.md):
 *
 *   resolve(<NAME>.md) = entries(ronin_catalogs/<NAME>.md)          ← stock, file order
 *                      ⊕ entries(<catalogs store>/<NAME>.md)        ← the user's own
 *
 * ENTRY-MERGE, keyed by the heading's first word: a user entry of the same name replaces
 * the stock entry WHOLE (never field-by-field — a field could then never be removed, and
 * "what am I actually running" would be answerable from neither file alone). New names
 * append after the stock ones. A user entry of `- **hidden:** yes` removes the name.
 * A missing or empty user file is the ORDINARY path — fresh install, stock only, no error.
 * Whole-file override is the special case where the user file defines every stock name.
 *
 * Every entry carries its `origin` (stock | user) — what lets the commons show a list is
 * customized rather than silently diverging from the shipped one.
 *
 * The docs ARE the catalogs — parsed at request time, no cache, no generated file, same
 * contract as listMacros/listProjects, so a shadow takes effect on the next request. The
 * two Python readers (bin/tejun, bin/tejun-step) implement the same rule, not the same
 * code; docs/shadowing.md is the single statement both sides implement.
 *
 * An entry is a `## name` heading followed by `- **key:** value` lines. Headings
 * containing a space are prose (the launch table, the format notes) and are never
 * entries — but their first word is still the merge key for readers like bin/tejun that
 * key sections that way. Everything after a `---` footer line is notes, not catalog.
 */
export type Origin = 'stock' | 'user';

export interface CatalogSection {
  /** First word of the `## ` heading, backticks stripped — the merge key. */
  name: string;
  /** The heading as written (without the `## `). Equal to `name` iff it is a bare entry. */
  head: string;
  /** Body lines under the heading, up to the next `## ` heading or the `---` footer. */
  lines: string[];
  origin: Origin;
  /**
   * This entry is the user's AND it replaced a shipped entry of the same name. Origin
   * alone cannot say that, and the difference is what a person needs: one is something
   * you added, the other is something of ours you changed — and only the second can
   * silently stop tracking an upgrade.
   */
  shadowed: boolean;
}

export type Entry = { name: string; origin: Origin; shadowed: boolean; get: (key: string) => string };

/** The user's copy, or '' when there is not one yet. Absence is a fresh install, never a fault. */
async function readUserCatalog(file: string): Promise<string> {
  try {
    return await readFile(path.join(storeDir('catalogs'), file), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return '';
    throw e;
  }
}

/** Exported for `scripts/check-catalogs.ts`, the byoin_check that reads the STOCK files
 * with the same split the runtime uses — a check with its own parser would drift, silently. */
export function splitSections(raw: string, origin: Origin): CatalogSection[] {
  // Everything after a `---` footer rule is prose for the reader, not catalog.
  const body = raw.split(/^---\s*$/m)[0];
  const out: CatalogSection[] = [];
  for (const chunk of body.split(/^## +/m).slice(1)) {
    const lines = chunk.split('\n');
    const head = (lines[0] ?? '').trim();
    const name = (head.split(/\s+/)[0] ?? '').replace(/`/g, '');
    if (!name) continue;
    out.push({ name, head, lines: lines.slice(1), origin, shadowed: false });
  }
  return out;
}

/** The tombstone: how a user file deletes a stock entry rather than forking the file. */
const isHidden = (s: CatalogSection): boolean =>
  s.lines.some((l) => /^-\s*\*\*hidden:\*\*\s*yes\b/i.test(l.trim()));

function mergeSections(stock: CatalogSection[], user: CatalogSection[]): CatalogSection[] {
  // Last block wins within the user file, same as a later line wins in most configs.
  const byName = new Map(user.map((s) => [s.name, s] as const));
  const out: CatalogSection[] = [];
  const placed = new Set<string>();
  for (const s of stock) {
    const u = byName.get(s.name);
    placed.add(s.name);
    if (u) {
      // Yours, in ours' place — the one case a surface must be able to say out loud.
      if (!isHidden(u)) out.push({ ...u, shadowed: true });
    } else out.push(s);
  }
  for (const u of user) {
    if (placed.has(u.name) || isHidden(u)) continue;
    placed.add(u.name);
    out.push(u);
  }
  return out;
}

/**
 * Both scopes read, merged, in order: stock first, the user's own below.
 *
 * `stockOptional` is for a catalog that SHIPS NOTHING — SAVED_LAUNCHES.md, like the
 * user's project-root list, has no stock counterpart at all, so a missing shipped file
 * is its ordinary state rather than a broken install. Everywhere else a missing stock
 * file is a real fault and still throws.
 */
export async function readCatalogSections(file: string, stockOptional = false): Promise<CatalogSection[]> {
  const [stockRaw, userRaw] = await Promise.all([
    readFile(path.join(STOCK_DIR, file), 'utf8').catch((e: NodeJS.ErrnoException) => {
      if (stockOptional && e?.code === 'ENOENT') return '';
      throw e;
    }),
    readUserCatalog(file),
  ]);
  return mergeSections(splitSections(stockRaw, 'stock'), splitSections(userRaw, 'user'));
}

export async function readEntries(file: string, stockOptional = false): Promise<Entry[]> {
  const out: Entry[] = [];
  for (const s of await readCatalogSections(file, stockOptional)) {
    // A heading with a space is prose (the launch table, the format notes), never an entry.
    if (s.head !== s.name) continue;
    out.push({
      name: s.name,
      origin: s.origin,
      shadowed: s.shadowed,
      get: (key: string) =>
        (s.lines.find((l) => new RegExp(`^-\\s*\\*\\*${key}:\\*\\*`, 'i').test(l.trim())) ?? '')
          .replace(new RegExp(`^\\s*-\\s*\\*\\*${key}:\\*\\*\\s*`, 'i'), '')
          .trim(),
    });
  }
  return out;
}

export const splitList = (v: string): string[] =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/* ---------- session_job: what this session is for ---------- */

export interface SessionJobInfo {
  name: string;
  /** Which scope defined this entry — `user` means shadowed or added, never shipped. */
  origin: Origin;
  /** Yours, standing in a shipped entry's place — "changed", not "added". */
  shadowed: boolean;
  icon: string;
  label: string;
  blurb: string;
  ask: string;
  /** One line: what this session is. */
  remit: string;
  /** How it behaves — inlined into the boot brief, so it must stay short. */
  posture: string;
  /** Bias only; the project's default or an explicit pick wins. */
  model: string;
  match: string[];
  /** The @ronin-control dial the session is BORN with — a constant of the kind. */
  dial: 'user' | 'read' | 'write';
  permissions: string;
  lifecycle: string;
  /** Report understanding and wait, rather than starting work. */
  ack: boolean;
  /** First-message template; `{prompt}` is what the user typed. */
  opening: string;
  /**
   * Is an agent CLI launched at all? `- **agent:** none` in the catalog means NO: the
   * session is created and nothing whatever is typed into the pane — a plain terminal.
   * Every field that describes an agent (model, posture, opening, ack, permissions) is
   * meaningless for such an entry and is absent from it, which is why the filter below
   * lets an agentless entry through without an `opening`.
   */
  agent: boolean;
}

export async function listSessionJobs(): Promise<SessionJobInfo[]> {
  return (await readEntries('SESSION_JOBS.md'))
    .map((e) => {
      const dial = e.get('dial').toLowerCase();
      return {
        name: e.name,
        origin: e.origin,
        shadowed: e.shadowed,
        icon: e.get('icon'),
        label: e.get('label') || e.name,
        blurb: e.get('blurb'),
        ask: e.get('ask'),
        remit: e.get('remit'),
        posture: e.get('posture'),
        model: e.get('model'),
        match: splitList(e.get('match')),
        dial: (dial === 'user' || dial === 'read' ? dial : 'write') as SessionJobInfo['dial'],
        permissions: e.get('permissions') || 'default',
        lifecycle: e.get('lifecycle'),
        ack: /^y/i.test(e.get('ack')),
        opening: e.get('opening'),
        agent: e.get('agent').toLowerCase() !== 'none',
      };
    })
    // An agent job with no opening template is a half-written entry and is dropped.
    // An AGENTLESS entry has no opening because there is nobody to send one to.
    .filter((p) => p.opening || !p.agent);
}

/* ---------- the write path: making a catalog yours ---------- */

/**
 * Which catalogs a user may own a copy of, and the header each new file opens with.
 *
 * The header is the feature, not decoration. Per ATARASHI_SESSION §5 the front door
 * that actually gets used is a person telling their own agent what they want changed —
 * so the file has to explain itself to whoever opens it next, including an agent that
 * has never seen this repo. The button is the convenience.
 */
const SHADOWABLE: Record<string, string> = {
  'SESSION_JOBS.md': 'a kind of session — what it is for, and therefore who',
  'MACROS.md': 'a workflow an agent runs when you type +name:',
  'ACTIONS.md': 'a primitive step macros are composed from',
  'TOOLS.md': 'an executable of yours that implements an action',
  'SAVED_LAUNCHES.md': 'a launcher form, filled in ahead of time and named',
};

/** Is this a catalog the user may keep their own copy of? */
export const isShadowable = (file: string): boolean => Object.hasOwn(SHADOWABLE, file);

function newFileHeader(file: string): string {
  const what = SHADOWABLE[file] ?? 'your own entries';
  const stock = file === 'SAVED_LAUNCHES.md' ? '' :
    `>\n> The shipped copy is \`ronin_catalogs/${file}\` — read it for the format and copy a\n` +
    `> block out of it to start from. An entry here with the SAME \`## name\` REPLACES that\n` +
    `> one whole; a new name is added after them; \`- **hidden:** yes\` deletes one.\n`;
  return `# ${file.replace(/\.md$/, '')} — yours (user scope)

> **Ronin made this file; Ronin never replaces it.** It lives outside every repo, an
> upgrade cannot touch it, and an uninstall leaves it. Hand-edit it freely.
>
> One \`## <name>\` block per ${what}, with \`- **key:** value\` lines under it.
${stock}>
> The rule in full: \`docs/shadowing.md\`.
`;
}

/**
 * Create the user's copy of a catalog if it is not there yet, and say where it is.
 *
 * Deliberately does NOT copy the stock file across. Shadowing is an entry-merge, so a
 * wholesale copy is the one shape that guarantees you stop tracking every upgrade at
 * once — the opposite of what someone adding one entry wants.
 */
export async function seedUserCatalog(file: string): Promise<{ path: string; created: boolean }> {
  if (!isShadowable(file)) throw new Error(`"${file}" is not a catalog you can keep your own copy of.`);
  const dir = storeDir('catalogs');
  const target = path.join(dir, file);
  try {
    await readFile(target, 'utf8');
    return { path: target, created: false };
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') throw e;
  }
  await writeCatalogFile(file, newFileHeader(file));
  return { path: target, created: true };
}

/** tmp + rename, so a crash mid-write cannot leave half a catalog. ALWAYS the user file. */
async function writeCatalogFile(file: string, text: string): Promise<void> {
  const dir = storeDir('catalogs');
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, file);
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, target);
}

/* ---------- saved launches: a preset of the launcher, not a macro ---------- */

/**
 * SAVED_LAUNCHES — a named binding of the launcher that already exists:
 * `session_job` × `project_root` × group × mode, as a pressable tile.
 *
 * The owner's words are what this is: *"organize these tiles under new sessions to be
 * like, okay, I have ronin and watch crew."* It is deliberately NOT a macro — a macro is
 * a program an agent executes; this is a form filled in ahead of time. Calling both
 * "macro" puts a preset and a program in one bucket and leaves no word for the second.
 *
 * USER SCOPE ONLY. It ships nothing, exactly like the user's project-root list, so the
 * shadow question answers itself — but it is read through the same resolver so it gains
 * the same rules for free the day a stock one ever exists.
 */
export interface SavedLaunchInfo {
  name: string;
  origin: Origin;
  shadowed: boolean;
  /** What the tile says. Falls back to the handle. */
  label: string;
  session_job: string;
  project_root: string;
  group: string;
  /** `manual` (your words, untouched) or `assisted`. Anything else reads as manual. */
  mode: 'manual' | 'assisted';
  /** Optional text the form opens with — a starting point, never auto-sent. */
  prompt: string;
}

export async function listSavedLaunches(): Promise<SavedLaunchInfo[]> {
  return (await readEntries('SAVED_LAUNCHES.md', true))
    .map((e) => ({
      name: e.name,
      origin: e.origin,
      shadowed: e.shadowed,
      label: e.get('label') || e.name,
      session_job: e.get('session_job'),
      project_root: e.get('project_root'),
      group: e.get('group'),
      mode: (e.get('mode').toLowerCase() === 'assisted' ? 'assisted' : 'manual') as SavedLaunchInfo['mode'],
      prompt: e.get('prompt'),
    }))
    // A saved launch that names no session_job cannot fill the form it exists to fill.
    .filter((l) => l.session_job);
}

/** A saved-launch handle: one lowercase word, the `##` heading, the whole shortcut. */
export const isValidLaunchName = (n: string) => /^[a-z0-9][a-z0-9_-]*$/.test(n) && n.length <= 32;

const LAUNCH_FIELDS = ['label', 'session_job', 'project_root', 'group', 'mode', 'prompt'] as const;
export type LaunchField = (typeof LAUNCH_FIELDS)[number];

/**
 * Save the launcher form as a named tile, or replace one of that name.
 *
 * The file stays the source of truth and stays hand-editable, so this appends or
 * re-emits ONE block and passes every other byte through — same contract as the
 * project-root co-editor. Refuses if the result does not parse back to what was asked
 * for, leaving the file exactly as it was.
 */
export async function saveLaunch(name: string, fields: Partial<Record<LaunchField, string>>): Promise<void> {
  if (!isValidLaunchName(name)) throw new Error(`"${name}" is not a valid handle (lowercase letters, digits, - and _).`);
  if (!fields.session_job) throw new Error('A saved launch needs a session_job.');
  const file = 'SAVED_LAUNCHES.md';
  await seedUserCatalog(file);
  const raw = await readUserCatalog(file);
  const lines = raw.split('\n');

  // Where this block starts and ends, if it is already here.
  const at = lines.findIndex((l) => new RegExp(`^## +${name}\\s*$`).test(l));
  let end = lines.length;
  if (at !== -1) for (let i = at + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { end = i; break; }

  const block = [`## ${name}`];
  for (const key of LAUNCH_FIELDS) {
    const v = (fields[key] ?? '').trim();
    if (v) block.push(`- **${key}:** ${v.replace(/\n+/g, ' ')}`);
  }
  if (at === -1) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push('', ...block, '');
  } else lines.splice(at, end - at, ...block, '');

  const text = lines.join('\n');
  // Parse the RESULT before committing it: a catalog we could not read back is never written.
  const back = splitSections(text, 'user').find((s) => s.name === name);
  if (!back) throw new Error(`Refused: "${name}" is not in the catalog after the edit.`);
  await writeCatalogFile(file, text);
}

/** Drop a saved launch. Nothing else in the file is touched. */
export async function removeLaunch(name: string): Promise<void> {
  if (!isValidLaunchName(name)) throw new Error(`"${name}" is not a valid handle.`);
  const raw = await readUserCatalog('SAVED_LAUNCHES.md');
  const lines = raw.split('\n');
  const at = lines.findIndex((l) => new RegExp(`^## +${name}\\s*$`).test(l));
  if (at === -1) throw new Error(`"${name}" is not in the catalog.`);
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { end = i; break; }
  let from = at;
  while (from > 0 && lines[from - 1].trim() === '') from--;
  lines.splice(from, end - from);
  await writeCatalogFile('SAVED_LAUNCHES.md', lines.join('\n'));
}
