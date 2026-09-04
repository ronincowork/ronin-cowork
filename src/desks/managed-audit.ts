import type { LifecycleProjection, ManagedEventRead } from './lifecycle-ledger.js';

export type ManagedInvariant = 'agreement' | 'accounted_refs' | 'lifecycle_closure'
  | 'no_orphaned_edits' | 'current_construction' | 'publish_boundary' | 'release_represented';

export interface AuditFinding {
  invariant: ManagedInvariant;
  severity: 'error' | 'notice';
  code: string;
  repo: string;
  object: string;
  detail: string;
}

export interface ObservedManagedDesk {
  id: string;
  branch: string;
  path: string;
  tip: string;
  base_sha: string;
  constructed_from_current_dev: boolean;
  mounted: boolean;
  contained_in_dev: boolean;
  dirty_files: string[];
  owners: string[];
  dev_behind: number;
  dev_ahead: number;
  team_behind: number;
  team_ahead: number;
}

export interface ObservedManagedRef {
  name: string;
  sha: string;
  kind: 'desk' | 'team_line' | 'candidate' | 'quarantine' | 'publish' | 'other';
  contained_in_dev: boolean;
  remote?: boolean;
  base_sha?: string;
  transaction_id?: string;
}

export interface ObservedRelease {
  dev_sha: string;
  stable_sha: string;
  open_prs: Array<{ base: string; head: string; state: 'open' | 'closed' }>;
  working: string;
  stable: string;
}

export interface ManagedRepositoryObservation {
  repo: string;
  mode: 'managed' | 'checkout';
  dev_tip: string;
  team_tip: string;
  managed_paths: string[];
  desks: ObservedManagedDesk[];
  refs: ObservedManagedRef[];
  /** Living owners from the durable session registry recorded at birth, never tmux presence. */
  live_sessions_from_registry: string[];
  publish_refs: string[];
  release: ObservedRelease;
}

export interface ManagedAuditInput {
  ledger: ManagedEventRead;
  projection: LifecycleProjection;
  repositories: ManagedRepositoryObservation[];
}

export interface ManagedAuditResult {
  ok: boolean;
  exit_code: 0 | 1;
  findings: AuditFinding[];
  notices: AuditFinding[];
  summary: { repositories: number; excluded_checkouts: number; errors: number; notices: number };
}

const finding = (invariant: ManagedInvariant, code: string, repo: string, object: string, detail: string, severity: AuditFinding['severity'] = 'error'): AuditFinding =>
  ({ invariant, severity, code, repo, object, detail });
const objectRepo = (id: string): string => id.includes(':') ? id.slice(0, id.indexOf(':')) : '';

