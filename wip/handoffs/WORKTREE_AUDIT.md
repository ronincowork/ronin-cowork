# Worktree Clean Up — strategic audit (worktree_audit, 2026-09-02)

> expires: when the Worktree Clean Up buildout closes (`ronin-lab/wip/buildouts/WORKTREE_CLEAN_UP.md`).
> Read-only audit: every claim below was measured on this box on 2026-09-02 at about 07:15 UTC.
> Nothing was changed, handed in, or promoted by this session.

## Bottom line

The buildout names the right disease but its first cut is in the wrong place. The
worktree system is not mainly suffering from unknown matrix cells. It is suffering from
rulings that outran the code, two competing plans handed to the same two sessions, and a
few load-bearing breakages that make the desk contract unreachable from a desk. An audit
matrix written before those are settled documents a system that is about to change under it.

The core mechanism is not broken: serialized queue, candidate worktree, compare-and-swap,
receipts, downward adoption to desks. It is sound, tested (`tests/desks.test.ts`,
`tests/promotion.test.ts`) and working. Do not redesign it.

## Findings, measured

### 1. Three sources of truth on one ruling (no-park)

- Owner ruled 2026-08-30: no parking; a desk is handed in or closed
  (`docs/worktrees.md` § Hand in or close; lab `DESK_OWNERSHIP.md`).
- `src/desks/desk.ts` `closeDesk` still parks; `tejun-desk` usage still lists
  `park`, `parked`, `recover`.
- `ronin_session_boot/assignment/DESK_CONTRACT.md`, handed to every desk session at birth,
  still says closing a desk is `tejun-desk park`.
- `docs/worktrees.md` § The macros still describes `desk close` as parking.

Every new session is briefed on behaviour the owner retired. `docs/desks.md` admits the
code is "as it still is until DESK_OWNERSHIP lands"; the contract does not.

### 2. Two plans, same sessions

- `WORKTREE_CLEAN_UP.md` (lab) assigns `worktrees_matrix` and `worktrees_roots` audit lanes
  (state/operation matrix; roots and ownership trace).
- `wip/buildouts/RONIN_WORKTREES_PACKET.md` (now on `team/pbs/dev`, 45fab28) assigns the
  same two sessions build legs A (single `resolveWorktrees` seam, 2×2 regression suite)
  and B (Project Root UX, Worktrees vocabulary), with a different vocabulary
  (Worktrees enabled/disabled vs desks=managed).
- `worktrees_matrix`'s desk holds the packet's leg-A handoff uncommitted
  (`wip/handoffs/WORKTREES_MATRIX_MECHANICS.md`); `worktrees_roots` committed the leg-B
  handoff (110fc82).

Whichever plan governs, the other will be executed by accident.

### 3. The contract's verbs do not run from a desk

- 46d24e8 (2026-08-31, on master) projects Routine tools onto the Agent PATH as symlinks
  in `~/.ronin/session-commands/<session>/` (`src/routine-tools.ts`).
- The `ronin_bin` tools locate the repo with
  `HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)` on the unresolved symlink, so
  from a projected session `HERE` is the session-commands store. Measured failures:
  `tejun-desk`, `tejun-wipeboard`, `read_tegami`, `write_tegami`; same pattern in
  `tejun-send`, `tejun-rireki`, `tejun-survey`, `tejun-account`.
- `bin/shim/git` and `bin/shim/tmux` received the readlink fix on 2026-09-01 ("the tmux
  shim's measured fault"); `ronin_bin` did not.

Hand-in, board, and work record are all in this state. Sessions get by calling
`~/dohyo/ronin-cowork/ronin_bin/...` directly, which is the "going around the tools"
the design says it cannot prevent.

### 4. Registry and git disagree by half

- 36 cowork desk rows in the `desks` store; 18 point at branches that no longer exist
  (teams `campaign_config`, `ronin_comps`, `user_enroll`, `team_clean`,
  `funnel_recovery`, and `solo/cowork_clean`). Their team lines are gone too; their
  receipt ledgers remain.
- Nothing in `src/` deletes a team's branches while leaving rows (only
  `discardDesk`/`closeDesk` delete, and they remove the row). The branches were removed
  outside the tools.
- The registry has no reconciliation verb. `deskStatus` reports `blocked: branch is
  gone` and stops.

### 5. The "first full BYOIN" is not full

- Every promotion receipt in the ledger records `check-tips`, `smoke-ui`, `visual-ui`,
  `workbench-ui` as SKIP ("repository-only mode does not drive a live UI").
