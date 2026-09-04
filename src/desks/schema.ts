
export type RepoMode = 'reviewed' | 'direct';

export interface RepoArrangement {
  repo: string;
  dir: string;
  mode: RepoMode;
  working: string;
  stable: string;
  desks: 'managed' | 'none';
  publish: string[];
  source: 'RONIN_REPO' | 'absent';
}

export interface TeamLine {
  repo: string;
  team: string;
  branch: string;
  worktree: string;
}

export type DeskState = 'open' | 'parked';

export interface RepoDesk {
  repo: string;
  root: string;
  branch: string;
  worktree: string;
  line: string;
  mode: RepoMode;
  session: string;
  team: string;
  assignment: string;
  state: DeskState;
  opened_at: string;
  parked_at?: string;
  /** Exact working-line tip from which this desk was first created. */
  base_sha?: string;
  /** The desk-local dependency tree, when the repository has one. */
  dependency_location?: string;
  /** Living or resumable sessions which own this desk. Old rows default to session. */
  owners?: string[];
  handed_off_at?: string;
  successor_session?: string;
}

export interface PendingUpdate {
  line_sha: string;
  by: string;
  at: string;
  overlap: string[];
}

export interface DeskRecord extends RepoDesk {
  pending: PendingUpdate | null;
  last_hand_in: string;
  blocked: string;
}

export interface DeskStatus extends DeskRecord {
  mounted: boolean;
  tip: string;
  line_tip: string;
  dirty: boolean;
  dirty_files: string[];
  ahead: number;
  behind: number;
  working: string;
  working_tip: string;
  ahead_of_working: number;
  behind_working: number;
  line_ahead_of_working: number;
  line_behind_working: number;
}

export interface Assignment {
  id: string;
  session: string;
  team: string;
  project_root: string;
  primary: string;
  desks: RepoDesk[];
}

export type HandInResult = 'accepted' | 'conflict' | 'stale' | 'refused';

export interface HandInReceipt {
  id: string;
  at: string;
  repo: string;
  team: string;
  line: string;
  session: string;
  desk: string;
  source_tip: string;
  expected_old: string;
  candidate: string;
  result: HandInResult;
  line_sha: string;
  conflict_files: string[];
  reason: string;
}

export interface ChangeSetRepo {
  repo: string;
  expected_old: string;
  candidate: string;
  hand_in_receipts: string[];
  advanced_to: string;
}

export type ChangeSetState = 'prepared' | 'advancing' | 'complete' | 'interrupted' | 'abandoned';

export interface ChangeSetReceipt {
  id: string;
  at: string;
  team: string;
  repos: ChangeSetRepo[];
  state: ChangeSetState;
}

export type DeskNoticeKind = 'adopted' | 'pending' | 'pending_overlap' | 'conflict';

export interface DeskNotice {
  kind: DeskNoticeKind;
  repo: string;
  desk: string;
  session: string;
  line_sha: string;
  by: string;
  files: string[];
}

export const teamLineBranch = (team: string): string => `team/${team}/dev`;
export const teamDeskBranch = (team: string, session: string): string => `team/${team}/${session}`;
export const soloDeskBranch = (session: string): string => `solo/${session}`;

export const deskId = (d: Pick<RepoDesk, 'repo' | 'branch'>): string => `${d.repo}:${d.branch}`;
