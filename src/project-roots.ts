import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { storeDir } from './resources.js';

const execFileP = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LAUNCH_TABLE_MD = path.join(__dirname, '..', 'ronin_catalogs', 'PROJECT_ROOTS.md');

export const USER_CATALOGS_DIR = storeDir('catalogs');
export const USER_PROJECT_ROOTS_MD = path.join(USER_CATALOGS_DIR, 'PROJECT_ROOTS.md');

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
  dir: string;
  match: string[];
  remit: string;
  docs: string[];
  plans: string[];
  archived: boolean;
  campaign_id: string;
}

export interface SessionLaunchSpec {
  provider: string;
  model: string;
  cmd: string;
  liveDangerously?: string;
  gbrainDisconnected?: string;
}

const expand = (p: string) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

export async function listProjectRoots(): Promise<ProjectRootInfo[]> {
  await ensureFirstRoot();
  return parseRoots(await readUserRoots());
}

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
      await upsertProjectRoot('home', {
        dir: os.homedir(),
        remit: 'Your home directory — where Ronin starts until you name a project of your own.',
      }, { declareArrangement: false });
    } catch {
    }
  })();
  return flooring;
}

const listField = (v: string, dflt: string[]): string[] => {
  const l = v.split(',').map((x) => x.trim()).filter(Boolean);
  return l.length ? l : dflt;
};

function parseRoots(raw: string): ProjectRootInfo[] {
  const roots: ProjectRootInfo[] = [];
  for (const chunk of raw.split(/^## +/m).slice(1)) {
    const lines = chunk.split('\n');
    const name = (lines[0] ?? '').trim();
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
      docs: listField(field('docs'), ['docs', 'README.md']),
      plans: listField(field('plans'), ['wip/buildouts', 'wip/handoffs']),
      archived: /^yes$/i.test(field('archived')),
      campaign_id: field('campaign_id'),
    });
  }
  return roots;
}

function parseLaunchTable(raw: string): SessionLaunchSpec[] {
  const cellsOf = (line: string) => {
    const c = line.split('|').map((s) => s.trim());
    return c[0] === '' && c[c.length - 1] === '' ? c.slice(1, -1) : c;
  };
  const out: SessionLaunchSpec[] = [];
  for (const section of raw.split(/^### /m)) {
    let models: string[] = [];
    const specs: SessionLaunchSpec[] = [];
    const gbrainDisconnected = /^-\s*\*\*gbrain_disconnected:\*\*\s*`(.+)`\s*$/m.exec(section)?.[1]?.trim();
    const liveDangerously = /^-\s*\*\*live_dangerously:\*\*\s*`(.+)`\s*$/m.exec(section)?.[1]?.trim();
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
        if (cmd && model) specs.push({
          provider, model, cmd,
          ...(gbrainDisconnected ? { gbrainDisconnected } : {}),
          ...(liveDangerously ? { liveDangerously } : {}),
        });
      });
    }
    out.push(...specs);
  }
  return out;
}

export async function listSessionLaunchSpecs(): Promise<SessionLaunchSpec[]> {
  return parseLaunchTable(await readFile(LAUNCH_TABLE_MD, 'utf8'));
}

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

const FIELD_ORDER = ['dir', 'memory', 'match', 'remit', 'docs', 'plans', 'archived', 'campaign_id'] as const;
export type RootField = (typeof FIELD_ORDER)[number];

export const isValidRootName = (n: string) => /^[a-z0-9][a-z0-9_-]*$/.test(n) && n.length <= 32;

function headingLines(lines: string[]): { name: string; at: number }[] {
  const out: { name: string; at: number }[] = [];
  lines.forEach((l, i) => {
    const m = /^## +(.+?)\s*$/.exec(l);
    if (m && !m[1].includes(' ')) out.push({ name: m[1], at: i });
  });
  return out;
}

function blockEnd(lines: string[], from: number): number {
  for (let i = from + 1; i < lines.length; i++) if (/^## /.test(lines[i])) return i;
  return lines.length;
}

const fieldLine = (key: string, value: string) => `- **${key}:** ${value}`;
const isFieldLine = (line: string, key: string) => new RegExp(`^\\s*-\\s*\\*\\*${key}:\\*\\*`, 'i').test(line);

async function writeCatalog(text: string, verify: (roots: ProjectRootInfo[]) => string | null): Promise<void> {
  let roots: ProjectRootInfo[];
  try {
    roots = parseRoots(text);
  } catch (e) {
    throw new Error(`Refused: the edited catalog does not parse (${String((e as Error)?.message ?? e)}).`);
  }
  const bad = verify(roots);
  if (bad) throw new Error(`Refused: ${bad}`);
  await mkdir(USER_CATALOGS_DIR, { recursive: true });
  const tmp = `${USER_PROJECT_ROOTS_MD}.tmp-${process.pid}`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, USER_PROJECT_ROOTS_MD);
}

export async function upsertProjectRoot(name: string, fields: Partial<Record<RootField, string>>, options: { declareArrangement?: boolean } = {}): Promise<void> {
  if (!isValidRootName(name)) throw new Error(`"${name}" is not a valid handle (lowercase letters, digits, - and _).`);
  const existing = await readUserRoots();
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

  if (!found && fields.dir && options.declareArrangement !== false) {
    const { declareArrangement } = await import('./desks/arrangement.js');
    const { readDesksSection } = await import('./machine-state.js');
    await declareArrangement(expand(fields.dir), (await readDesksSection()).new_project).catch(() => null);
  }
}

export async function removeProjectRoot(name: string): Promise<void> {
  if (!isValidRootName(name)) throw new Error(`"${name}" is not a valid handle.`);
  const raw = await readUserRoots();
  const lines = raw.split('\n');
  const found = headingLines(lines).find((h) => h.name === name);
  if (!found) throw new Error(`"${name}" is not in the catalog.`);
  const end = blockEnd(lines, found.at);
  let from = found.at;
  while (from > 0 && lines[from - 1].trim() === '') from--;
  lines.splice(from, end - from);
  if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');

  await writeCatalog(lines.join('\n'), (roots) =>
    roots.some((r) => r.name === name) ? `"${name}" is still in the catalog after the removal.` : null,
  );
}

export interface RootFacts {
  name: string;
  dir: string;
  exists: boolean;
  repo?: { remote: string; branch: string };
  project_context?: string[];
}

const git = async (dir: string, args: string[]) => {
  const { stdout } = await execFileP('git', ['-C', dir, ...args], { timeout: 4000 });
  return stdout.trim();
};

export async function repoFacts(root: ProjectRootInfo): Promise<RootFacts> {
  const dir = expand(root.dir);
  const out: RootFacts = { name: root.name, dir, exists: false };
  try {
    out.exists = (await stat(dir)).isDirectory();
  } catch {
    return out;
  }
  const contextCandidates = ['AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md', '.claude/settings.json', '.codex/config.toml'];
  out.project_context = (await Promise.all(contextCandidates.map(async (candidate) =>
    stat(path.join(dir, candidate)).then(() => candidate, () => ''),
  ))).filter(Boolean);
  try {
    if ((await git(dir, ['rev-parse', '--show-toplevel'])) !== dir) return out;
    out.repo = {
      remote: await git(dir, ['remote', 'get-url', 'origin']).catch(() => ''),
      branch: await git(dir, ['branch', '--show-current']).catch(() => ''),
    };
  } catch {
  }
  return out;
}

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
