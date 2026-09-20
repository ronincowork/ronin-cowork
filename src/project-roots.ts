import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { execFile as execFileP } from './spawn-broker.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { storeDir } from './resources.js';
import { discoverExecutable } from './agents.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  title: string;
  dir: string;
  match: string[];
  remit: string;
  docs: string[];
  plans: string[];
  archived: boolean;
  campaign_id: string;
}

const expand = (p: string) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

/** The catalog as it stands, with no first-root seeding: for callers that only need to know what is registered. */
export async function peekProjectRoots(): Promise<ProjectRootInfo[]> {
  return parseRoots(await readUserRoots());
}

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
    if (!dir) continue; // a Workspace Folder without a directory is not launchable
    roots.push({
      name,
      title: field('title'),
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

const NEW_USER_FILE = `# PROJECT_ROOTS — your directories (user scope)

> Ronin made this file; Ronin never replaces it. It is yours, outside every repo, and an
> upgrade cannot touch it. Hand-edit it freely — the commons' ▣ Project root tab is a
> co-editor, not an owner.
>
> One \`## <handle>\` block per directory, with \`- **key:** value\` lines under it
> (\`title\`, \`dir\`, \`memory\`, \`match\`, \`remit\`).
>
> \`- **archived:** yes\` retires a root without losing it: it comes off the new-session
> picker and stays on the ▣ Project root tab, where one button puts it back. Sessions
> already born under it are untouched — the name never stops meaning what it meant.
>
> What a session here READS at birth is not a field — it is the files on this root's
> shelf. Ask \`ronin-store session_boot\` for it, and see docs/architecture/session-boot.md.
> The provider catalog (providers and models) is stock and lives in the install's
> \`MODEL_PROVIDERS.md\`, not here; your own copy of that file beside this one shadows it.
`;

const FIELD_ORDER = ['title', 'dir', 'memory', 'match', 'remit', 'docs', 'plans', 'archived', 'campaign_id'] as const;
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
  // Two writes in one process must not share a temp name: a concurrent pair of runtime
  // reads once renamed each other's file away and answered 500.
  const tmp = `${USER_PROJECT_ROOTS_MD}.tmp-${process.pid}-${process.hrtime.bigint().toString(36)}`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, USER_PROJECT_ROOTS_MD);
}

export async function upsertProjectRoot(name: string, fields: Partial<Record<RootField, string>>, _options: { declareArrangement?: boolean } = {}): Promise<void> {
  if (!isValidRootName(name)) throw new Error(`"${name}" is not a valid handle (lowercase letters, digits, - and _).`);
  const existing = await readUserRoots();
  const raw = existing.trim() ? existing : NEW_USER_FILE;
  const lines = raw.split('\n');
  const found = headingLines(lines).find((h) => h.name === name);

  if (!found) {
    if (!fields.dir) throw new Error('A new Workspace Folder needs a directory.');
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

const git = async (executable: string, dir: string, args: string[]) => {
  const { stdout } = await execFileP(executable, ['-C', dir, ...args], { timeout: 4000 });
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
    const executable = await discoverExecutable('git');
    if (!executable || (await git(executable, dir, ['rev-parse', '--show-toplevel'])) !== dir) return out;
    out.repo = {
      remote: await git(executable, dir, ['remote', 'get-url', 'origin']).catch(() => ''),
      branch: await git(executable, dir, ['branch', '--show-current']).catch(() => ''),
    };
  } catch {
  }
  return out;
}

export type GitAccessState = 'available' | 'unavailable' | 'check_failed';
export interface GitAccessAnswer {
  state: GitAccessState;
  message: string;
  checked_at: string;
}

const safeGitMessage = (value: unknown): string => String(value ?? '')
  .replace(/https?:\/\/[^\s/@]+(?::[^\s/@]*)?@/gi, 'https://[credentials]@')
  .replace(/\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[credential]')
  .replace(/([?&](?:access_token|token|password)=)[^\s&]+/gi, '$1[credential]')
  .replace(/[\r\n]+/g, ' ').trim().slice(0, 500);

/** Measure read access to one Workspace Folder's origin without modifying Git or its credentials. */
export async function checkProjectRootGitAccess(root: ProjectRootInfo): Promise<GitAccessAnswer> {
  const checked_at = new Date().toISOString();
  const facts = await repoFacts(root);
  if (!facts.exists || !facts.repo) return { state: 'check_failed', message: 'This Workspace Folder is not an available Git repository.', checked_at };
  if (!facts.repo.remote) return { state: 'unavailable', message: 'This repository has no origin remote to check.', checked_at };
  const executable = await discoverExecutable('git');
  if (!executable) return { state: 'check_failed', message: 'Git is not available to the owner’s login shell.', checked_at };
  try {
    await execFileP(executable, ['-C', facts.dir, 'ls-remote', 'origin'], {
      timeout: 20_000, maxBuffer: 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
    });
    return { state: 'available', message: 'Git can read this repository’s origin remote.', checked_at };
  } catch (error) {
    const failed = error as { code?: unknown; killed?: boolean; stderr?: unknown; message?: unknown };
    if (failed.killed || typeof failed.code !== 'number') {
      return { state: 'check_failed', message: safeGitMessage(failed.stderr) || 'Ronin could not complete the Git access check.', checked_at };
    }
    return {
      state: 'unavailable',
      message: safeGitMessage(failed.stderr) || 'Git could not read this repository’s origin with the current connection.',
      checked_at,
    };
  }
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
