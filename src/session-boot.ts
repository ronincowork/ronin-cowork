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
 *     session wearing a particular hat, or doing a particular kind of work;
 *   - and the user had nowhere of their own to add to it.
 *
 * A shelf answers all four with live files rather than stored absolute paths. At birth
 * the selected sources are compiled into one README in the session's own record.
 *
 * TWO HALVES, the same split `ronin_sops` and `ronin_library` already use:
 *
 *   ronin_session_boot/       STOCK, inside the install. Ships, and an upgrade replaces
 *                             it wholesale. Near-empty on purpose.
 *   <session_boot store>/     YOURS, outside every repo. Survives upgrade AND uninstall.
 *
 * THREE LEVELS — universal, Project Root and Routine declarations:
 *
 *   all/                    every session, always
 *   <service>_connected/    only when an enabled Routine declares it and MCP is on
 *   root/<project_root>/    only sessions working in that directory
 *   routine/<name>/FILE.md  only when the enabled Routine manifest declares that file
 *
 * They are ADDITIVE, not a hierarchy — nothing overrides anything. Root, connection,
 * Routine answers a separate launch fact.
 *
 * SHADOWING is by filename within a level: your `all/SHELVES.md` replaces ours whole.
 * Across levels there is no shadowing, because they are answering different questions.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storeDir } from './stores.js';
import { listMacros } from './macros.js';
import { activeDeskProfileName, listDeskProfiles } from './desk-profiles.js';
import { resolveLexicon } from './lexicons.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Stock: inside the install, beside ronin_sops/ and ronin_library/. */
const STOCK = path.join(__dirname, '..', 'ronin_session_boot');
const SESSION_MACROS_TEMPLATE = path.join(STOCK, 'SESSION_MACROS.md');

/** The levels, in reading order. `root`, `role` and `routine` take resolved values. */
export type Level = 'all' | 'root' | 'role' | 'routine';

const userShelf = () => storeDir('session_boot');

/**
 * The tile and the birth reading have ONE answer for which session macros are active:
 * listMacros(), including the owner's catalog shadow, filtered by `preview: yes`.
 *
 * The prose around the list is hand-authored because it teaches the routing rule. The list
 * itself is generated on every assisted launch into Ronin's disposable data root. A checked-in
 * list would describe the stock catalog, not the active one, the moment the owner customized it.
 */
/** The live macro reading as text. Exported for the read-only shelf inventory so the UI
 * shows the same resolved document without creating or exposing the disposable cache. */
