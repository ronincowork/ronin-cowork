# Managed worktree construction

The internal HTTP desk surface owns these managed-worktree mechanics. `worktree-desk` calls
it and prints its reply. In this document, backticked/type-level `desk` names are persisted
compatibility identifiers; the product term is **worktree**.
What a session is told is
`ronin_catalogs/behaviours/conditional/worktree-root.md`. This page is the tool-side reference:
what is recorded where, what each operation does to git, and what it refuses.

> The current model is `docs/architecture/worktrees.md`.

## The words, used strictly

A **branch** is a bookmark. A **worktree** is a folder with its own HEAD and index. A
An internal **desk record** is one repository's branch and worktree opened together,
`repo:branch` (`cowork:team/comp/fable`). An **assignment** is what a session is changing — one worktree per
participating repository. A **funnel point** (`dev`, `team/<t>/dev`) is merged into and
never written into. A **candidate** is the throwaway worktree a hand-in is built in.
**Commit** preserves; **hand-in** publishes to the team line; **team promotion** is the
lead's admission to `dev`; `git push` is git's word and nothing else's.

## What is recorded, and where

| Thing | Where | Owned by |
|---|---|---|
| a repository's arrangement | `RONIN_REPO` at its root (`mode`, `working`, `stable`, `desks`, `publish`) | the repository; read by `src/desks/arrangement.ts` |
| a desk's row | `desks` store → `registry/<repo>/<branch>.json` (`DeskRecord`) | `src/desks/registry.ts` |
| an assignment | `desks` store → `assignments/<session>@<team>.json` | `src/desks/registry.ts` |
| the hand-in ledger | `desks` store → `receipts/<repo>/<line>.jsonl`, one line per attempt | `src/desks/receipts.ts` |
| the line's queue | `desks` store → `queues/<repo>/<line>.lock/owner` | `src/desks/queue.ts` |
| desk worktrees | `worktrees` store → `<repo>/<branch>` | `src/desks/desk.ts` |
| team-line worktrees | `worktrees` store → `<repo>/team/<team>/dev` | `src/desks/desk.ts` |
| candidates | `worktrees` store → `.candidates/<repo>/<line>` | `src/desks/hand-in.ts` |

Both stores are under the user root: a parked desk's row is the only thing that says
"this branch is someone's unfinished work"; losing it is how work is dropped on the
floor. `bin/ronin-store desks` and `bin/ronin-store worktrees` resolve them;
`RONIN_WORKTREES_DIR` moves the worktrees wherever the owner keeps them.

A desk's row holds only what git cannot answer: who opened it, its team and assignment,
the explicit source kind/ref/exact SHA and selector,
open or parked, a pending update, the last accepted hand-in, a standing block. Tip,
dirty files, ahead/behind and whether the folder is mounted are read from git at the
moment of asking (`deskStatus`). Nothing here is prose an agent maintains.

## The gate

**`RONIN_REPO` in the repository is the one switch**. `desks=managed`
gives a coding launch its desk, the contract in its brief, and its capability-selected tools;
`desks=none`, or no file, gives none of them and the session starts in the checkout. There
is no install-wide switch. The Campaign's Ronin Worktrees choice defaults the file written for
a new project root (`declareArrangement`, `src/desks/arrangement.ts`). For an existing root,
the editor reads the current publishing mode, owner-named branches, and Worktrees repository choice.
After one exact before/after confirmation it rewrites `RONIN_REPO` directly and atomically
(`PUT /api/project-roots/:name/repo-profile`, `setArrangementProfile`). It performs no
migration or running-Agent reconciliation. A coding launch that gets no desk says why on its receipt (*no desk —
`<root>` has no RONIN_REPO*), and `bin/ronin-doctor` lists every project root's answer.

## Open

