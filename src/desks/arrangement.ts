import { access, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
import { listProjectRoots, type ProjectRootInfo } from '../project-roots.js';
import type {
  WorktreesManagedCandidate,
  WorktreesRepositoryInput,
  WorktreesSetting,
} from '../worktrees-resolution.js';
import type { RepoArrangement, RepoMode } from './schema.js';

export const RONIN_REPO_FILE = 'RONIN_REPO';

export interface RepoProfile {
  mode: RepoMode;
  working: string;
  stable: string;
  worktrees: WorktreesSetting;
}

export interface WorktreesProfileProvenance {
  source: RepoArrangement['source'];
  storage: 'desks=managed' | 'desks=none' | 'absent';
}

export interface WorktreesRepositoryProfile {
  worktrees: WorktreesSetting;
  branches: {
    working: string;
    stable: string;
  };
  applicability_source: RepoArrangement['source'];
  provenance: WorktreesProfileProvenance;
}

export const arrangementProfile = (a: RepoArrangement): RepoProfile => ({
  mode: a.mode,
  working: a.mode === 'reviewed' ? a.working : '',
  stable: a.stable,
  worktrees: a.desks === 'managed' ? 'enabled' : 'disabled',
});

export const arrangementWorktreesProfile = (a: RepoArrangement): WorktreesRepositoryProfile => ({
  worktrees: a.desks === 'managed' ? 'enabled' : 'disabled',
  branches: {
    working: a.mode === 'reviewed' ? a.working : '',
    stable: a.stable,
  },
  applicability_source: a.source,
  provenance: {
    source: a.source,
    storage: a.source === 'absent' ? 'absent' : a.desks === 'managed' ? 'desks=managed' : 'desks=none',
  },
});

export function arrangementWorktreesInput(
  arrangement: RepoArrangement,
  managed?: WorktreesManagedCandidate,
): WorktreesRepositoryInput {
  const profile = arrangementWorktreesProfile(arrangement);
  return {
    repo: arrangement.repo,
    project_root: arrangement.repo,
    checkout: arrangement.dir,
    worktrees: profile.worktrees,
    applicability_source: profile.applicability_source,
    branches: { ...profile.branches },
    ...(managed ? { managed: { ...managed } } : {}),
  };
}

export function parseArrangement(repo: string, dir: string, text: string | null): RepoArrangement {
  if (text === null) {
    return { repo, dir, mode: 'direct', working: '', stable: '', desks: 'none', publish: [], source: 'absent' };
  }
  const kv = new Map<string, string>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    kv.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  const mode = (kv.get('mode') || 'direct') as RepoMode;
  if (mode !== 'reviewed' && mode !== 'direct') throw new Error(`${RONIN_REPO_FILE} in ${dir}: mode must be reviewed|direct, got '${mode}'`);
  const desksRaw = kv.get('desks') || (mode === 'reviewed' ? 'managed' : 'none');
  if (desksRaw !== 'managed' && desksRaw !== 'none') throw new Error(`${RONIN_REPO_FILE} in ${dir}: desks must be managed|none, got '${desksRaw}'`);
  const stable = kv.get('stable') || (mode === 'reviewed' ? 'master' : 'main');
  const working = mode === 'reviewed' ? (kv.get('working') || 'dev') : stable;
  const publish = (kv.get('publish') || (mode === 'reviewed' ? `${working},${stable}` : stable))
    .split(',').map((s) => s.trim()).filter(Boolean);
  return { repo, dir, mode, working, stable, desks: desksRaw, publish, source: 'RONIN_REPO' };
}

export async function declareArrangement(dir: string, desks: 'managed' | 'none'): Promise<string | null> {
  const file = path.join(dir, RONIN_REPO_FILE);
  try { await access(path.join(dir, '.git')); } catch { return null; }
  try { await access(file); return null; } catch { /* absent — write it */ }
  let branch = 'main';
  try { branch = (await run('git', ['-C', dir, 'symbolic-ref', '--short', 'HEAD'])).stdout.trim() || 'main'; } catch { /* detached or bare — keep main */ }
  const body = desks === 'managed'
    ? ['mode=reviewed', 'working=dev', 'stable=master', 'desks=managed']
    : ['mode=direct', `stable=${branch}`, 'desks=none'];
  const text = [
    `# ${RONIN_REPO_FILE} — this repository's declared arrangement. Read by tools; not inferred.`,
    '# Written when the project root was added, from "New project roots use Worktrees?". Edit here to',
    '# change this one project; format and meaning: ronin-cowork/RONIN_REPO.',
    ...body,
    '',
  ].join('\n');
  await writeFile(file, text, 'utf8');
  return text;
}

async function setDesks(dir: string, desks: 'managed' | 'none'): Promise<RepoArrangement> {
  try { await access(path.join(dir, '.git')); } catch { throw new Error(`${dir} is not a git repository — desks need a repository to declare`); }
  const file = path.join(dir, RONIN_REPO_FILE);
  let text: string | null = null;
  try { text = await readFile(file, 'utf8'); } catch { text = null; }
  if (text === null) {
    await declareArrangement(dir, desks);
    return readArrangement(path.basename(dir), dir);
  }
  const lines = text.split('\n');
  const set = (key: string, value: string) => {
    const at = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
    if (at >= 0) lines[at] = `${key}=${value}`;
    else {
      let last = -1;
      lines.forEach((l, i) => { if (/^[a-z]+=/.test(l.trim())) last = i; });
      lines.splice(last + 1, 0, `${key}=${value}`);
    }
  };
  const has = (key: string) => lines.some((l) => l.trim().startsWith(`${key}=`));
  const current = parseArrangement(path.basename(dir), dir, text);
  if (desks === 'managed' && current.mode !== 'reviewed') {
    set('mode', 'reviewed');
    if (!has('working')) set('working', 'dev');
    set('stable', current.stable && current.stable !== 'main' ? current.stable : 'master');
  }
  set('desks', desks);
  await writeFile(file, lines.join('\n').replace(/\n*$/, '\n'), 'utf8');
  return readArrangement(path.basename(dir), dir);
}

export function validateArrangementProfile(value: unknown): RepoProfile {
  const p = (value && typeof value === 'object' ? value : {}) as Partial<RepoProfile>;
  if (p.mode !== 'reviewed' && p.mode !== 'direct') throw new Error('mode must be reviewed or direct.');
  if (p.worktrees !== 'enabled' && p.worktrees !== 'disabled') throw new Error('worktrees must be enabled or disabled.');
  const stable = typeof p.stable === 'string' ? p.stable.trim() : '';
  const working = typeof p.working === 'string' ? p.working.trim() : '';
  const safe = (v: string) => {
    if (!v || v === '@' || v.startsWith('-') || v.startsWith('.') || v.endsWith('.') || v.endsWith('/')) return false;
    if (v.includes('..') || v.includes('@{') || v.includes('//') || /[\x00-\x20\x7f~^:?*[\\]/.test(v)) return false;
    return v.split('/').every((part) => !!part && !part.startsWith('.') && !part.endsWith('.lock'));
  };
  if (!safe(stable)) throw new Error('stable must be a branch name.');
  if (p.mode === 'reviewed' && !safe(working)) throw new Error('working must be a branch name for a reviewed repository.');
  return { mode: p.mode, working: p.mode === 'reviewed' ? working : '', stable, worktrees: p.worktrees };
}

export async function assertArrangementProfileCurrent(dir: string, expected: unknown): Promise<void> {
  const beforeExpected = expected as RepoProfile;
  if (!beforeExpected || typeof beforeExpected !== 'object') throw new Error('The current repository profile is required.');
  const current = await readArrangement(path.basename(dir), dir);
  if (JSON.stringify(arrangementProfile(current)) !== JSON.stringify(beforeExpected)) {
    throw new Error('RONIN_REPO changed after this form was opened. Reopen the editor and review the current profile.');
  }
}

export async function setArrangementProfile(dir: string, proposed: unknown, expected: unknown): Promise<RepoArrangement> {
  try { await access(path.join(dir, '.git')); } catch { throw new Error(`${dir} is not a git repository — it has no repository profile`); }
  const profile = validateArrangementProfile(proposed);
  const file = path.join(dir, RONIN_REPO_FILE);
  let text: string | null = null;
  try { text = await readFile(file, 'utf8'); } catch { text = null; }
  await assertArrangementProfileCurrent(dir, expected);

  const lines = text === null ? [] : text.split('\n');
  const set = (key: string, value: string) => {
    const at = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
    if (at >= 0) lines[at] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  };
  const drop = (key: string) => {
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i]!.trim().startsWith(`${key}=`)) lines.splice(i, 1);
  };
  set('mode', profile.mode);
  if (profile.mode === 'reviewed') set('working', profile.working); else drop('working');
  set('stable', profile.stable);
  set('desks', profile.worktrees === 'enabled' ? 'managed' : 'none');
  const body = lines.join('\n').replace(/^\n+|\n*$/g, '') + '\n';
  const temp = path.join(dir, `.${RONIN_REPO_FILE}.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(temp, body, { encoding: 'utf8', mode: 0o644, flag: 'wx' });
    await rename(temp, file);
  } catch (e) {
    await unlink(temp).catch(() => undefined);
    throw e;
  }
  return readArrangement(path.basename(dir), dir);
}

export async function readArrangement(repo: string, dir: string): Promise<RepoArrangement> {
  let text: string | null = null;
  try {
    text = await readFile(path.join(dir, RONIN_REPO_FILE), 'utf8');
  } catch {
    text = null;
  }
  return parseArrangement(repo, dir, text);
}

export async function arrangementOf(root: string, roots?: ProjectRootInfo[]): Promise<RepoArrangement> {
  const all = roots ?? (await listProjectRoots());
  const r = all.find((x) => x.name === root);
  if (!r) throw new Error(`no project_root named '${root}'`);
  return readArrangement(r.name, r.dir);
}

export const desksManaged = (a: RepoArrangement): boolean => a.mode === 'reviewed' && a.desks === 'managed';
