/**
 * DESKS — the shared schema of the control surface's state floor (Track 1, Fable 1).
 *
 * This file is the one compilable shape every other track builds on: launch (Track 3)
 * resolves an assignment into desks from it, visibility (Track 4) reads desk status and
 * receipts from it, promotion (Track 2) consumes hand-in receipts and produces change-set
 * receipts in the shape declared here, and the compatibility audit (Track 5) supplies the
 * checked-in `RONIN_REPO` record that `RepoArrangement` is read from. Types only — no
 * I/O, no git, nothing that could wake a machine. The words are docs/worktrees.md's, used
 * strictly: a BRANCH is a bookmark, a WORKTREE is a folder, a DESK is one repository's
 * branch and worktree opened together, an ASSIGNMENT is what a session is changing
 * (one desk per repo), a FUNNEL POINT is merged into and never written into, a
 * CANDIDATE is the throwaway integration worktree a hand-in is built in.
 *
 * Vocabulary (owner, 2026-08-28): commit → hand-in → team promotion → Git push.
 * `push` is git's word and appears in no field below.
 */

/** How a repository is arranged — read from its checked-in `RONIN_REPO` (Track 5's file). */
export type RepoMode = 'reviewed' | 'direct';

export interface RepoArrangement {
  /** The project_root name this repository is known by — the key every other record uses. */
  repo: string;
  /** The home checkout: the project_root's `dir`. For a reviewed repo this is the `dev` worktree, and it is live. */
  dir: string;
  mode: RepoMode;
  /** The local working line (`dev`). Reviewed only; a direct repo's working line is its stable line. */
  working: string;
  /** The published line (`master`, or `main` for a direct repo). */
  stable: string;
  /** Whether managed desks apply. `none` = today's behaviour: a shared checkout, the claim hook active. */
  desks: 'managed' | 'none';
  /** Which lines may reach the remote at all. Ruled 2026-08-20: only `dev` and `master`. */
  publish: string[];
  /** Where the answer came from — an absent file is a legal, reported state, never a guess. */
  source: 'RONIN_REPO' | 'absent';
}

/** A team's integration line on one repository: `team/<team>/dev`, mounted at one worktree. */
export interface TeamLine {
  repo: string;
  /** '' for a rōnin's `solo/<session>` desk, whose line is the repo's working line itself. */
  team: string;
  branch: string;
  worktree: string;
}

export type DeskState = 'open' | 'parked';

/**
 * One desk: repository-specific, identified by `repo:branch`. A session has one per repo it
 * is changing; a parked desk keeps its branch and may have no worktree on disk.
 */
export interface RepoDesk {
  repo: string;
  /** The project_root the repo is known by — same value as `repo`, kept so a reader never has to know that. */
  root: string;
  branch: string;
  worktree: string;
  /** The line this desk hands in to. */
  line: string;
  mode: RepoMode;
  /** The session that opened it; a parked desk remembers its last owner. */
  session: string;
  /** '' for a rōnin. */
  team: string;
  /** The assignment this desk belongs to — a change set spanning one or more repos. */
  assignment: string;
  state: DeskState;
  opened_at: string;
  parked_at?: string;
}

/** A pending team-line update recorded on a dirty desk — files untouched, notice sent. */
export interface PendingUpdate {
  /** The team-line SHA the desk has not yet adopted. */
  line_sha: string;
  /** The session whose accepted hand-in moved the line. */
  by: string;
  at: string;
  /** Files changed on the line that this desk also has unsaved changes to — the cross-purposes catch. */
  overlap: string[];
}


/** The registry's durable row for a desk: the desk plus the tool-owned facts that are not derivable from git. */
export interface DeskRecord extends RepoDesk {
  pending: PendingUpdate | null;
  /** The last accepted hand-in from this desk, by receipt id — '' when none. */
  last_hand_in: string;
  /** A standing reason the desk cannot hand in (a conflict awaiting the lead), or ''. */
  blocked: string;
}

