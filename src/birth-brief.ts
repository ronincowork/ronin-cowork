import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storeDir } from './resources.js';
import { resolveFiles } from './resources.js';
import { CAPABILITIES_READING } from './capabilities.js';
import { SOUGHT_READING } from './behaviours.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STOCK = path.join(__dirname, '..', 'ronin_session_boot');

export type Level = 'all' | 'root' | 'routine';

/** The glossary's filename on the universal shelf; the owner may shadow it by name. */
const GLOSSARY = 'KOTOBA_GLOSSARY.md';

/** The compiled brief's filename in each session folder: named for what it is, to whoever opens it. */
export const BIRTH_BRIEF = 'AGENT_BIRTH_BRIEF.md';

/**
 * THE ONE-READ BUDGET. A newborn is handed one path and reads it with its own CLI's file
 * tool, and every supported CLI caps what one read delivers: Codex ~10k tokens of shell
 * output, Claude Code 30,000 chars of shell output and 25,000 tokens per Read — and both
 * models open a file in a first window of about 250 lines. Measured 2026-09-04 (Codex
 * 0.151.0, Claude Code 2.1.260) after a 121 KB packet cost a session its instructions.
 * The compiled packet must fit the smallest of those, so one read is the whole packet;
 * `tests/session-boot.test.ts` holds the real stock shelf to it. Bytes are the hard cap.
 * Lines are the habit: the fullest stock birth compiles to ~350 lines with the Routine
 * contracts inside the first 250, and the ceiling stops the next shelf addition from
 * quietly pushing them out again.
 */
export const PACKET_BUDGET = { bytes: 30_000, lines: 380 } as const;

/** The packet's last line. A newborn that can quote it has seen the whole packet. */
export function packetEndLine(session: string): string {
  return `— end of packet for ${session} —`;
}

/** What the brief and the birth receipt say about a compiled packet. */
export interface PacketReport {
  path: string;
  bytes: number;
  lines: number;
  sections: number;
  terminator: string;
  over_budget: boolean;
}

