import { arrangementOf, arrangementWorktreesInput } from './desks/arrangement.js';
import type { Assignment, RepoDesk } from './desks/schema.js';
import { deriveAssignment, writeAssignment } from './desks/registry.js';
import { resolveWorktrees, type ResolvedWorktreesRepository } from './worktrees-resolution.js';

export interface LaunchWorktrees {
  assignment: Assignment | null;
  repositories: ResolvedWorktreesRepository[];
}

export type DeskChoice = 'own' | 'none';

export async function resolveLaunchDesks(input: {
  session: string;
  team: string;
  project_root: string;
  agent: boolean;
  control: boolean;
  desk?: DeskChoice;
  repos?: string[];
}): Promise<LaunchWorktrees> {
  if (!input.agent) return { assignment: null, repositories: [] };
  const assignment = await deriveAssignment({ session: input.session, team: input.team, project_root: input.project_root, repos: input.repos });
  const repositories = await Promise.all(assignment.desks.map(async (candidate) => {
    const arrangement = await arrangementOf(candidate.repo);
    return arrangementWorktreesInput(arrangement, {
      worktree: candidate.worktree,
      branch: candidate.branch,
      line: candidate.line,
    });
  }));
  const resolution = resolveWorktrees({
    capability: {
      worktrees: input.control ? 'enabled' : 'disabled',
      provenance: 'resolved_routines.ronin_worktrees',
    },
    repositories,
  });
  const managed = new Set(resolution.repositories.filter((repository) => repository.mode === 'managed').map((repository) => repository.repo));
  const desks = assignment.desks.filter((desk) => managed.has(desk.repo));
  if (!desks.length) return { assignment: null, repositories: resolution.repositories };
  const primary = desks.some((desk) => desk.repo === assignment.project_root)
    ? assignment.project_root
    : desks[0]!.repo;
  return { assignment: { ...assignment, primary, desks }, repositories: resolution.repositories };
}

export function primaryWorkLocation(repositories: ResolvedWorktreesRepository[], projectRoot: string): string {
  return repositories.find((repository) => repository.repo === projectRoot)?.location
    ?? repositories[0]?.location
    ?? '';
}

export async function prepareLaunchDesks(a: Assignment): Promise<Assignment> {
  let opener: { openDesk: (i: { repo: string; session: string; team: string; assignment?: string; branch?: string }) => Promise<RepoDesk> };
  try {
    opener = (await import('./desks/desk.js')) as typeof opener;
  } catch (e) {
    console.warn(`Desk preparation is unavailable; launching from the project checkout: ${(e as Error)?.message ?? e}`);
    return { ...a, desks: [] };
  }
  let opened: Assignment;
  try {
    const desks: RepoDesk[] = [];
    for (const candidate of a.desks) {
      const openedDesk = await opener.openDesk({
        repo: candidate.repo,
        session: a.session,
        team: a.team,
        assignment: a.id,
        branch: candidate.branch,
      });
      desks.push({
        repo: openedDesk.repo,
        root: openedDesk.root,
        branch: openedDesk.branch,
        worktree: openedDesk.worktree,
        line: openedDesk.line,
        mode: openedDesk.mode,
        session: openedDesk.session,
        team: openedDesk.team,
        assignment: openedDesk.assignment,
        state: openedDesk.state,
        opened_at: openedDesk.opened_at,
      });
    }
    opened = { ...a, desks };
    await writeAssignment(opened);
  } catch (e) {
    console.warn(`Could not open the desks for ${a.id}; launching from the project checkout: ${(e as Error)?.message ?? e}`);
    return { ...a, desks: [] };
  }
  return opened;
}

export function renderDeskBlock(a: Assignment): string {
  const width = Math.max(...a.desks.map((d) => d.repo.length));
  const rows = a.desks.map((d) => `  ${d.repo.padEnd(width)}  ${d.worktree}  → ${d.line}${d.repo === a.primary ? '  (you start here)' : ''}`);
  const n = a.desks.length;
  return [
    `Your assignment has ${n} desk${n === 1 ? '' : 's'}:`,
    ...rows,
    'Get, update, and hand in through tejun-desk; your Worktrees Routine is the contract.',
  ].join('\n');
}

export function renderWorkLocations(repositories: ResolvedWorktreesRepository[], branches: Readonly<Record<string, string>> = {}): string {
  const direct = repositories.filter((repository) => repository.mode === 'direct');
  if (!direct.length) return '';
  return [
    'Direct work locations:',
    ...direct.map((repository) => {
      const branch = branches[repository.repo];
      return `  ${repository.repo}  ${repository.location}  (ordinary Git checkout; no managed desk or desk record${branch ? `, on branch ${branch}` : ''})`;
    }),
  ].join('\n');
}
