# Desks — the state and hand-in floor

The mechanics under `tejun-desk`. What a session is told is
`ronin_session_boot/routine/ronin_worktrees/WORKTREES.md`. This page is the tool-side reference:
what is recorded where, what each operation does to git, and what it refuses.

> The current model is `docs/worktrees.md`; the network around it is
> `docs/control-surface.md` beside it.

## The words, used strictly

A **branch** is a bookmark. A **worktree** is a folder with its own HEAD and index. A
**desk** is one repository's branch and worktree opened together, `repo:branch`
(`cowork:team/comp/fable`). An **assignment** is what a session is changing — one desk per
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
open or parked, a pending update, the last accepted hand-in, a standing block. Tip,
dirty files, ahead/behind and whether the folder is mounted are read from git at the
moment of asking (`deskStatus`). Nothing here is prose an agent maintains.

## The gate

**`RONIN_REPO` in the repository is the one switch** (owner, 2026-08-29). `desks=managed`
gives a coding launch its desk, the contract in its brief, the desk actions and the tools;
`desks=none`, or no file, gives none of them and the session starts in the checkout. There
is no install-wide switch. The Campaign's Ronin Worktrees choice defaults the file written for
a new project root (`declareArrangement`, `src/desks/arrangement.ts`). For an existing root,
the editor reads the current publishing mode, owner-named branches, and Worktrees repository choice.
After one exact before/after confirmation it rewrites `RONIN_REPO` directly and atomically
(`PUT /api/project-roots/:name/repo-profile`, `setArrangementProfile`). It performs no
migration or running-Agent reconciliation. A coding launch that gets no desk says why on its receipt (*no desk —
`<root>` has no RONIN_REPO*), and `bin/ronin-doctor` lists every project root's answer.

## Open

`openDesk({repo, session, team})` — refused when the repository is `direct`, has no
`RONIN_REPO`, or sits in a Syncthing share whose `.stignore` does not exclude `.git`;
refused when the requested branch is a funnel point. Otherwise: the team line is created
from the working line if missing and mounted at its worktree; the desk branch is cut from
the line (or an existing branch remounted — a parked desk, or a leftover, which is adopted
rather than lost); upstream is set to the line; `node_modules` is linked from the home
checkout when present; the row is written. Idempotent. A coding launch calls
`resolveLaunchDesks()` to derive candidate coordinates, normalize each repository, and
dispatch once through `resolveWorktrees()`. `prepareLaunchDesks()` then opens only the
resolved managed rows through `openDesk()` and writes the assignment before the CLI is
spawned; a failure is thrown, and launch does not fall back to a funnel checkout on its own.

## Hand-in

`handIn(repo, branch)`, under the line's lock:

1. the line's mounted worktree must be clean — a funnel point is never written into —
   else `REFUSED` with the files;
2. a fresh detached candidate at the line's tip (`old`); a candidate a crashed run left
   behind is removed first, never reused;
3. merge the desk into the candidate. A conflict is aborted there, the desk is marked
   blocked, a `conflict` receipt names the files; the line is untouched;
4. `git update-ref refs/heads/<line> <candidate> <old>` — the compare-and-swap. If the
   line moved meanwhile, rebuild on the new tip (a `stale` receipt each time, up to three);
5. `git reset --hard` the line's worktree to the line. Not `merge --ff-only`: `update-ref`
   on a checked-out branch has already moved that worktree's HEAD, leaving the old tree in
   its index;
6. append the `accepted` receipt; record it on the desk; clear the block.

Then, outside the lock, downward adoption for every desk on the line, the handing-in desk
included: a clean, mounted desk merges the line now (`adopted`); a dirty or unmounted one
gets a `pending` row with the overlap — line-changed files it also has unsaved — and its
files are not touched (`pending` / `pending_overlap`); a clean desk whose commits conflict
with the line is left as it is (`conflict`), to be contained at its own hand-in.

No BYOIN runs at any step. `dev` never moves here.

**The lead is told, dial or no dial** (owner law, 2026-08-28). An accepted hand-in, or a
conflict, reaches every lead of the line's team — the 人, `@ronin-lead` on the session —
through `libexec/ronin-house-send`, which enters the same durable inbound message queue:
reviewing the team line
and promoting it to `dev` is the lead's primary job, and the house telling the lead that
its job is waiting is house machinery (the same footing as Koshi's marker and
`write_tegami --at`), not an agent driving a session. Safe delivery never overwrites a
human draft or presses Enter into a dialog; when it cannot deliver, the queue retains the
notice visibly for mechanical retry and the hand-in output says which happened.

**No lead set: the handing-in session holds the job** (owner law, 2026-08-28: *"the
fallback is the agent handing in — it has to work end to end with no lead"*). The hand-in
prints `YOU ARE THE LEAD FOR THIS ONE` with the words: review the line, promote when
coherent (`bin/ronin-promote <team>`); a conflict is yours to resolve at your desk. A
record goes on the wipeboard without interrupting anyone. Promotion is not restricted to a
designated lead — the receipt records who ran it — so nothing is ever tied up waiting for a
人 that was never set. A lead is still the better arrangement; it is not a prerequisite.
`src/desks/lead.ts`; `tests/desks-lead.test.ts`.

## Close, park, recover, discard

> **Park is retired (owner, ruled 2026-08-30 — `docs/worktrees.md` § Hand in or close).**
> A desk is handed in or closed; a desk always has a living owner; ending a session checks
> for desks it solely owns. This section describes the code as it still is until the
> lab's DESK_OWNERSHIP build-out lands: `park`, `parkedDesks` and
> `recoverDesk` go; `close` off the line takes `--yes` and receipts the loss; hand-off
> and add-owner replace recover.

`closeDesk(repo, branch, {unmount})`: unsaved files → a `WIP:` commit on the desk; if the
tip is already reachable from the line the worktree is removed, the branch deleted and the
row removed (`deleted`); otherwise the desk is `parked` — row kept with `parked_at`, branch
kept, worktree removed only when asked. `parkedDesks()` is the lead's list.
`recoverDesk(repo, branch, session)` remounts a parked desk for a session — the lead's
"reassign". `discardDesk(repo, branch)` is the one path that deletes an unintegrated tip,
and the tool demands `--yes`.

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