export async function describePacket(briefPath: string, session: string): Promise<PacketReport> {
  const text = await readFile(briefPath, 'utf8');
  const bytes = Buffer.byteLength(text, 'utf8');
  const lines = text.split('\n').length;
  return {
    path: briefPath,
    bytes,
    lines,
    sections: (text.match(/^## /gm) ?? []).length,
    terminator: packetEndLine(session),
    over_budget: bytes > PACKET_BUDGET.bytes || lines > PACKET_BUDGET.lines,
  };
}

/**
 * THE READING PROTOCOL, in the brief. One sentence the newborn can verify: how long the
 * packet is, that one read delivers it, and the line it ends with. An over-budget packet
 * says so and asks for parts — the compiler has already warned the operator log.
 */
export function readFirstSentence(packet: PacketReport): string {
  const kb = Math.max(1, Math.round(packet.bytes / 1024));
  const head = `Read first: ${packet.path} — ${packet.lines} lines, ${kb} KB, ${packet.over_budget ? 'over the one-read budget: read it in parts, in order, until you reach' : 'one read; it ends with'} the line "${packet.terminator}".`;
  return `${head} Do not act before you have seen that line.`;
}

const userShelf = () => storeDir('session_boot');

/** A generated fragment, written to the session's cache so the compiler inlines it like any shelf file. */
export async function cachedReading(name: string, text: string, session = ''): Promise<string> {
  const dir = session ? path.join(storeDir('session_boot_cache'), 'sessions', session) : storeDir('session_boot_cache');
  const target = path.join(dir, name);
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dir, { recursive: true });
  await writeFile(temp, text);
  await rename(temp, target);
  return target;
}

/**
 * THE GLOSSARY STAYS OUT OF THE PACKET (owner, 2026-10-23: keep the brief light). The packet
 * carries only WORDS.md, which names `ronin-help <word>`; that tool reads the install's glossary.
 */
export const WORDS_READING = 'WORDS.md';

const WORDS_POINTER = [
  '# Words with the owner',
  '',
  'Use plain words with the owner. A Ronin word you do not know: `ronin-help <word>`.',
  '',
].join('\n');

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

async function declaredFiles(refs: readonly string[]): Promise<string[]> {
  const user = userShelf();
  const out: string[] = [];
  for (const raw of refs) {
    const ref = raw.trim().replace(/^\/+/, '');
    if (!ref || ref.includes('..') || path.isAbsolute(raw)) continue;
    if (!ref.startsWith('routine/') && !ref.startsWith('house/') && !/^[a-z0-9_-]+_connected\/$/.test(ref)) continue;
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
  routineReading: string[] = [],
  capabilitiesOverview?: string,
  session = '',
  soughtOverview?: string,
): Promise<string[]> {
  const user = userShelf();
  const universal = await levelFiles(path.join(STOCK, 'all'), path.join(user, 'all'));
  const isGlossary = (file: string) => path.basename(file) === GLOSSARY;
  // READING ORDER. What a session must OBEY comes first — the Routine contracts (fork
  // versus spawn, the desk, never `git push`) — then the maps, then the owner's root shelf,
  // then the tool overview built from the selected capability documents, and the glossary
  // pointer last: it is reference, and the least costly thing to miss. A newborn that reads only
  // its first window reads the rules.
  // (Owner's ruling 2026-09-04, after a lexicon inlined ahead of the contracts pushed
  // them past line 1,997 of a 121 KB packet.)
  const selected = [
    ...await declaredFiles(routineReading),
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
  if (capabilitiesOverview !== undefined) files.push(await cachedReading(CAPABILITIES_READING, capabilitiesOverview, session));
  if (soughtOverview !== undefined) files.push(await cachedReading(SOUGHT_READING, soughtOverview, session));
  if (universal.some(isGlossary)) files.push(await cachedReading(WORDS_READING, WORDS_POINTER, session));
  return files;
}

export function isShelfTeaching(file: string): boolean {
  const under = (base: string) => file === base || file.startsWith(base + path.sep);
  if (under(STOCK) || under(storeDir('session_boot_cache'))) return true;
  const shelf = userShelf();
  if (under(shelf) && !under(path.join(shelf, 'root'))) return true;
  const behaviours = path.join(path.dirname(STOCK), 'ronin_catalogs', 'behaviours');
  const ownerBehaviours = storeDir('ways');
  return [behaviours, ownerBehaviours].some((root) =>
    under(path.join(root, 'floor')) || under(path.join(root, 'conditional')),
  );
}

function titleOf(text: string, file: string): string {
  const heading = text.match(/^#{1,6}\s+(.+?)\s*$/m);
  return heading ? heading[1].trim() : path.basename(file);
}

/** A catalog page's field block, under its title, is for the catalog, not the reader: an
 *  inlined page keeps its title and teaching and drops the block. The file keeps it. */
const FIELD = /^- \*\*(label|blurb|installation|order|scope|requires|class):\*\*/;
function withoutFields(text: string): string {
  const lines = text.split('\n');
  const title = lines.findIndex((line) => /^#{1,6}\s/.test(line));
  if (title < 0) return text;
  let end = title + 1;
  while (end < lines.length && lines[end].trim() === '') end++;
  const start = end;
  while (end < lines.length && FIELD.test(lines[end])) end++;
  if (end === start) return text;
  while (end < lines.length && lines[end].trim() === '') end++;
  return [...lines.slice(0, title + 1), '', ...lines.slice(end)].join('\n');
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

export async function compileBirthBriefAt(
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
      const demoted = withoutFields(text).replace(/^(#{1,6})(?=\s)/gm, (heading) => `${heading}#`.slice(0, 6));
      sections.push({ title, body: demoted });
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
  // The last line names itself, so a newborn that quotes it has read to the end.
  lines.push('', '---', '', packetEndLine(session), '');
  const packet = lines.join('\n');
  const size = { bytes: Buffer.byteLength(packet, 'utf8'), lines: lines.length };
  if (size.bytes > PACKET_BUDGET.bytes || size.lines > PACKET_BUDGET.lines) {
    // Over the one-read budget: the newborn's CLI will cut it and the newborn will not
    // know what it missed. Said here, in the operator log, until the compiler can say it
    // in the packet and the receipt (plans: BIRTH_PACKET, leg 3).
    console.warn(`[birth] ${session}: the compiled birth brief is ${size.bytes} bytes / ${size.lines} lines, over the one-read budget of ${PACKET_BUDGET.bytes} / ${PACKET_BUDGET.lines}; a single read will not deliver it whole.`);
  }
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, BIRTH_BRIEF);
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, packet, 'utf8');
  await rename(temp, target);
  return target;
}
