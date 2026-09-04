import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storeDir } from './resources.js';
import { resolveFiles } from './resources.js';
import { listMacros } from './macros.js';
import { activeDeskProfileName, listDeskProfiles } from './desk-profiles.js';
import { resolveLexicon } from './lexicon-catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STOCK = path.join(__dirname, '..', 'ronin_session_boot');
const SESSION_MACROS_TEMPLATE = path.join(STOCK, 'SESSION_MACROS.md');

export type Level = 'all' | 'root' | 'role' | 'routine';

/** The glossary's filename on the universal shelf; the owner may shadow it by name. */
const GLOSSARY = 'KOTOBA_GLOSSARY.md';

/**
 * THE ONE-READ BUDGET. A newborn is handed one path and reads it with its own CLI's file
 * tool, and every supported CLI caps what one read delivers: Codex ~10k tokens of shell
 * output, Claude Code 30,000 chars of shell output and 25,000 tokens per Read — and both
 * models open a file in a first window of about 250 lines. Measured 2026-09-04 (Codex
 * 0.151.0, Claude Code 2.1.260) after a 121 KB packet cost a session its instructions.
 * The compiled packet must fit the smallest of those, so one read is the whole packet;
 * `tests/session-boot.test.ts` holds the real stock shelf to it. Bytes are the hard cap.
 * Lines are the habit: the fullest stock birth compiles to ~420 lines with the Routine
 * contracts inside the first 250, and the ceiling stops the next shelf addition from
 * quietly pushing them out again.
 */
export const PACKET_BUDGET = { bytes: 30_000, lines: 450 } as const;

const userShelf = () => storeDir('session_boot');

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

async function glossaryReading(templatePath: string, session = ''): Promise<string> {
  const text = await renderGlossaryReading(templatePath);
  const dir = session ? path.join(storeDir('session_boot_cache'), 'sessions', session) : storeDir('session_boot_cache');
  const target = path.join(dir, GLOSSARY);
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
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dir, { recursive: true });
  await writeFile(temp, text);
  await rename(temp, target);
  return target;
}

export async function ensureShelf(roots: string[] = []): Promise<void> {
  const base = userShelf();
  const dirs = [
    path.join(base, 'all'),
    path.join(base, 'root'),
    path.join(base, 'routine'),
    ...roots.map((r) => path.join(base, 'root', r)),
  ];
  await Promise.all(dirs.map((d) => mkdir(d, { recursive: true }).catch(() => {})));
}

async function levelFiles(stock: string, user: string): Promise<string[]> {
  return (await resolveFiles({ stock, user, symlinks: true })).map((file) => file.path);
}

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

export async function bootFiles(
  projectRoot: string,
  mcpOn = true,
  routineReading: string[] = [],
  routineMacros?: ReadonlySet<string>,
  session = '',
): Promise<string[]> {
  const user = userShelf();
  const universal = await levelFiles(path.join(STOCK, 'all'), path.join(user, 'all'));
  const isGlossary = (file: string) => path.basename(file) === GLOSSARY;
  // READING ORDER. What a session must OBEY comes first — the Routine contracts (fork
  // versus spawn, the desk, never `git push`) — then the maps, then the owner's root shelf,
  // then the live macro roster, and the glossary last: it is reference, and the least
  // costly thing to miss. A newborn that reads only its first window reads the rules.
  // (Owner's ruling 2026-09-04, after a lexicon inlined ahead of the contracts pushed
  // them past line 1,997 of a 121 KB packet.)
  const selected = [
    ...await declaredFiles(routineReading, mcpOn),
    ...universal.filter((file) => !isGlossary(file)),
    ...(projectRoot
      ? (await resolveFiles({ stock: '', user: path.join(user, 'root', projectRoot), symlinks: true }))
        .map((file) => file.path)
      : []),
  ];
  const seen = new Set<string>();
  const files: string[] = [];
  for (const file of selected) {
    const key = await realpath(file).catch(() => file);
    if (seen.has(key)) continue;
    seen.add(key);
    files.push(file);
  }
  files.push(await sessionMacrosReading(routineMacros, session));
  for (const template of universal.filter(isGlossary)) files.push(await glossaryReading(template, session));
  return files;
}

export function isShelfTeaching(file: string): boolean {
  const under = (base: string) => file === base || file.startsWith(base + path.sep);
  if (under(STOCK) || under(storeDir('session_boot_cache'))) return true;
  const shelf = userShelf();
  return under(shelf) && !under(path.join(shelf, 'root'));
}

function titleOf(text: string, file: string): string {
  const heading = text.match(/^#{1,6}\s+(.+?)\s*$/m);
  return heading ? heading[1].trim() : path.basename(file);
}

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
  const packet = lines.join('\n');
  const size = { bytes: Buffer.byteLength(packet, 'utf8'), lines: lines.length };
  if (size.bytes > PACKET_BUDGET.bytes || size.lines > PACKET_BUDGET.lines) {
    // Over the one-read budget: the newborn's CLI will cut it and the newborn will not
    // know what it missed. Said here, in the operator log, until the compiler can say it
    // in the packet and the receipt (plans: BIRTH_PACKET, leg 3).
    console.warn(`[birth] ${session}: the compiled README is ${size.bytes} bytes / ${size.lines} lines, over the one-read budget of ${PACKET_BUDGET.bytes} / ${PACKET_BUDGET.lines}; a single read will not deliver it whole.`);
  }
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, 'README.md');
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, packet, 'utf8');
  await rename(temp, target);
  return target;
}
