/**
 * The single pure Worktrees switching seam.
 *
 * Callers supply birth-scoped Agent capability and repository applicability already
 * normalized by the repository boundary. This module performs no I/O and knows nothing
 * about Routines, RONIN_REPO compatibility storage, sessions, Teams, or path derivation.
 */
export type WorktreesSetting = 'enabled' | 'disabled';

export type WorktreesApplicabilitySource = 'RONIN_REPO' | 'absent';

export interface WorktreesCapability {
  worktrees: WorktreesSetting;
  provenance: string;
}

export interface WorktreesManagedCandidate {
  worktree: string;
  branch: string;
  line: string;
}

export interface WorktreesRepositoryInput {
  repo: string;
  project_root: string;
  checkout: string;
  worktrees: WorktreesSetting;
  applicability_source: WorktreesApplicabilitySource;
  branches: {
    working: string;
    stable: string;
  };
  managed?: WorktreesManagedCandidate;
}

export type WorktreesResolutionReason =
  | 'agent_and_repository_enabled'
  | 'agent_disabled'
  | 'repository_disabled';

export interface ResolvedWorktreesRepository {
  repo: string;
  project_root: string;
  worktrees: WorktreesSetting;
  mode: 'managed' | 'direct';
  location: string;
  branches: {
    working: string;
    stable: string;
  };
  managed: WorktreesManagedCandidate | null;
  reason: WorktreesResolutionReason;
  provenance: {
    agent: string;
    repository: WorktreesApplicabilitySource;
  };
}

export interface WorktreesResolution {
  packet: WorktreesSetting;
  repositories: ResolvedWorktreesRepository[];
}

export interface ResolveWorktreesInput {
  capability: WorktreesCapability;
  repositories: WorktreesRepositoryInput[];
}

export function resolveWorktrees(input: ResolveWorktreesInput): WorktreesResolution {
  const { capability } = input;
  return {
    packet: capability.worktrees,
    repositories: input.repositories.map((repository) => {
      const managed = capability.worktrees === 'enabled' && repository.worktrees === 'enabled';
      if (managed && !repository.managed) {
        throw new Error(`Worktrees is enabled for ${repository.repo}, but no managed candidate was supplied.`);
      }
      const reason: WorktreesResolutionReason = managed
        ? 'agent_and_repository_enabled'
        : capability.worktrees === 'disabled'
          ? 'agent_disabled'
          : 'repository_disabled';
      return {
        repo: repository.repo,
        project_root: repository.project_root,
        worktrees: managed ? 'enabled' : 'disabled',
        mode: managed ? 'managed' : 'direct',
        location: managed ? repository.managed!.worktree : repository.checkout,
        branches: { ...repository.branches },
        managed: managed ? { ...repository.managed! } : null,
        reason,
        provenance: {
          agent: capability.provenance,
          repository: repository.applicability_source,
        },
      };
    }),
  };
}