`openDesk({repo, session, team, source})` keeps `source` optional: omitted or `dev` uses
the working line, while `team` uses the Team's local review line. The ref is resolved to an
exact commit before create/adopt, recorded independently of the unchanged hand-in line, and
never moves global development. `worktree-desk assign` is the lead-facing CLI over this same
function for a named session; it adds no authorization layer. The operation is refused when the repository is `direct`, has no
`RONIN_REPO`, or sits in a Syncthing share whose `.stignore` does not exclude `.git`;
refused when the requested branch is a funnel point. An explicit `worktree-desk open <repo>`
does not require that repository to already appear on the team's roster. Any Agent can
name any managed repository; the roster only determines which desks birth opens
automatically. Otherwise: the team line is created
from the working line if missing and mounted at its worktree; the desk branch is cut from
the resolved source (or an existing branch remounted — a parked desk, or a leftover, which is adopted
rather than lost); upstream is set to the line; when the home checkout has `node_modules`,
Ronin copies it into a real, private directory in the desk (never a symlink to the live
operator install); the row is written. A remounted desk keeps its existing private
dependency directory. A coding launch calls
`resolveLaunchDesks()` to derive candidate coordinates, normalize each repository, and
dispatch once through `resolveWorktrees()`. `prepareLaunchDesks()` then opens only the
resolved managed rows through `openDesk()` and writes the assignment before the CLI is
spawned; a failure is thrown, and launch does not fall back to a funnel checkout on its own.

## Hand-in

`handIn(repo, branch)`, under the line's lock:

1. record the current line tip (`old`) and whether its mounted worktree has unsaved files;
2. create a fresh detached candidate at current global dev; a candidate a crashed run left
   behind is removed first, never reused;
3. merge the desk into the candidate. A conflict is aborted there, the desk is marked
   blocked, a `conflict` receipt names the files; the line is untouched. The candidate
   starts at current `dev` and takes the accepted line first; when the **line itself**
   conflicts with `dev`, the only place a resolution can live is a desk that already holds
   both — cut from the line (`--source team`) or from `dev`, the other merged in and the
   conflict resolved and committed there. Hand-in recognises such a desk (the line and `dev`
   are both its ancestors) and builds the candidate from `dev` plus that desk alone; any
   other desk gets a `conflict` receipt that names that route;
4. `git update-ref refs/heads/<line> <candidate> <old>` — the compare-and-swap. If the
   line moved meanwhile, rebuild on the new tip (a `stale` receipt each time, up to three);
5. refresh the line's worktree if clean. If it has unsaved files, leave it untouched and
   report that the ref advanced but its working files did not;
6. append the `accepted` receipt; record it on the desk; clear the block.

Hand-in updates no private worktree and writes no pending marker on a sibling. The submitting
Agent's tip is contained in the Team line, but its worktree does not automatically gain other
Team commits. Each Agent chooses when and what to adopt through sync.

## Sync

`syncDesk` resolves `dev` (default), `team` (the desk's shared line), `lead` (a desk owned
by a live Team lead), or an exact `repo:branch` from the desk registry. The source desk
must be in the destination repository. Multiple matching lead desks are reported by name
rather than chosen arbitrarily. Missing sources do not fall back to a different ref.

The selected branch resolves to a SHA once before `adoptLine` runs. Only that committed
revision is merged; unsaved source edits are excluded and the acknowledgement says so.
It reports the source ref/SHA and destination before/after HEAD. A contained commit is a
no-op. A dirty or unmounted destination stays pending; a merge conflict is aborted and
reports the files. Neither changes the destination's files. Resolving the reported commit
belongs on the private worktree. A subsequent sync selects its source afresh from its arguments.
Custody, source refs, and the hand-in line are unchanged. Sync does not promote or certify
private work as reviewed.

Repository verification does not run at any step. `dev` never moves here.

