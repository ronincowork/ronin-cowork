import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { storeDir } from '../resources.js';
import { readTeamRoster } from '../team-rosters.js';
import { arrangementOf } from './arrangement.js';
import { aheadBehind, dirtyFiles, revParse, worktreeOf } from './git.js';
import {
  soloDeskBranch, teamDeskBranch, teamLineBranch,
  type Assignment, type DeskRecord, type DeskStatus, type RepoArrangement, type RepoDesk, type TeamLine,
} from './schema.js';

const desksDir = () => storeDir('desks');
const worktreesDir = () => storeDir('worktrees');
let writeSequence = 0;

export const branchKey = (branch: string): string => branch.replace(/\//g, '%2F');

export const deskRow = (repo: string, branch: string): string =>
  path.join(desksDir(), 'registry', repo, `${branchKey(branch)}.json`);
export const assignmentRow = (id: string): string => path.join(desksDir(), 'assignments', `${id}.json`);

export const deskWorktree = (repo: string, branch: string): string => path.join(worktreesDir(), repo, branch);
export const candidateWorktree = (repo: string, line: string): string =>
  path.join(worktreesDir(), '.candidates', repo, line);

export function lineFor(a: RepoArrangement, team: string): TeamLine {
  const branch = team ? teamLineBranch(team) : a.working;
  return {
    repo: a.repo,
    team,
    branch,
    worktree: team ? deskWorktree(a.repo, branch) : a.dir,
  };
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${++writeSequence}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    await rename(tmp, file);
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export const readDesk = (repo: string, branch: string): Promise<DeskRecord | null> =>
  readJson<DeskRecord>(deskRow(repo, branch));

export async function writeDesk(rec: DeskRecord): Promise<DeskRecord> {
  await writeJson(deskRow(rec.repo, rec.branch), rec);
  return rec;
}

export async function updateDesk(repo: string, branch: string, patch: Partial<DeskRecord>): Promise<DeskRecord> {
  const cur = await readDesk(repo, branch);
  if (!cur) throw new Error(`no desk recorded for ${repo}:${branch}`);
  return writeDesk({ ...cur, ...patch });
}

export async function removeDesk(repo: string, branch: string): Promise<void> {
  await unlink(deskRow(repo, branch)).catch(() => undefined);
}

export async function listDeskRecords(filter: { repo?: string; session?: string; team?: string; assignment?: string } = {}): Promise<DeskRecord[]> {
  const root = path.join(desksDir(), 'registry');
  const out: DeskRecord[] = [];
  let repos: string[] = [];
  try {
    repos = await readdir(root);
  } catch {
    return out;
  }
  for (const repo of repos) {
    if (filter.repo && repo !== filter.repo) continue;
    let files: string[] = [];
    try {
      files = await readdir(path.join(root, repo));
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const rec = await readJson<DeskRecord>(path.join(root, repo, f));
      if (!rec) continue;
      if (filter.session && rec.session !== filter.session) continue;
      if (filter.team !== undefined && rec.team !== filter.team) continue;
      if (filter.assignment && rec.assignment !== filter.assignment) continue;
      out.push(rec);
    }
  }
  return out.sort((a, b) => a.repo.localeCompare(b.repo) || a.branch.localeCompare(b.branch));
}

export async function deskStatus(rec: DeskRecord, a: RepoArrangement): Promise<DeskStatus> {
  const dir = a.dir;
  const tip = await revParse(dir, `refs/heads/${rec.branch}`);
  const line_tip = await revParse(dir, `refs/heads/${rec.line}`);
  const wt = await worktreeOf(dir, rec.branch);
  const mounted = !!wt && existsSync(wt.path);
  const dirty_files = mounted ? await dirtyFiles(wt!.path).catch(() => []) : [];
  const { ahead, behind } = tip && line_tip ? await aheadBehind(dir, tip, line_tip) : { ahead: 0, behind: 0 };
  let blocked = rec.blocked;
  if (!blocked && !tip) blocked = 'branch is gone';
  else if (!blocked && rec.state === 'open' && !mounted) blocked = 'worktree is not mounted — desk open remounts it';
  return {
    ...rec,
    worktree: mounted ? wt!.path : rec.worktree,
    mounted,
    tip,
    line_tip,
    dirty: dirty_files.length > 0,
    dirty_files,
    ahead,
    behind,
    blocked,
  };
}

export async function listDesks(filter: { repo?: string; session?: string; team?: string; assignment?: string } = {}): Promise<DeskStatus[]> {
  const recs = await listDeskRecords(filter);
  const arrangements = new Map<string, RepoArrangement>();
  const out: DeskStatus[] = [];
  for (const rec of recs) {
    let a = arrangements.get(rec.repo);
    if (!a) {
      try {
        a = await arrangementOf(rec.repo);
      } catch {
        out.push({ ...rec, mounted: false, tip: '', line_tip: '', dirty: false, dirty_files: [], ahead: 0, behind: 0, blocked: `project_root '${rec.repo}' is no longer in the catalog` });
        continue;
      }
      arrangements.set(rec.repo, a);
    }
    out.push(await deskStatus(rec, a));
  }
  return out;
}

export const assignmentId = (session: string, team: string): string => `${session}@${team || 'solo'}`;

export const readAssignment = (id: string): Promise<Assignment | null> => readJson<Assignment>(assignmentRow(id));
export const writeAssignment = async (a: Assignment): Promise<Assignment> => {
  await writeJson(assignmentRow(a.id), a);
  return a;
};

export async function deriveAssignment(input: { session: string; team: string; project_root: string; repos?: string[] }): Promise<Assignment> {
  const { session, team, project_root } = input;
  let repos = [project_root];
  if (input.repos) {
    repos = [...new Set(input.repos)]; // the launch's own answer wins, even when empty
  } else if (team) {
    const roster = await readTeamRoster(team);
    repos = roster ? roster.repos : [project_root];
  }
  const desks: RepoDesk[] = [];
  const now = new Date().toISOString();
  const id = assignmentId(session, team);
  for (const repo of repos) {
    let a: RepoArrangement;
    try {
      a = await arrangementOf(repo);
    } catch {
      continue;
    }
    const branch = team ? teamDeskBranch(team, session) : soloDeskBranch(session);
    desks.push({
      repo, root: repo, branch,
      worktree: deskWorktree(repo, branch),
      line: lineFor(a, team).branch,
      mode: a.mode, session, team, assignment: id, state: 'open', opened_at: now,
    });
  }
  const primary = desks.some((d) => d.repo === project_root) ? project_root : (desks[0]?.repo ?? '');
  return { id, session, team, project_root, primary, desks };
}