- The house rule (`docs/test-protocols.md`, WORKTREES_TEST_PROTOCOLS.md): SKIP is not a pass.
- Cadence: `sea_settle` promoted six times between 05:55 and 07:04 today, each restarting
  the live app. The guidance "never per hand-in" is held by nothing; the lead summary that
  is meant to prompt cadence does not exist.
- pbs promotion 20260902T071202Z failed at proving on `check-lexicon` (2 failures),
  attributed to hand-ins by clean_up and machine_settings. `dev` untouched.

### 6. Two-level funnel, one-level adoption

- Hand-in fans the team line down to every desk (`src/desks/hand-in.ts`). Nothing fans
  `dev` down to team lines when another team promotes.
- Measured: `team/pbs/dev` had 6 commits of `dev` missing until clean_up converged it by
  hand on 2026-09-01 16:17; this morning `dev` is again ahead of it (df24635 vs 45fab28).
- Only promotion merges `dev` in, inside the candidate. Desks base on a stale team line
  for as long as the lead waits.

### 7. Launch fell back to the funnel

- `machine_settings` was born on `dev` with `NO-DESK` on 2026-09-02 06:02 (pbs board),
  the outcome `src/launch-desks.ts` says launch must refuse rather than produce.

### 8. Smaller, real

- A `tejun-wipeboard post` process from 2026-09-01 is still hung on this box
  (`npm exec tsx src/wipeboard-cli.ts sea_settle post ...`), i.e. the delivery hole the
  owner's board-first rule was working around.
- `~/ronin/worktrees/.recovery/ronin_cowork` exists and is empty; funnel-recovery
  receipts live under the promotion ledger. Two homes for recovery state.
- The `dev` worktree at `~/dohyo/ronin-cowork` blocked a promotion on 2026-09-01 with
  unsaved tracked changes (someone editing in the funnel); it is clean now.

## Recommended solutions

1. **Settle authority first, in one hand-in.** Pick one governing plan and fold the other
   in as a leg. Land the no-park ruling as documentation and tool usage text before code:
   DESK_CONTRACT, `docs/desks.md`, `tejun-desk` usage, `docs/worktrees.md` macros, together.
   A ruling with no landing date is a drift generator.
2. **Fix the floor before drawing the matrix.** Resolve the symlink in the `ronin_bin`
   tools (the `bin/shim/git` readlink loop), or project wrapper scripts instead of symlinks
   in `routine-tools.ts`. One regression test that runs each projected tool through a
   symlink. This single cut restores the whole contract for every session.
3. **Make git the only truth; the registry a thin ownership row.** Add a reconcile verb
   (`tejun-desk doctor` or the lead's summary) that classifies each row against git and
   receipts the outcome: branch gone → tombstone, remove with a receipt; branch with no
   row → leftover, adopt or report. "Registry says X, git says Y" stops being a legal
   state, which collapses most of the matrix.
4. **Write the matrix as tests, not prose.** `tests/desks.test.ts` already covers most
   cells. Extend it; a cell it cannot express is the finding.
5. **Close the dev-to-team gap explicitly.** Either promotion fans `dev` down to every
   team line the way hand-in fans down to desks, or the summary shows "team line behind
   dev by N" and the lead's brief says so. Silent drift is the only unacceptable option.
6. **Be honest at the promotion gate.** Run the UI gates against a running candidate, or
   stop calling the receipt a full verdict. Ship the lead's summary and cadence prompt
   before adding more promotions.

Sequencing I would use instead of build legs 1–3 as written: floor fixes (2, 1, 3), then
the matrix as tests (4), then the roots trace as a single resolver, which is the one idea
from the packet worth keeping as is (5, 6 alongside).

## Sources read

`docs/worktrees.md`, `docs/desks.md`, `docs/team-promotion.md`, `RONIN_REPO`,
`src/desks/*`, `src/desk-cli.ts`, `src/launch-desks.ts`, `src/routine-tools.ts`,
`src/promotion/promote.ts`, `src/promotion/funnel-recovery.ts`, `libexec/ronin-git-guard`,
lab `WORKTREE_CLEAN_UP.md`, `DESK_OWNERSHIP.md`, `WORKTREES.md`,
`wip/buildouts/RONIN_WORKTREES_PACKET.md`, both sibling handoffs, the pbs wipeboard,
the desks store (registry, assignments, receipts), the promotion ledger,
`git worktree list`, `git branch -vv`.
