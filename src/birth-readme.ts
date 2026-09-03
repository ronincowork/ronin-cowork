import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storeDir } from './resources.js';
import { resolveFiles } from './resources.js';
import { listMacros } from './macros.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STOCK = path.join(__dirname, '..', 'ronin_session_boot');
const SESSION_MACROS_TEMPLATE = path.join(STOCK, 'SESSION_MACROS.md');

export type Level = 'all' | 'root' | 'role' | 'routine';

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
  const selected = [
    ...await levelFiles(path.join(STOCK, 'all'), path.join(user, 'all')),
    ...(projectRoot
      ? (await resolveFiles({ stock: '', user: path.join(user, 'root', projectRoot), symlinks: true }))
        .map((file) => file.path)
      : []),
    ...await declaredFiles(routineReading, mcpOn),
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
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, 'README.md');
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, lines.join('\n'), 'utf8');
  await rename(temp, target);
  return target;
}
