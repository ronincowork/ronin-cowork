/**
 * THE DESK REGISTRY — every open or parked desk, recorded once, derived on demand.
 *
 * WHAT IT HOLDS: one JSON row per desk (`DeskRecord`) under the `desks` store, keyed by
 * repo + branch, plus one row per assignment. It holds only what git cannot answer: who
 * opened the desk, which assignment and team it belongs to, whether it is parked, a
 * pending team-line update, the last accepted hand-in, a standing block. Everything else
 * — tip, dirty, ahead/behind, mounted — is READ FROM GIT at the moment of asking
 * (`deskStatus`), because a stored fact about a worktree goes stale the instant an agent
 * saves a file. Agents never edit these rows; tools do.
 *
 * WHY THE USER ROOT. A parked desk's row is the only thing that says "this branch is
 * someone's unfinished work, N commits ahead, owned by X" — losing it turns a parked
 * desk into a leftover, which is exactly how work gets dropped on the floor. Uninstall
 * leaves it.
 *
 * PATHS ARE DERIVED ONE WAY. `<worktrees>/<repo>/<branch>` for a desk, the same shape
 * for a team line (`team/<t>/dev`), and `<worktrees>/.candidates/<repo>/<line>` for the
 * throwaway integration worktree. The repo segment exists because a two-repo assignment
 * has the same branch name in both repositories.
 */
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { storeDir } from '../stores.js';
import { readTeamRoster } from '../team-rosters.js';
import { arrangementOf } from './arrangement.js';
import { aheadBehind, dirtyFiles, revParse, worktreeOf } from './git.js';
import {
  soloDeskBranch, teamDeskBranch, teamLineBranch,
  type Assignment, type DeskRecord, type DeskStatus, type RepoArrangement, type RepoDesk, type TeamLine,
} from './schema.js';

const desksDir = () => storeDir('desks');
const worktreesDir = () => storeDir('worktrees');

/** A branch name as one path segment — `/` is what git means by a folder, not what we do. */
export const branchKey = (branch: string): string => branch.replace(/\//g, '%2F');

export const deskRow = (repo: string, branch: string): string =>
  path.join(desksDir(), 'registry', repo, `${branchKey(branch)}.json`);
export const assignmentRow = (id: string): string => path.join(desksDir(), 'assignments', `${id}.json`);

export const deskWorktree = (repo: string, branch: string): string => path.join(worktreesDir(), repo, branch);
export const candidateWorktree = (repo: string, line: string): string =>
  path.join(worktreesDir(), '.candidates', repo, line);

/** The team's line on a repo, or the repo's working line for a rōnin. */
export function lineFor(a: RepoArrangement, team: string): TeamLine {
  const branch = team ? teamLineBranch(team) : a.working;
  return {
    repo: a.repo,
    team,
    branch,
    // A rōnin hands in to `dev` itself, which is mounted at the repo's home checkout.
    worktree: team ? deskWorktree(a.repo, branch) : a.dir,
  };
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await rename(tmp, file);
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

/** Change some fields of a recorded desk. Refuses a desk that is not recorded. */
export async function updateDesk(repo: string, branch: string, patch: Partial<DeskRecord>): Promise<DeskRecord> {
  const cur = await readDesk(repo, branch);
  if (!cur) throw new Error(`no desk recorded for ${repo}:${branch}`);
  return writeDesk({ ...cur, ...patch });
}

export async function removeDesk(repo: string, branch: string): Promise<void> {
  await unlink(deskRow(repo, branch)).catch(() => undefined);
}

/** Every recorded desk, optionally narrowed. A missing store is an empty registry, not an error. */
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

/**
 * A desk's status, derived now. Nothing is cached: the tip, the line, dirtiness and
 * ahead/behind come from git this instant, the rest from the record.
 */
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

/** Status for every desk matching the filter — the roster's read, and the lead's summary. */
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
        // The root is gone from the catalog: still a recorded desk, still shown, blocked by name.
        out.push({ ...rec, mounted: false, tip: '', line_tip: '', dirty: false, dirty_files: [], ahead: 0, behind: 0, blocked: `project_root '${rec.repo}' is no longer in the catalog` });
        continue;
      }
      arrangements.set(rec.repo, a);
    }
    out.push(await deskStatus(rec, a));
  }
  return out;
}

/** The assignment id: one per session per team (a rōnin's is per session). */
export const assignmentId = (session: string, team: string): string => `${session}@${team || 'solo'}`;

export const readAssignment = (id: string): Promise<Assignment | null> => readJson<Assignment>(assignmentRow(id));
export const writeAssignment = async (a: Assignment): Promise<Assignment> => {
  await writeJson(assignmentRow(a.id), a);
  return a;
};

/**
 * DERIVE candidate coordinates for an assignment — pure, opens nothing and decides no
 * applicability. The repositories come from the team roster's repos list, else its
 * project_root default — the same "repos, else project_root" promise the promotion CLI
 * keeps — or, for a rōnin, the launch's project_root. `resolveLaunchDesks` combines these candidates with
 * normalized repository profiles and Agent capability through the one Worktrees resolver.
 */
export async function deriveAssignment(input: { session: string; team: string; project_root: string; repos?: string[] }): Promise<Assignment> {
  const { session, team, project_root } = input;
  // WHERE A TEAM WORKS (owner, 2026-09-02): the roster's ticked repositories, and only
  // those. Nothing ticked is the simple-job default — born in the project root, no desk;
  // a desk in any team repository opens on demand (`tejun-desk open <repo>`). The
  // project_root is never a desk by implication. A rōnin has no roster and keeps its one.
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