/**
 * A desk's derived, tool-owned status. Nothing here is prose an agent maintains; every
 * field is read from git or the registry at the moment of asking.
 */
export interface DeskStatus extends DeskRecord {
  /** The worktree folder exists on disk (a parked desk may not have one). */
  mounted: boolean;
  /** The desk's tip, or '' when the branch is gone. */
  tip: string;
  /** The line's tip. */
  line_tip: string;
  dirty: boolean;
  dirty_files: string[];
  ahead: number;
  behind: number;
}

/** What a session is changing: one desk per participating repo, and which one its shell starts in. */
export interface Assignment {
  id: string;
  session: string;
  team: string;
  project_root: string;
  /** The repo whose desk is the launch cwd. */
  primary: string;
  desks: RepoDesk[];
}

export type HandInResult = 'accepted' | 'conflict' | 'stale' | 'refused';

/**
 * The hand-in receipt — one appended per attempt on a team line, accepted or not. The
 * attribution ledger Track 2's promotion reads: every accepted receipt since the last
 * successful promotion travels in the change-set receipt, and a bisect replays them in
 * order. Keyed by exact SHAs; never edited after append.
 */
export interface HandInReceipt {
  id: string;
  at: string;
  repo: string;
  team: string;
  line: string;
  session: string;
  /** The desk branch. */
  desk: string;
  /** The desk tip handed in. */
  source_tip: string;
  /** The line tip the candidate was built on — the compare-and-swap's expected value. */
  expected_old: string;
  /** The candidate's resulting commit — '' when the merge did not complete. */
  candidate: string;
  result: HandInResult;
  /** The line's SHA after an accepted advance; '' otherwise. */
  line_sha: string;
  /** Files with conflicts, when `result` is `conflict`. */
  conflict_files: string[];
  /** The reason, when `result` is `refused` or `stale`. */
  reason: string;
}

/** One repo's row in a coordinated change set. */
export interface ChangeSetRepo {
  repo: string;
  /** The `dev` tip the candidate was built on. */
  expected_old: string;
  candidate: string;
  /** Hand-in receipt ids this candidate carries, in ledger order. */
  hand_in_receipts: string[];
  /** Set when this repo's ref was advanced; '' until then. */
  advanced_to: string;
}

export type ChangeSetState = 'prepared' | 'advancing' | 'complete' | 'interrupted' | 'abandoned';

/**
 * The change-set (team promotion) receipt — the recovery AND attribution state of a
 * coordinated promotion across repos. Track 2 writes it; the shape is declared here so
 * the roster (Track 4) and CI (Track 5) read one thing. An `interrupted` receipt blocks a
 * new promotion of the same change set until recovered or abandoned explicitly.
 */
export interface ChangeSetReceipt {
  id: string;
  at: string;
  team: string;
  repos: ChangeSetRepo[];
  state: ChangeSetState;
}

/** What downward adoption tells a sibling desk after an accepted hand-in. */
export type DeskNoticeKind = 'adopted' | 'pending' | 'pending_overlap' | 'conflict';

export interface DeskNotice {
  kind: DeskNoticeKind;
  repo: string;
  desk: string;
  session: string;
  /** The line SHA the notice is about. */
  line_sha: string;
  /** The session whose hand-in caused it. */
  by: string;
  /** Overlapping files, for `pending_overlap`; conflict files, for `conflict`. */
  files: string[];
}

/** The branch names, derived one way everywhere. */
export const teamLineBranch = (team: string): string => `team/${team}/dev`;
export const teamDeskBranch = (team: string, session: string): string => `team/${team}/${session}`;
export const soloDeskBranch = (session: string): string => `solo/${session}`;

/** A desk's identity as a string: `repo:branch` — docs/worktrees.md's spelling. */
export const deskId = (d: Pick<RepoDesk, 'repo' | 'branch'>): string => `${d.repo}:${d.branch}`;
