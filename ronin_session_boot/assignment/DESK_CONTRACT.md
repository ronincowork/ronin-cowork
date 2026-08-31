# DESK_CONTRACT — you were born at a desk; this is what that means

You are reading this because your launch resolved an **assignment**: a change set on one
or more repositories, and for each of them a **desk** — that repository's private branch
and the worktree mounted on it, opened for you before your CLI started. The exact desks —
repo, path, branch, the team line each hands in to — are the block in your brief, and the
same facts are on your letter (`read_tegami`, `repos[]`). This page is the contract behind
that block. Authority: the WORKTREES buildout in ronin-lab (wip/buildouts), and its control-surface companion.

**If your brief lists no desks, this page does not apply to you.** A manual launch, a
plain terminal, a session in a repository under direct publishing, or a non-code job has
no desk and was not given one. Do not invent desk state; work as the repository's own
instructions say.

## Four words, used strictly

| Word | Means | Is not |
|---|---|---|
| **commit** | a checkpoint on your desk's private branch. Ordinary `git commit`. Yours; nothing propagates | a publication |
| **hand-in** | you deliberately hand your committed range in to your team's line (`team/<team>/dev`). Mechanical admission only: merge, conflict check, near-instant invariants | `git push`; a full BYOIN |
| **team promotion** | the lead admits the team's combined line to `dev`. The one full repository BYOIN runs there, once, on the candidate; `dev` is live and restarts | yours to run |
| **Git push** | Git's word and nothing else's: remote publication. Desk branches have no remote upstream and are never pushed | how work reaches the team |

Never say bare *push* about your own work. Say **commit**, **hand-in**, or **team
promotion** — each is a different act with a different owner.

## Three scopes on a desk

| Scope | What happens | Who sees it |
|---|---|---|
| **save** | files change in the desk's worktree | nobody |
| **commit** | a checkpoint on the desk's private branch — several are normal, partial ones included | nobody |
| **hand-in** | your committed range is admitted to the team line | the team |

**Commit means preserve. Hand-in means publish.** Commit as often as you like; nothing
leaves the desk until you hand in. No commit triggers a gate, a propagation, or BYOIN.

## What you do

- **Work in the desk.** The terminal opened in your primary desk; a multi-repo assignment
  has one desk per repository, each at its own path. Every path is in your brief. A funnel
  point (`dev`, `team/<team>/dev`) is merged into and never written into — a commit made
  there is a wrong turn, and the guard will say so.
- **Stop and ask the team lead when the desk is missing or contradictory.** Before the
  first repository write, compare `tejun-desk status --assignment`, the desk block in your
  brief, and the work record's `repos[]`. `NO-DESK` after a desk was promised, mismatched
  paths or branches, and a checkout on `dev` or `team/<team>/dev` are blockers. Change
  nothing there. Post the exact mismatch with `tejun-wipeboard post "…"`; the default
  interrupts the team lead. The lead provisions or repairs the desk. Resume only in the
  worktree the corrected status reports—never by making a branch or worktree yourself.
- **Commit coherent checkpoints, privately.** Ordinary `git commit` in the desk's worktree.
  Scoped tests as part of the work are yours to run; they are not a boundary protocol.
- **Hand in when the work is coherent for the team** — at a DONE leg on your ladder, and
  before you close. It is an explicit act: `tejun-desk hand-in` (one desk) or
  `tejun-desk hand-in --assignment` (every desk in the assignment, each admitted to its own
  repository's team line). A conflict is contained in a candidate worktree, the line is
  untouched, and you are told the two sides; the lead adjudicates.
- **Never run full BYOIN at commit or hand-in.** The team promotion runs it once; that is
  the lead's or compiler's act, not yours (`docs/test-protocols.md`).
- **Never `git push`.** Nothing of yours has a remote. Remote publication of `dev` and
  `master` belongs to team promotion and the release process.
- **Adopt what your siblings handed in.** When the team line moves you are told —
  *team line moved, by <session>* — and, if your desk is clean, it is brought current at
  once. If your desk is dirty the update is marked **pending** and nothing touches your
  files; it is incorporated at your next commit or on `tejun-desk sync`. If the incoming
  change overlaps files you have dirty, the notice carries the files and the diff: that is
  the cross-purposes catch, read it before you go on.
- **Closing a desk is explicit.** `tejun-desk park` captures unsaved files in a `WIP:`
  commit and leaves the desk parked — branch kept, recorded with your name and commits
  ahead — for the lead to hand in, inspect, reassign or discard. Nothing you did not hand
  in is published by closing, and nothing is deleted.

`tejun-desk status` answers, per desk: saved/dirty, commits ahead, pending team update,
last accepted hand-in, blocked reason. Read the row, not `git branch`, when you report.

## What the environment does for you

The desk was opened, its node modules linked and its upstream set before you existed; the
claim was posted on the team board. Hand-ins are serialized per line, built in a candidate
worktree, and advance the line by compare-and-swap with a receipt — or not at all. You do
not manage any of that; you commit, you hand in, you read what you are told.