export async function renderSessionMacrosReading(allowed?: ReadonlySet<string>): Promise<string> {
  const [template, active] = await Promise.all([
    readFile(SESSION_MACROS_TEMPLATE, 'utf8'),
    listMacros().then((macros) => macros.filter((macro) => macro.preview && (!allowed || allowed.has(macro.name)))),
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

  return template.replace(pattern, `${start}\n${rendered}\n${end}`);
}

/**
 * THE GLOSSARY, RENDERED FOR THE OWNER'S DESK (KOKUGO, owner's ruling 2026-08-27).
 *
 * KOTOBA_GLOSSARY.md tells a session which word to SAY to a person for a house term the
 * tools and docs use (TEGAMI, TEJUN, the wipeboard …). Those words are keys in the lexicon
 * under `glossary.*`, and no surface reads them — their one consumer is this render. Each
 * keyed cell is marked in the template as `**word**<!--g:glossary.key-->`; the active desk
 * profile's resolved lexicon replaces the word, and the marker is dropped so the session
 * reads a plain page. Stock (no profile, or a lexicon that does not answer) renders the
 * template's own words — the floor's floor, as everywhere else.
 *
 * ONE-TIME, BY RULING: rendered at birth, never re-read. A profile changed mid-session is
 * the owner's own problem.
 */
const GLOSSARY_MARK = /\*\*([^*\n]+)\*\*<!--g:([\w.-]+)-->/g;
const GLOSSARY_HEAD_START = '<!-- RENDERED_FOR:START -->';
const GLOSSARY_HEAD_END = '<!-- RENDERED_FOR:END -->';

export async function renderGlossaryReading(templatePath: string): Promise<string> {
  return renderGlossary(await readFile(templatePath, 'utf8'));
}

/** The render itself, from template text — the inventory renders in memory from what it read. */
export async function renderGlossary(template: string): Promise<string> {
  let words: Record<string, string> = {};
  let line = 'Rendered for the stock desk — no desk profile is chosen, so these are the plain words.';
  try {
    const name = await activeDeskProfileName();
    const profile = name ? (await listDeskProfiles()).find((p) => p.name === name) : undefined;
    const lexicon = profile?.lexicon ? await resolveLexicon(profile.lexicon) : undefined;
    if (profile && lexicon) {
      words = lexicon.words;
      line = `Rendered for the owner's desk profile \`${profile.name}\` (${profile.label}) · lexicon \`${lexicon.name}\` — **these are the words the owner sees on screen and the words to use with them.** House names stay ours.`;
    } else if (profile) {
      line = `Rendered for the owner's desk profile \`${profile.name}\` — its lexicon did not answer, so these are the plain words.`;
    }
  } catch {
    // A lexicon that cannot be read is stock; a session must never fail to launch over words.
  }
  const body = template.replace(GLOSSARY_MARK, (_m, literal: string, key: string) => `**${words[key] || literal}**`);
  const head = new RegExp(`${GLOSSARY_HEAD_START}[\\s\\S]*?${GLOSSARY_HEAD_END}`);
  return head.test(body) ? body.replace(head, `${GLOSSARY_HEAD_START}\n> ${line}\n${GLOSSARY_HEAD_END}`) : body;
}

async function glossaryReading(templatePath: string): Promise<string> {
  const text = await renderGlossaryReading(templatePath);
  const dir = storeDir('session_boot_cache');
  const target = path.join(dir, 'KOTOBA_GLOSSARY.md');
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dir, { recursive: true });
  await writeFile(temp, text);
  await rename(temp, target);
  return target;
}

async function sessionMacrosReading(allowed?: ReadonlySet<string>, session = ''): Promise<string> {
  const text = await renderSessionMacrosReading(allowed);
  const dir = session ? path.join(storeDir('session_boot_cache'), 'sessions', session) : storeDir('session_boot_cache');
  const target = path.join(dir, 'SESSION_MACROS.md');
  // Several sessions may be born together. A shared `.tmp` name lets one rename the
  // other's file out from under it; unique writers may safely race, with the last complete
  // catalog snapshot becoming the cache.
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dir, { recursive: true });
  await writeFile(temp, text);
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
    path.join(base, 'routine'),
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
 * ROOT, one level above `all/`, `root/` and `role/`, where nothing ever scans.
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

/** Stock first, then the owner's same-named file for ONE level. Shadowing never reaches
 * across levels: a root README and a Routine README are two additive documents. */
async function levelFiles(stock: string, user: string): Promise<string[]> {
  const byName = new Map<string, string>();
  for (const file of await filesIn(stock)) byName.set(path.basename(file), file);
  for (const file of await filesIn(user)) byName.set(path.basename(file), file);
  return [...byName.values()];
}

/** Resolve the exact boot-shelf coordinates a Routine manifest declared. A manifest is
 * the membership list; merely placing another file beside a declared one does not make
 * it required reading. */
async function declaredFiles(refs: readonly string[], mcpOn: boolean): Promise<string[]> {
  const user = userShelf();
  const out: string[] = [];
  for (const raw of refs) {
    const ref = raw.trim().replace(/^\/+/, '');
    if (!ref || ref.includes('..') || path.isAbsolute(raw)) continue;
    if (ref.endsWith('_connected/') && !mcpOn) continue;
    if (!ref.startsWith('routine/') && !/^[a-z0-9_-]+_connected\/$/.test(ref)) continue;
    if (ref.endsWith('/')) {
      out.push(...await levelFiles(path.join(STOCK, ref), path.join(user, ref)));
      continue;
    }
    const stock = path.join(STOCK, ref);
    const owner = path.join(user, ref);
    let selected = '';
    for (const candidate of [stock, owner]) {
      try {
        if ((await stat(candidate)).isFile()) selected = candidate;
      } catch { /* absent and dangling declarations deliver nothing */ }
    }
    if (selected) out.push(selected);
  }
  return out;
}

/**
 * The source documents for this session, in reading order. Owner files shadow stock only
 * at the same level/coordinate; identical canonical sources selected twice are deduped.
 */
export async function bootFiles(
  projectRoot: string,
  mcpOn = true,
  routineReading: string[] = [],
  routineMacros?: ReadonlySet<string>,
  session = '',
): Promise<string[]> {
  const user = userShelf();
  const selected = [
    ...await levelFiles(path.join(STOCK, 'all'), path.join(user, 'all')),
    // Stock cannot have a root/ — it does not know the owner's directories.
    ...(projectRoot ? await filesIn(path.join(user, 'root', projectRoot)) : []),
    // The desk contract is the Worktrees Routine's own page: on when the Routine is on,
    // and its text says what to do when the launch opened no desk.
    ...await declaredFiles(routineReading, mcpOn),
  ];
  // The same symlinked source can be selected by two honest authorities. Deliver its
  // content once, first selection winning, without collapsing unrelated same-name files.
  const seen = new Set<string>();
  const files: string[] = [];
  for (const file of selected) {
    const key = await realpath(file).catch(() => file);
    if (seen.has(key)) continue;
    seen.add(key);
    files.push(file);
  }
  // Generated last, so the live catalog's macro reading is always the file handed over.
  files.push(await sessionMacrosReading(routineMacros, session));
  // The glossary is rendered from whichever copy won (stock, or the owner's shadow of it)
  // with the active desk profile's words — KOKUGO, 2026-08-27.
  const glossary = files.find((file) => path.basename(file) === 'KOTOBA_GLOSSARY.md');
  if (glossary) files[files.indexOf(glossary)] = await glossaryReading(glossary);
  return files;
}

/** Ronin's own teaching — the stock shelf, the owner's shelf at every level but `root/`,
 * and the generated fragments — is inlined into the birth README. Everything else the
 * launch selected (the owner's project-root documents, selected behaviour books, explicit
 * seeds, the teams SOP) is listed by title and path instead: those are reference the Agent
 * opens at the project, and pasting a 1,200-line catalog is what made the packet unreadable. */
export function isShelfTeaching(file: string): boolean {
  const under = (base: string) => file === base || file.startsWith(base + path.sep);
  if (under(STOCK) || under(storeDir('session_boot_cache'))) return true;
  const shelf = userShelf();
  return under(shelf) && !under(path.join(shelf, 'root'));
}

/** The first heading of a document, or its file name when it has none. */
function titleOf(text: string, file: string): string {
  const heading = text.match(/^#{1,6}\s+(.+?)\s*$/m);
  return heading ? heading[1].trim() : path.basename(file);
}

/** A library card's one line: the document's first sentence of ordinary prose after its
 * heading — not a heading, quote, comment, table or list. A document that opens badly
 * shows it on every front page it is listed on, which is the pressure that fixes it. */
function reachForItWhen(text: string): string {
  const paragraphs = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^(#|>|\||[-*] |\d+\. |```)/.test(p));
  const first = paragraphs[0]?.replace(/\s+/g, ' ') ?? '';
  const sentence = first.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? first;
  return sentence.length > 180 ? `${sentence.slice(0, 177).trimEnd()}…` : sentence;
}

/**
 * Compile the resolved source set into the ONE document a newborn is asked to read.
 *
 * The page opens with what the packet holds, so a reader — the Agent, or the owner in the
 * Docs tab — sees the shape before the text. Each inlined section keeps a visible source
 * line, so provenance survives without a path hunt. `inline` decides which sources are
 * pasted in and which are listed; the launch passes `isShelfTeaching`.
 */
export async function compileBirthReadmeAt(
  dir: string,
  sources: readonly string[],
  session: string,
  inline: (file: string) => boolean = () => true,
): Promise<string> {
  const sections: { title: string; body: string }[] = [];
  const shelf: { title: string; file: string; when: string }[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    try {
      const key = await realpath(source);
      if (seen.has(key)) continue;
      seen.add(key);
      const text = (await readFile(source, 'utf8')).trim();
      if (!text) continue;
      const title = titleOf(text, source);
      if (!inline(source)) {
        shelf.push({ title, file: source, when: reachForItWhen(text) });
        continue;
      }
      const demoted = text.replace(/^(#{1,6})(?=\s)/gm, (heading) => `${heading}#`.slice(0, 6));
      sections.push({ title, body: `_Source: ${source}_\n\n${demoted}` });
    } catch { /* a source that vanished before compilation is omitted, never stale */ }
  }
  const lines = [
    `# Read first — ${session}`,
    '',
    `Ronin compiled this one document for **${session}** at birth (${new Date().toISOString()}). It is the whole startup packet: read it once, top to bottom, then keep it as the reference it is.`,
    '',
    '## In this packet',
    '',
    ...sections.map((section, index) => `${index + 1}. ${section.title}`),
  ];
  if (shelf.length) {
    lines.push(
      '',
      '## On your shelf',
      '',
      'Library cards, not reading: each names a document selected for you and what it holds. Open one when you need it, not before.',
      '',
      '| Document | What it holds | Where |',
      '|---|---|---|',
      ...shelf.map((row) => `| ${row.title.replace(/\|/g, '\\|')} | ${row.when.replace(/\|/g, '\\|')} | \`${row.file}\` |`),
    );
  }
  for (const section of sections) lines.push('', '---', '', section.body);
  lines.push('');
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, 'README.md');
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, lines.join('\n'), 'utf8');
  await rename(temp, target);
  return target;
}
