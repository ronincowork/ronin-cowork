/**
 * REPOSITORY ARRANGEMENT — how one repository is run, read from its checked-in record.
 *
 * The record is `RONIN_REPO` at the repo's root (Track 5's file, key=value like VERSION):
 *
 *   mode=reviewed|direct     reviewed: desks hand in to a team line, promotion moves dev
 *   working=dev              the local working line (reviewed only)
 *   stable=master            the published line
 *   desks=managed|none       whether managed desks apply
 *   publish=dev,master       which lines may reach the remote (optional; ruled 2026-08-20)
 *
 * An ABSENT file is today's behaviour — a shared checkout, the claim hook active — and is
 * reported as such (`source: 'absent'`), never guessed from whichever branch happens to be
 * mounted. That is the counter-test Koe provides: a direct `main` repo must never grow a
 * fake team line because a tool assumed every repo is reviewed.
 *
 * The repo is keyed by its project_root NAME; the record is read from the root's `dir`.
 */
import { access, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
import { listProjectRoots, type ProjectRootInfo } from '../project-roots.js';
import type { RepoArrangement, RepoMode } from './schema.js';

export const RONIN_REPO_FILE = 'RONIN_REPO';

export interface RepoProfile {
  mode: RepoMode;
  working: string;
  stable: string;
  desks: 'managed' | 'none';
}

export const arrangementProfile = (a: RepoArrangement): RepoProfile => ({
  mode: a.mode,
  working: a.mode === 'reviewed' ? a.working : '',
  stable: a.stable,
  desks: a.desks,
});

/** Parse the record's text. Exported for the unit floor; unknown keys are ignored, bad values refused by name. */
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

/**
 * WRITE THE RECORD FOR A NEW PROJECT (owner, 2026-08-29): the one gate is this file, so
 * adding a project root writes it — from SETTEI's "new projects use desks?" default —
 * rather than leaving the project silently undeclared. Writes only when the directory is
 * a git repository and has no RONIN_REPO yet; never overwrites a declaration. `managed`
 * declares the house arrangement (reviewed, dev → master); `none` declares direct on the
 * branch the checkout is on. The file is left for the owner to commit — it is theirs.
 * Returns what was written, or null when nothing was.
 */
export async function declareArrangement(dir: string, desks: 'managed' | 'none'): Promise<string | null> {
  const file = path.join(dir, RONIN_REPO_FILE);
  try { await access(path.join(dir, '.git')); } catch { return null; }
  try { await access(file); return null; } catch { /* absent — write it */ }
  let branch = 'main';
  // symbolic-ref, not rev-parse: a repository with no commits yet has an unborn branch
  // that rev-parse cannot name, and a new project is often exactly that.
  try { branch = (await run('git', ['-C', dir, 'symbolic-ref', '--short', 'HEAD'])).stdout.trim() || 'main'; } catch { /* detached or bare — keep main */ }
  const body = desks === 'managed'
    ? ['mode=reviewed', 'working=dev', 'stable=master', 'desks=managed']
    : ['mode=direct', `stable=${branch}`, 'desks=none'];
  const text = [
    `# ${RONIN_REPO_FILE} — this repository's declared arrangement. Read by tools; not inferred.`,
    '# Written when the project root was added, from ⚙ "New projects use desks?". Edit here to',
    '# change this one project; format and meaning: ronin-cowork/RONIN_REPO.',
    ...body,
    '',
  ].join('\n');
  await writeFile(file, text, 'utf8');
  return text;
}

/**
 * FLIP DESKS FOR ONE PROJECT (owner, 2026-08-29): the checkbox on the project-root editor.
 * `managed` → desks=managed, and a direct record becomes reviewed dev → master (a desk
 * needs a working line); `none` → desks=none, mode and lines untouched. No file yet →
 * written fresh by declareArrangement. Comment lines and unknown keys are kept as they
 * are; only the keys named change. Not a git repo → refused.
 */
export async function setDesks(dir: string, desks: 'managed' | 'none'): Promise<RepoArrangement> {
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

function checkedProfile(value: unknown): RepoProfile {
  const p = (value && typeof value === 'object' ? value : {}) as Partial<RepoProfile>;
  if (p.mode !== 'reviewed' && p.mode !== 'direct') throw new Error('mode must be reviewed or direct.');
  if (p.desks !== 'managed' && p.desks !== 'none') throw new Error('desks must be managed or none.');
  const stable = typeof p.stable === 'string' ? p.stable.trim() : '';
  const working = typeof p.working === 'string' ? p.working.trim() : '';
  const safe = (v: string) => !!v && !/[\r\n=]/.test(v);
  if (!safe(stable)) throw new Error('stable must be a branch name.');
  if (p.mode === 'reviewed' && !safe(working)) throw new Error('working must be a branch name for a reviewed repository.');
  return { mode: p.mode, working: p.mode === 'reviewed' ? working : '', stable, desks: p.desks };
}

/**
 * Rewrite the owner's repository profile directly. This deliberately performs no branch,
 * desk, Agent or migration work. `expected` makes the confirmation honest if the file was
 * changed after the editor opened; the replacement itself is atomic within the repo dir.
 * Comments and keys outside the four-field profile (for example `publish`) are retained.
 */
export async function setArrangementProfile(dir: string, proposed: unknown, expected: unknown): Promise<RepoArrangement> {
  try { await access(path.join(dir, '.git')); } catch { throw new Error(`${dir} is not a git repository — it has no repository profile`); }
  const profile = checkedProfile(proposed);
  const beforeExpected = expected as RepoProfile;
  if (!beforeExpected || typeof beforeExpected !== 'object') throw new Error('The current repository profile is required.');
  const file = path.join(dir, RONIN_REPO_FILE);
  let text: string | null = null;
  try { text = await readFile(file, 'utf8'); } catch { text = null; }
  const current = parseArrangement(path.basename(dir), dir, text);
  if (JSON.stringify(arrangementProfile(current)) !== JSON.stringify(beforeExpected)) {
    throw new Error('RONIN_REPO changed after this form was opened. Reopen the editor and review the current profile.');
  }

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
  set('desks', profile.desks);
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

/** Read the record from a directory. */
export async function readArrangement(repo: string, dir: string): Promise<RepoArrangement> {
  let text: string | null = null;
  try {
    text = await readFile(path.join(dir, RONIN_REPO_FILE), 'utf8');
  } catch {
    text = null;
  }
  return parseArrangement(repo, dir, text);
}

/** The arrangement of a project_root by name. An unknown root is a refusal, never an invented repo. */
export async function arrangementOf(root: string, roots?: ProjectRootInfo[]): Promise<RepoArrangement> {
  const all = roots ?? (await listProjectRoots());
  const r = all.find((x) => x.name === root);
  if (!r) throw new Error(`no project_root named '${root}'`);
  return readArrangement(r.name, r.dir);
}

/** True when a repo takes managed desks at all. */
export const desksManaged = (a: RepoArrangement): boolean => a.mode === 'reviewed' && a.desks === 'managed';