export function auditManagedState(input: ManagedAuditInput): ManagedAuditResult {
  const findings: AuditFinding[] = input.ledger.issues.map((issue) =>
    finding('agreement', `ledger_${issue.code}`, issue.repo, `line ${issue.line}`, issue.detail));
  let excluded = 0;
  const projectedDesks = new Map(input.projection.desks.map((desk) => [`${desk.repo ?? objectRepo(desk.id)}\0${desk.id}`, desk]));
  const quarantined = new Set(input.projection.quarantines.map((item) => `${item.repo ?? objectRepo(item.id)}\0${item.id}`));
  const pendingRepos = new Set(input.projection.pending.map((item) => item.repo));

  for (const repo of input.repositories) {
    if (repo.mode === 'checkout') { excluded++; continue; }
    const observed = new Map(repo.desks.map((desk) => [`${repo.repo}\0${desk.id}`, desk]));
    const activeTeams = new Set(input.projection.desks.flatMap((desk) => (desk.repo ?? objectRepo(desk.id)) === repo.repo && desk.owner_team ? [desk.owner_team] : []));

    for (const [key, desk] of projectedDesks) {
      const projectedRepo = desk.repo ?? objectRepo(desk.id);
      if (projectedRepo && projectedRepo !== repo.repo) continue;
      const actual = observed.get(key);
      if (!actual) {
        findings.push(finding('agreement', 'projected_desk_missing', repo.repo, desk.id, 'ledger says the desk is active but no managed worktree observation matches it'));
        continue;
      }
      if (desk.path && desk.path !== actual.path) findings.push(finding('agreement', 'managed_path_mismatch', repo.repo, desk.id, `ledger path ${desk.path} differs from ${actual.path}`));
      if (!actual.mounted || !repo.managed_paths.includes(actual.path)) findings.push(finding('agreement', 'worktree_not_registered', repo.repo, desk.id, `${actual.path} is not a registered managed path`));
    }
    for (const desk of repo.desks) {
      const key = `${repo.repo}\0${desk.id}`;
      if (!projectedDesks.has(key) && !quarantined.has(key)) findings.push(finding('agreement', 'unrecorded_managed_desk', repo.repo, desk.id, 'managed worktree exists without an active or quarantined ledger object'));
    }
    const projectedPaths = new Set(input.projection.desks.flatMap((desk) => desk.path ? [desk.path] : []));
    for (const managedPath of repo.managed_paths) {
      if (!projectedPaths.has(managedPath) && !repo.desks.some((desk) => desk.path === managedPath)) {
        findings.push(finding('agreement', 'unrecorded_managed_path', repo.repo, managedPath, 'managed root contains a path absent from ledger and observed desks'));
      }
    }

    const activeRefs = new Set(repo.desks.map((desk) => desk.branch));
    const quarantineRefs = new Set(repo.refs.filter((ref) => ref.kind === 'quarantine').map((ref) => ref.name));
    for (const ref of repo.refs) {
      if (ref.kind === 'other') continue;
      const lineTeam = /^team\/([^/]+)\/dev$/.exec(ref.name)?.[1] ?? '';
      const accounted = activeRefs.has(ref.name) || quarantineRefs.has(ref.name)
        || (ref.kind === 'publish' && repo.publish_refs.includes(ref.name))
        || (ref.kind === 'team_line' && activeTeams.has(lineTeam))
        || (ref.kind === 'candidate' && pendingRepos.has(repo.repo));
      if (!accounted) findings.push(finding('accounted_refs', 'unaccounted_managed_ref', repo.repo, ref.name, `${ref.name}@${ref.sha} is neither active, retirement-due, quarantined nor released`));
      if (ref.remote && (ref.kind === 'desk' || ref.kind === 'team_line' || ref.kind === 'candidate' || ref.kind === 'quarantine')) {
        findings.push(finding('publish_boundary', 'private_ref_published', repo.repo, ref.name, 'a Ronin private ref exists on the remote'));
      }
      if (ref.contained_in_dev && !accounted && (ref.kind === 'desk' || ref.kind === 'team_line' || ref.kind === 'candidate')) {
        findings.push(finding('lifecycle_closure', 'contained_managed_ref', repo.repo, ref.name, 'obsolete managed ref is contained in dev and due for settlement'));
      }
      if (ref.kind === 'candidate' && ref.base_sha && ref.base_sha !== repo.dev_tip) {
        findings.push(finding('current_construction', 'candidate_base_not_current_dev', repo.repo, ref.name, `candidate base ${ref.base_sha} is not current dev ${repo.dev_tip}`));
      }
    }

    for (const desk of repo.desks) {
      const allDead = desk.owners.length === 0 || desk.owners.every((owner) => !repo.live_sessions_from_registry.includes(owner));
      if (desk.contained_in_dev && allDead) {
        findings.push(finding('lifecycle_closure', 'contained_dead_desk', repo.repo, desk.id, 'non-live desk is contained in dev and due for settlement'));
      }
      if (allDead && (desk.dirty_files.length > 0 || !desk.contained_in_dev) && !quarantined.has(`${repo.repo}\0${desk.id}`)) {
        findings.push(finding('no_orphaned_edits', 'dead_owner_unique_work', repo.repo, desk.id, `dead owners leave ${desk.dirty_files.length} dirty file(s) or commits outside dev without visible custody`));
      }
      if (!desk.constructed_from_current_dev) {
        findings.push(finding('current_construction', 'base_not_current_dev', repo.repo, desk.id, `desk was constructed from ${desk.base_sha || '<unknown>'}, not the then-current dev tip`));
      }
      if (desk.dev_behind >= 20) findings.push(finding('current_construction', 'desk_lag', repo.repo, desk.id, `${desk.dev_behind} commits behind dev`, 'notice'));
      if (desk.team_behind >= 20) findings.push(finding('current_construction', 'team_lag', repo.repo, desk.id, `${desk.team_behind} commits behind the team line`, 'notice'));
    }

    const release = repo.release;
    const matching = release.open_prs.filter((pr) => pr.state === 'open' && pr.head === release.working && pr.base === release.stable);
    if (release.dev_sha !== release.stable_sha) {
      if (!matching.length) findings.push(finding('release_represented', 'release_not_represented', repo.repo, release.working, `dev ${release.dev_sha} differs from stable ${release.stable_sha} without an open ${release.working} → ${release.stable} PR`));
      else if (matching.length !== 1 || release.open_prs.filter((pr) => pr.state === 'open').length !== 1) {
        findings.push(finding('release_represented', 'multiple_release_prs', repo.repo, release.working, 'release state is represented by more than one open pull request'));
      }
    }
  }

  const errors = findings.filter((item) => item.severity === 'error');
  const notices = findings.filter((item) => item.severity === 'notice');
  return {
    ok: errors.length === 0,
    exit_code: errors.length ? 1 : 0,
    findings: errors,
    notices,
    summary: { repositories: input.repositories.length - excluded, excluded_checkouts: excluded, errors: errors.length, notices: notices.length },
  };
}