**The lead receives a hand-in notice**. An accepted hand-in, or a
conflict, reaches every lead of the line's team — the 人, `@ronin-lead` on the session —
through `libexec/ronin-house-send`, which enters the same durable inbound message queue:
reviewing the team line
and promoting it to `dev` is the lead's primary job, and the house telling the lead that
its job is waiting is house machinery (the same footing as Koshi's marker and
`work-record update_record --at`), not an agent driving a session. Safe delivery never overwrites a
human draft or presses Enter into a dialog; when it cannot deliver, the queue retains the
notice visibly for mechanical retry and the hand-in output says which happened.

`worktree-desk hand-in <desk> --project <id>` records an explicit canonical Project ID on
an accepted receipt. Acceptance says code was handed in, Project state is unchanged, and
prints the exact `work-record project advance <id> --to LANDING` command. Promotion uses
only that receipt association to prompt the holder to move the Project to Done. Neither
acknowledgement mutates Project state; conflicts and refusals never claim success.

**No lead set: the handing-in session holds the job**. The hand-in
prints `YOU ARE THE LEAD FOR THIS ONE` with the words: review the line, promote when
coherent (`bin/ronin-promote <team>`); a conflict is yours to resolve at your desk. A
record goes on the wipeboard without interrupting anyone. Promotion is not restricted to a
designated lead — the receipt records who ran it — so nothing is ever tied up waiting for a
人 that was never set. A lead is still the better arrangement; it is not a prerequisite.
`src/desks/lead.ts`; `tests/desks-lead.test.ts`.

## Close, park, recover, discard

`closeDesk(repo, branch)` refuses dirty or unintegrated work. Before removing an eligible
worktree it checks every live session's current directory. If a session is in the worktree
or below it, close keeps the desk and tells the caller to notify that session to leave,
then retry. It does not message, relocate, stop, or retry for the caller. Otherwise the
worktree, branch, and desk row are removed. `handoffDesk` changes explicit owners without
moving work. `session_end`, safe live-session Delete, and `--with-session` use the
coordinated end: all assigned worktrees and ownership checks run first, clean Team-contained
worktrees are removed, then the Agent is stopped. An ACCEPTED hand-in is immediately eligible
when its clean tip is contained in the Team line; global-dev promotion and a second manual
close are not prerequisites. Any dirty, unique, pending/rejected, shared, unmounted, or
occupied desk refuses the whole preflight and messages the Agent with exact next actions.
`worktree-desk close <repo:branch> --with-session` validates that named desk, then uses the
same all-assigned-desks transaction so it cannot strand another desk.
Archive remains resumable and refuses open desk custody. Owner-confirmed Hard Delete is a
separate destructive transaction: it preserves quarantine/receipt evidence, then removes
the Agent and every owned desk even when work is dirty or unhanded.

## The queue

One `mkdir` lock per repo + line, holding the pid. Cross-process, because the tool runs
from any session's shell with Ronin up or not. A lock whose pid is dead is stale and is
reclaimed — safe, because a crashed holder leaves nothing half-moved: the candidate is
beside the line and the ref moves by one atomic `update-ref`.

## What the other tracks read

- launch: `deriveAssignment()` (pure candidate planning), `resolveLaunchDesks()` (one
  Worktrees resolution), `prepareLaunchDesks()` (opens resolved managed rows), `Assignment`;
- visibility: `listDesks({session|team|repo})` → `DeskStatus[]`, `readDesk()`,
  `receiptsForDesk()`;
- promotion: `acceptedSince(repo, line, lastPromotedLineSha)` → the receipts a change set
  carries; `ChangeSetReceipt` is the shape it writes;
- the compatibility audit: `RONIN_REPO`, read by `readArrangement()`.

## Tests

`tests/desks.test.ts` — real git in a temp directory, every store overridden: open,
refusals, derived status, hand-in and its receipt, nothing-to-hand-in, adoption with a
dirty overlapping sibling, a conflict and its resolution, close/park/recover/discard, a
two-repo assignment, two hand-ins at once, a dead holder's lock, a stale expected ref, a
candidate left by a crash.
