# RONIN WORKTREES — private desks, when a repository allows them

This Routine equips you for managed worktrees and hand-in. It does not promise a desk:
both the Agent and the repository must have Worktrees on.

**Your brief names no desk.** Work in the project root's ordinary checkout under the
repository's own instructions. Do not invent a desk, branch, hand-in target or managed
workflow because this Routine is on; the launch receipt says why no desk was opened.
The Agent capability does not override the repository: when the brief says a repository
does not use Worktrees, edit directly in the checkout it names. Do not request a desk for
that repository; there is no missing desk to resolve.
`ronin-repo-init <project-root>` is only for a Configuration task that explicitly asks for a
local Git repository. Routine selection alone is never permission to initialize one.

**Your brief names a desk.** Then the rest of this page is your working agreement. Your
team's other repositories are territory, not desks: `tejun-desk open <repo>` opens one, cut
from the team's line, when the work takes you there. A
**desk** is that repository's private branch and the worktree mounted on it, opened before
your CLI started. The desks — repo, path, branch, the team line each hands in to — are the
block in your brief and the `repos[]` on your letter.

## Four words, used strictly

| Word | Means | Is not |
|---|---|---|
| **commit** | a checkpoint on your desk's private branch. Ordinary `git commit`. Nothing propagates | a publication |
| **hand-in** | you hand your committed range to your team's line (`team/<team>/dev`). Mechanical admission merges and detects conflicts | `git push`; repository verification |
| **team promotion** | the lead admits the team's line to `dev`; `dev` is live and restarts | yours to run |
| **git push** | Git's word only: remote publication. Desk branches have no remote and are never pushed | how work reaches the team |

Never say bare *push* about your own work. **Commit preserves. Hand-in publishes.** Commit
as often as you like; nothing leaves the desk until you hand in, and no commit triggers a
gate or a test run.

## What you do

- **Work in the desk.** A multi-repo assignment has one desk per repository, each at its
  own path. `dev` and `team/<team>/dev` are merged into and never written into. A managed
  desk's dependencies are a private copy, not the live operator checkout's `node_modules`,
  so installing or removing packages in the desk cannot alter the running operator.
- **Stop and ask the team lead when the desk is missing or contradictory.** Before your
  first repository write, compare `tejun-desk status --assignment` with the desk block in
  your brief. `NO-DESK` after a desk was promised, a mismatched path or branch, or a
  checkout on `dev` or a team line are blockers: change nothing, post the exact mismatch
  with `tejun-wipeboard post "…"`, and resume only in the worktree the corrected status
  reports — never by making a branch or worktree yourself.
- **Commit coherent checkpoints, privately.** Scoped tests are part of the work, not a
  boundary protocol.
- **Hand in when the work is coherent for the team** — at a DONE leg, and before you
  close: `tejun-desk hand-in` (one desk) or `tejun-desk hand-in --assignment` (every desk).
  A conflict is contained in a candidate worktree, the line is untouched, and you are told
  the two sides; the lead adjudicates.
- **Verify with scoped evidence.** Run the smallest relevant typecheck, behavior test, or
  explicit Playwright diagnostic for what you changed. Do not run `npm run verify`; the
  Team Lead owns that full repository verdict at promotion.
- **Never `git push`.** Nothing of yours has a remote.
- **Adopt what your siblings handed in.** When the team line moves you are told. A clean
  desk is brought current at once; a dirty desk gets a **pending** update, taken at your
  next commit or `tejun-desk sync`. If the incoming change overlaps files you have dirty,
  the notice names them and shows the diff — read it before you go on.
- **Closing a desk is explicit.** `tejun-desk park` captures unsaved files in a `WIP:`
  commit and leaves the desk parked for the lead. Nothing you did not hand in is
  published by closing, and nothing is deleted.

`tejun-desk status` answers, per desk: saved/dirty, commits ahead, pending team update,
last accepted hand-in, blocked reason. Read that row, not `git branch`, when you report.
