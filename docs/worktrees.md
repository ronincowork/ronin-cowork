# WORKTREES — desks, hand-in, team promotion: the model and its rulings

> Buildout note, opened 2026-08-27; **decision memo folded in 2026-08-28** (see "The
> decision"). The owner's rulings are marked **ruled** and dated. Where the decision memo
> supersedes an earlier ruling it says so and keeps the earlier text for the record.
> **Moved 2026-08-28 from `ronin-lab/wip/buildouts/` — documentation lives in `docs/`, not `wip/` (owner).**
> Teaching/design page: `ronin-lab/concepts/repo-branch-worktree.html`. Competitive reason:
> `POSITIONING.md` §7.1. Wider health-network audit and implementation sequence:
> `docs/control-surface.md`.

## The concern this answers — ruled 2026-08-27

The single-surface policy exists so that **code is never dropped on the floor.** Agents
stop for whatever reason; six at once, each parked on a private branch, is how a repo grows
orphaned work. Anything below that lets work vanish, or sit somewhere nobody can see, is
wrong. (The decision memo keeps this and answers it differently: not by publishing every
commit, but by making unpublished work *visible and recoverable* — see "Session loss".)

## The one rule to say out loud — ruled 2026-08-28

> **Funnel points are never edited directly.** Not `dev`. Not `team/<xyz>/dev`. Nobody's
> shell sits in either worktree to write. **Anyone who wants to write code checks out
> their team's line and creates their own desk** — their own branch and worktree — and
> publishes back by hand-in. The lead included. Player One included.

The environment makes this the path of least resistance (the launch box opens a desk;
nothing is ever launched into a funnel point), the guard makes it a speed bump (a commit
in a funnel worktree says *open a desk* and how), and the integrator makes it an
invariant (a line advances only by a candidate's compare-and-swap; a hand-in into a dirty
funnel worktree is refused). Three layers, same sentence.

## The words — used strictly

| Word | Means exactly | Not |
|---|---|---|
| **branch** | a bookmark: a name pointing at one commit. Can exist with nothing on disk | a folder, a copy, a place to work |
| **worktree** | a counter: a folder of files with its own HEAD, index and edits, attached to the one `.git` | a branch |
| **desk** | **repository-specific**: one repo's branch **and** the worktree mounted on it, opened together. Identified by repo + branch: `cowork:team/comp/fable`, `services:team/comp/fable`. May be *parked*: branch kept, worktree unmounted (valid — see "Session loss") | a session; a session has one desk *per repo it is changing* |
| **assignment** | what a session is changing: a change set spanning one or more repos, hence one or more desks. `session → assignment → repos[] → desk` — never `session = desk` | |
| **funnel point** | a line that is merged into and never written into: `team/<xyz>/dev`, `dev`. No session is launched at one | a place to work |
| **candidate** | a throwaway integration worktree, detached at the target line's tip, where a hand-in or team promotion is built and gated *before* the line moves | the line itself |
| **`dev`** | the repository-wide common pool **and the live app**: branch `dev` + worktree `~/dohyo/ronin-cowork`, which the service runs from. Moves only by team promotion; restarts when it moves (ruled 2026-08-28: *"dev is live"*) | a place to work; a separate `dev-live` (retired) |
| **`solo/<session>`** | a rōnin session's desk, cut from `dev`, handing in to `dev` | |
| **`master`** | a branch only. Moves by PR from `dev` | a desk |

**How you know a branch has a worktree.** `git worktree list` is the only honest answer.
`git branch` marks `+` for checked-out-elsewhere, `*` for here. A `team/**` or `solo/**`
branch with no worktree is either a **parked desk** (recorded as such, with its owner and
commits-ahead) or a leftover; the team summary shows which.

## The names — ruled 2026-08-28

Git treats `/` in a branch name as a folder, so the path *is* the roll-up:

```
master                 release line — a branch only; moves by PR from dev
dev                    the common pool for the whole repository
team/comp/dev          team comp's integration line
team/comp/fable        a session's desk on team comp
team/comp/wispr        another
solo/rireki            a rōnin session, no team
```

Worktree folders follow the branch path: `~/dohyo/worktrees/team/comp/fable`. Candidates
live beside them, out of the way: `~/dohyo/worktrees/.candidates/team/comp/dev`. Each
desk has its line set as upstream so `git branch -vv` prints `[team/comp/dev: ahead 3]`.

**The hierarchy stays with one team** (decision memo): `team/<xyz>/dev` and `dev` may
often carry the same content, but the extra reference is cheap and the structure is the
same when a second team appears. The team line supplies a combined team state, a
lead/compiler boundary, team gates, a base for new sibling desks, and a place to hold
work before common integration. (This settles the earlier "pass-through by default"
recommendation: the team line is a real stage, advanced by an explicit hand-in.)

Only `dev` and `master` ever reach the remote (ruled 2026-08-20).

## The decision — 2026-08-28, replaces per-commit auto-landing

### Three scopes on a desk, kept distinct

| Scope | What happens | Where it is durable | Who else sees it |
|---|---|---|---|
| **SAVE** | files change in the desk's worktree | nowhere yet — not in git | nobody |
| **COMMIT** | a checkpoint on the desk's private branch; several are normal, partial ones included | in git, on this box | nobody — nothing propagates |
| **HAND IN** | the session deliberately hands its committed range in to the team's line (owner's word, 2026-08-28: *each session hands its submission in to the team lead's desk*) | on the team line, if accepted | the team |

**Commit means preserve. Hand-in means publish.** This gives the agent ordinary git
semantics, keeps private WIP private, and stops the gates running on checkpoints that a
later commit supersedes. It replaces the 2026-08-28 (morning) ruling that every commit
auto-lands; that ruling is retained below under "Superseded".

### Hand-in — mechanical admission, then the line moves atomically

1. **Serialize.** One queue per target line; hand-ins to `team/comp/dev` run one at a time.
2. **Build the candidate** in a clean integration worktree, detached at the line's tip:
   merge the desk tip into it. A conflict is contained here — the line is untouched; the
   hand-in is rejected with the two sides and the files, and the lead adjudicates (ruled).
3. **Mechanical admission only** (BYOIN boundary correction, owner, 2026-08-28). No full
   BYOIN, and not the current ~66-second `--gates` suite either. A hand-in may check
   only what is genuinely near-instant — the merge itself, conflict detection, and any
   invariant specified later that costs nothing. The team line **is allowed to contain
   accepted team work that has not passed full house BYOIN**; it has not entered `dev`.
4. **Advance the line atomically**:
   `git update-ref refs/heads/team/comp/dev <candidate-sha> <tip-seen-in-step-2>` — a
   compare-and-swap; if the line moved meanwhile, the hand-in re-queues against the new tip.
   Then refresh the line's mounted worktree (`git -C $T merge --ff-only team/comp/dev`).
5. **Record the hand-in receipt** — the attribution ledger: desk/session, source tip and
   range, candidate result, resulting team-line SHA. Every accepted hand-in appends one.
6. **Never merge the canonical line first and reset it on failure.** A funnel point never
   holds a half-merged state.

### Team promotion — the one full BYOIN, close to the code and its lead

Promotion of `team/<xyz>/dev` into repository-wide `dev` is the closest shared-code
boundary: the lead still owns the context, knows which desks contributed, and can route a
failure back to the agent that introduced it. So this is where the **full repository
BYOIN runs, exactly once**, on the combined candidate — current `dev` + the team-line tip
— before `dev` moves. It catches formatting, structure, naming, unit, type, UI and the
other bounds while responsibility is still local to the team.

- **Failure leaves `dev` untouched** and returns the named gates plus attribution to the
  lead and team: changed files and contributing sessions, from the ledger.
- **The team-promotion receipt** lists every hand-in receipt since the prior successful
  team promotion. Where a failing gate does not identify the culprit, **replay or bisect the ordered
  hand-in candidates** to find the first failing contribution. The lead then feeds it
  to that session, or reassigns a parked desk.
- **After success, `dev` carries a full-BYOIN receipt for its exact SHA.**

### What runs where — the corrected schedule

| Boundary | Automatic check | Why |
|---|---|---|
| save | none | private |
| commit | none | private; agents may run focused tests as part of their work, but that is not the boundary protocol |
| hand-in → team line | mechanical admission only (merge, conflict, near-instant invariants) | shares work with the team; nothing has entered `dev` |
| **team promotion → `dev`** | **full repository BYOIN, once, on the combined candidate** | the closest shared-code boundary; the lead can attribute a failure |
| `dev → master` | **not the first full check.** CI may verify the exact SHA, but it consumes and preserves the existing receipt; any failure still points through the team/desk ledger | `dev` already carries a receipt for that SHA |
| restart after team promotion | deployment health checks (the app comes up, answers, readouts sane); on failure, automatic revert-and-restart and a DM to the lead | the one failure that can surface *after* `dev` moved |
| maintenance / update / store changes | full *installed-box* BYOIN | it tests a different thing — the machine, not the repo |

**Governing sentence:** hand-in shares work with the team; team promotion proves the team's
combined work is fit for the Ronin-wide `dev` pool. Full BYOIN runs at that second
boundary, close to the code and its responsible lead — not at every step, and not first
at `master`.

### Downward adoption — accepted team state is mandatory, eventual, and respectful

Once a hand-in is accepted, the result is shared team state and must reach every sibling
desk. Adoption is not optional, but it never rewrites files under an agent:

- **Clean sibling** (nothing unsaved): incorporate the new team line immediately.
- **Dirty sibling**: notify immediately — *team line moved, by fable* — mark the update
  **pending** on the desk, touch nothing.
- **Dirty sibling with overlapping files**: notify with the changed files and the incoming
  diff (`git diff HEAD team/comp/dev -- <files>`); worktree untouched. This is the
  cross-purposes catch, at the first possible moment.
- **At the sibling's next safe boundary** — its next commit, or an explicit `desk sync` —
  incorporate the current team line. If it later hands in, its tip is integrated against the
  then-current line in the candidate worktree, where any conflict is contained.
- **The handing-in desk adopts the final accepted result too**, since it may include sibling
  changes or a conflict resolution beyond its original tip.

A sibling's base is therefore never stale for longer than one accepted hand-in (as the owner
required, 2026-08-28: *"I don't want sibling 2 working away for days when the team line
moved"*), and no tool ever writes into a worktree an agent is editing.

### Session loss or close — nothing lost, nothing silently published

- An explicit desk-close action offers to capture unsaved files in a `WIP:` commit on
  the desk branch. Session loss never silently commits or publishes them; it leaves the
  desk visible for recovery.
- Committed but not handed in work becomes a **parked desk**: the branch is kept, the worktree
  may be unmounted. Branch-without-worktree is a valid, recorded state, not a leftover.
- The lead sees: *session gone · N commits ahead · last activity* and chooses **hand in ·
  inspect · reassign · discard**. Discard is explicit; nothing else deletes.
- A desk branch is deleted only when its tip is integrated, archived/recoverable, or
  explicitly discarded. Local commits are not backups; a parked tip needs that policy
  before any cleanup runs.

### Multi-desk sessions are the normal case — addendum, 2026-08-28

`comp_fable` works in `ronin-cowork` and `ronin-services` at once. That is not an edge
case; it is the primary example. The model is **session → assignment → repos[] → desk**.
A desk is repository-specific because everything about it — branch, worktree,
integration line, gates, dirty state, conflicts — belongs to one git repository. The
session and team names are reused across repos for legibility; the desk is identified by
repo + branch:

```
comp_fable
  assignment: roster role data
    cowork    → cowork:team/comp/fable    line cowork:team/comp/dev    ahead 3, clean
    services  → services:team/comp/fable  line services:team/comp/dev ahead 1, dirty, update pending
```

**TEGAMI** already has `repos[]`; each entry carries: repo/root identity, desk branch,
worktree path (or derived handle), upstream team line, ahead/behind, dirty state, pending
team update, last accepted hand-in, blocked reason. **The roster rolls these up under one
session**: fable has two desks; one may be accepted while the other is blocked, and the
roster says so without pretending their filesystem states are one git operation.

**Hand-in has two forms:**

- **hand in one desk** — publish only that repository's committed range, exactly as above.
- **hand in the assignment** — offer the related tips from every participating repo desk as
  one coordinated unit.

**Coordinated promotion protocol.** Git cannot advance refs in two repositories atomically, so
the protocol makes an interrupted promotion *visible and finishable* rather than silently
half-landed:

**Hand-ins accumulate independently on each team line** — mechanical admission only,
per repo (BYOIN boundary correction). The coordinated boundary is the **team → dev
promotion**:

1. For every repo in the assignment: build its candidate — current `dev` + that repo's
   team-line tip.
2. Run each repo's **full BYOIN** on its candidate, then the **combined
   install/compatibility protocol** across the candidates. `cowork` and `services` can
   each pass alone while the installed pair fails; this is where that is caught, *before
   either `dev` line moves*.
3. Write a **change-set receipt**: for each repo, the expected old ref, the candidate ref,
   and the hand-in receipts it carries. The receipt is the recovery *and attribution*
   state.
4. Advance each canonical `dev` ref by compare-and-swap, in receipt order. If any
   preparation or gate failed, advance none. If an advance races after preparation (the
   line moved), **stop** — do not touch the remaining refs — and rebuild from the current
   tips; the receipt shows exactly which refs moved and which did not.
5. Mark the receipt complete. Until then the roster shows the assignment as *landing:
   cowork done, services pending*.

**Downward flow is per repo.** An accepted `cowork` change becomes pending only on sibling
`cowork` desks; an accepted `services` change only on sibling `services` desks. The
session-level roll-up shows both.

### The pattern composes upward

```
files → commit → session branch → HAND IN → team/<xyz>/dev → TEAM PROMOTION → dev → GIT PUSH → PR → master
```

- The **session** decides when its desk work is coherent for the team (hand-in).
- The **lead or compiler** decides when the combined team work is coherent for `dev`
  (team promotion — same candidate/gate/compare-and-swap, full BYOIN, target `dev`).
- The **release process** decides when `dev` becomes `master` (Git push, PR, CI, owner merge).
- **`dev` is live** (ruled 2026-08-28). A successful team promotion ends by restarting the
  service from the `dev` worktree and running deployment health checks. There is no
  separate pinned checkout and no promote step: by the time work is on `dev` it has
  passed the full BYOIN, so it should fire. Rollback is a **revert**, landed on `dev`
  through the same team-promotion door, not a pin.

## The rules — ruled, with what the decision changed

**Encourage, don't mandate** (owner, 2026-08-28: *"we don't make mechanical mandates, we
encourage agent behaviours"*). The environment makes the desk the path of least
resistance (the launch box opens one; the brief says *save, commit, hand in*). The agent
still chooses; a shell that wanders into a funnel point meets a speed bump — *this is a
funnel point; open a desk* — not a wall. The only hard refusals protect the shared lines:
a hand-in is rejected if its candidate conflicts, a team promotion if its candidate fails BYOIN, and a line never moves except by a passed
candidate.

1. **Every team gets a `team/<xyz>/dev` line regardless** (ruled 2026-08-27; the memo
   confirms it stays with one team).
2. **Funnel points are merged into, never written into** (ruled). No session is launched
   at one.
3. **A lead who edits code opens its own desk** like any other session (ruled).
4. **A desk opens at once; no clock, no approval wait** (ruled: *"yikes"*). The lead is
   told what the session intends to touch (the claim) and may redirect afterwards.
5. **Save is private. Commit is private. Hand-in publishes** (decision memo). A session
   may commit as often as it likes; nothing leaves the desk until it hands in.
6. **A hand-in or team promotion is accepted or rejected whole**, on a candidate, and the line advances
   atomically or not at all (decision memo). A hand-in is rejected only for a conflict
   (the lead adjudicates — ruled) or a near-instant invariant; a team promotion is rejected
   by full BYOIN, with attribution from the ledger (BYOIN boundary correction).
7. **Accepted team state flows down** to every sibling: immediately when clean, at the
   next safe boundary when dirty, always with an immediate notice (decision memo; meets
   the owner's 2026-08-28 requirement).
8. **The lead manages the local seam above**: team promotion to `dev`. The release
   process owns Git publication and the PR to `master`. The earlier separate `dev-live`
   promotion is retired; `dev` itself is live.
9. **A `team_compiler` is optional** (ruled): a session whose only job is the queue,
   the candidates and the adjudications. Without one, the lead does it.
10. **The lead gets a regular mechanical summary** (ruled), now including parked desks,
    pending updates, and commits ahead but not handed in per desk.
11. **A desk belongs to an assignment on one repository, never to a session as such**
    (decision memo + addendum). Non-code sessions need no desk. A multi-repo assignment —
    the normal case — has one desk per repo, rolled up under the session on the roster,
    handed in one at a time or as a coordinated unit with a receipt.

### Superseded — kept for the record

- *Every session commit auto-lands on the team line* (ruled 2026-08-28, morning) and the
  *dirty-sibling push-down* that went with it. Replaced the same day by the three-scope
  model above. Reasons: gates ran on superseded checkpoints; private WIP was public by
  construction; the merge-then-reset macro could leave a funnel point in a failing state;
  a loose post-commit hook is not a serialized, atomic integration.
- *Team line as a pass-through by default* (assessment, 2026-08-28). Replaced: the team
  line is a deliberate stage advanced by hand-in.
- *A branch without a worktree is always a leftover.* Replaced: it may be a parked desk.
- *`--gates` on every hand-in, full BYOIN on team promotion, full again at `dev → master`
  and at promote* (decision memo, first draft, 2026-08-28). Replaced the same day by the
  BYOIN boundary correction: full repository BYOIN once, at team → `dev`; mechanical
  admission at hand-in; `dev → master` consumes the receipt; promote runs health checks.

## Open — owner to rule

1. **When the environment prompts a hand-in.** Proposed: at each DONE leg on the
   ladder, and at close — a prompt to the session, not an automatic hand-in, since only the
   session knows when its work is coherent.
2. **Parked-desk retention.** Proposed: a parked desk is listed on the roster until the
   lead acts; nothing ages out on its own.
3. **Team-promotion cadence — guidance, not a clock** (owner asked 2026-08-28: *"frequent, but
   not too frequent — what is the guidance?"*). The lead's call, triggered by state.
   Costs of promoting: one full BYOIN and a restart of the live app. Costs of waiting: a
   longer ledger (a bisect walks more candidates), drift from `dev` and other teams,
   unproven work sleeping on the team line. In order of strength:
   1. **When the house needs it** — another team, a rōnin desk, or the owner is waiting
      on something this team landed. Overrides everything.
   2. **At coherent points** — a leg DONE across the team's desks, a feature whole.
   3. **Before the ledger gets expensive** — about five hand-ins since the last team
      promotion.
   4. **Before the lead goes away** — end of a working stretch; nothing sleeps on the
      team line overnight (the orphan rule, one level up).
   5. **Never per hand-in, never on a fixed timer.**
   The team summary *prompts* (*5 hand-ins since last team promotion · 4 h · another team
   touched `public/js/roster.js`*); the lead promotes. With one team: at least once per working
   stretch, and whenever the summary says five.

## Where BYOIN runs

BYOIN is not a hook (`docs/test-protocols.md:28`); it runs against the
worktree it is run in. Under the corrected schedule it runs **once per promotion into
`dev`**, in `dev`'s candidate (current `dev` + team-line tip), triggered by the lead or
compiler. A rōnin's `solo/<session>` pushes straight to `dev`, so its push *is* that
boundary and carries the full BYOIN. `dev`'s candidate worktree needs the headless
browser so the render gates are real results. See "What runs where" above for every
other boundary — none of them runs the repository BYOIN.

## The macros (TEJUN) — to cut

Names are placeholders; KOTOBA settles the words. `L=team/comp/dev`,
`T=~/dohyo/worktrees/team/comp/dev` (the line's mounted worktree),
`C=~/dohyo/worktrees/.candidates/team/comp/dev` (its candidate).

- **`desk open`** — `git fetch origin && git worktree add ~/dohyo/worktrees/team/comp/<s>
  -b team/comp/<s> $L`; `git branch --set-upstream-to=$L team/comp/<s>`; node modules
  from a shared store; copy the fixed list of gitignored files; record the branch on the
  letter (`repos[].branch`); post the claim on the team wipeboard. Refuses if the repo's
  `.git` is inside a Syncthing share (§0 below).
- **`hand_in`** — the session's deliberate publish. Enqueue on `$L`'s queue; when its
  turn: `old=$(git rev-parse $L)`; `git worktree add --detach $C $old` (or reset an
  existing one); `git -C $C merge --no-edit team/comp/<s>` → conflict? `merge --abort`,
  reject with the two sides, DM the lead and the session; **no BYOIN here** — mechanical
  admission only; →
  `git update-ref refs/heads/$L $(git -C $C rev-parse HEAD) $old` → if the swap fails
  (line moved), re-queue; then `git -C $T merge --ff-only $L`; append the hand-in
  receipt `{session, desk, source_range, candidate, team_line_sha}` to the team's ledger;
  then downward adoption
  (below) for every desk on the team, the desk that handed in included.
- **`desk sync`** — adopt the current line into a desk: `git merge --no-edit $L` in the
  desk's worktree. Runs automatically for a clean desk on every accepted hand-in, and at any
  desk's next commit if an update is pending; runnable by hand. Never runs into a dirty
  worktree; on a dirty desk it records *pending* and DMs (files + diff if overlapping).
- **`desk close`** — an explicit close offers a `WIP:` commit for anything unsaved; it
  never silently commits on session loss. If commits are ahead of `$L`, the
  desk is **parked** (worktree may be unmounted, branch kept, recorded with owner, ahead
  count, last activity) and the lead is told with the four choices; the branch is
  deleted only after hand-in, archive, or explicit discard.
- **`assignment hand-in`** — the session's coordinated form: a `hand_in` per repo in its
  `repos[]`, each mechanical admission only, landing on that repo's team line. Nothing
  cross-repo is checked here; that belongs to team promotion.
- **`team promotion`** (`ronin-promote`) — the one full boundary. Per repo: candidate = current `dev` + team-line
  tip, in `dev`'s candidate worktree; **full `bin/ronin-byoin`** there; for a cross-repo
  assignment, then the combined install/compatibility protocol across the candidates;
  write the team-promotion receipt (`{repo, expected_old, candidate, hand_in_receipts[]}`);
  compare-and-swap each `dev` ref in receipt order, stopping on the first race; mark
  complete; `dev` now carries a full-BYOIN receipt for its exact SHA; **then restart the
  service from the `dev` worktree and run the deployment health checks** — if they fail,
  `team revert` runs automatically and the lead is DMed. **On BYOIN failure:** `dev`
  untouched; report the named gates, changed files and contributing sessions from the
  ledger; if the gate does not name the culprit, `team bisect` replays the ordered
  hand-in candidates to find the first failing contribution. `team resume` finishes or
  rebuilds an interrupted promotion from its receipt. Lead or compiler.
- **`team bisect`** — rebuild the team line's candidates one hand-in at a time from the
  last good team promotion, running full BYOIN at each step until it fails; report the desk,
  session and range. The lead feeds it to that session or reassigns a parked desk.
- **`team revert`** — the rollback, since `dev` is live: a revert commit of the last team
  promotion's range, landed on `dev` through the same team-promotion door (its full BYOIN passes
  quickly for a revert), then restart and health checks. Run automatically when the
  post-restart health checks fail; runnable by the lead when a passed change misbehaves
  live. The reverted range stays in the ledger, attributed, for the session to fix.
- *`promote` and the `dev-live` worktree are retired* (ruled 2026-08-28). The existing
  `~/dohyo/ronin-cowork-dev-live` worktree is removed once the service is pointed at the
  `dev` worktree.
- **`team summary`** — no model; `git worktree list`, `git branch -vv --list
  'team/comp/*'`, `git status --short | wc -l` per desk, last-commit age, session alive
  (Koshi), last promotion result, **pending update** flags, **parked desks** with ahead counts,
  the overlap check, leftovers. On a cadence by DM or wipeboard; the team page's natural
  content.

## Claims — "I am working on this, nobody touch it"

Git has no lock (Perforce/Subversion had one; git dropped it on purpose; `git lfs lock`
is for binaries and is not installed here). Teams partition by task, integrate small and
often, and let the merge detect the rest. Ronin's version, from parts it has:

- **The claim is the desk request**, posted on the team wipeboard at `desk open`, taken
  off at `desk close`. Information, never a lock.
- **The overlap check**: `git diff --name-only $L...team/comp/<s>` per desk, intersected
  across desks and claims by the summary; both sessions and the lead told before anyone
  hands in. Same-file is a warning; same-file-and-both-dirty is what the lead wants first.
- Under the decision, overlap is *also* caught at every accepted hand-in by the downward
  notice with files and diff.

## Surfaces that change

Two audiences (owner): developers may want controls; vibe coders do not care. Every
surface gets a default that needs no understanding, and at most one visible control.

| Surface | Becomes |
|---|---|
| **Team roster** (`project_root`, `repos`, `branch`) | `branch` defaults to `team/<xyz>/dev`; creating a team creates the line and its worktree; `project_root` stays the identity (what to read, what to recall) |
| **New session box** | with a coding assignment on a repo: opens a desk cut from the team line; one control — *own desk · plain root* — pre-answered. Non-code sessions get no desk |
| **Project roots** | `dir` stays the repo's home checkout; a desk is a derived dir; `read` and `memory` still resolve from the root |
| **TEGAMI** | `repos[]` = one entry per desk: repo/root, desk branch, worktree handle, upstream line, ahead/behind, dirty, pending update, last accepted hand-in, blocked reason; plus the assignment's receipt state while a coordinated promotion is landing |
| **Player One** | launched onto `solo/player_one` if it will touch code; otherwise no desk |
| **Briefs** | one line for every coding role: *save is yours, commit is yours, hand-in publishes — hand in when it is coherent for the team; you will be told what your siblings handed in* |
| **Koshi / roster** | desk, ahead-not-handed-in, pending update, last hand-in; parked desks listed with owner and choices |
| **`ronin-doctor`** | the Syncthing check (§0) |

## What it costs — stated

- Node modules per desk (shared store); gitignored files copied at open.
- A candidate worktree per target line, kept between admissions; the queue is serial per
  line. Hand-ins are near-instant (merge only), so six desks handing in at once barely
  queue; the full BYOIN cost is paid once per team promotion.
- A ledger of hand-in receipts per team line, and a bisect that can cost several full
  BYOIN runs when a gate fails without naming its culprit — paid rarely, by the lead.
- Parked desks accumulate until the lead acts — visible on the roster, by design.
- The agent must remember to hand in. The ladder prompts at DONE legs and at close (open
  ruling 1); the summary shows *ahead, not handed in* so forgotten work is seen, not lost.
- `dev` is live, so every team promotion restarts the app the owner and every session use.
  Tiles survive (tmux owns them); the browser reloads. Promotions are gated and deliberate,
  so this is a few times a day, chosen by the lead — not on every commit.
- BYOIN proves the repo, not the runtime. A passed change can still misbehave with real
  stores and sessions; the health checks and `team revert` are the answer, and they act
  *after* `dev` moved, which is the one place this design accepts a visible failure.

## §0 · Precondition found on the box — 2026-08-28

`ronin-cowork/.stignore` excludes only `node_modules`: the working files **and `.git`**
are two-way synced with the Mac (as documented in the host's Syncthing README). `ronin-lab`'s `.stignore`
says why that is dangerous and excludes `.git`. Consequences: some of today's "collisions"
are the Mac's older copy coming back (it happened to this note twice); worktree metadata
holds absolute paths, so desks and a synced `.git` cannot coexist.

**Fix before building:** add `.git` to `ronin-cowork/.stignore` on every machine; keep
`~/dohyo/worktrees/` outside any share (it is).

**The Mac's view — a pinned worktree, synced receive-only** (owner asked for exactly
this): `git worktree add --detach ~/dohyo/views/master master`, re-pinned after each
`dev → master` merge; share it with `.stignore` = `.git` and the Mac side **Receive
Only**. Same for `dev` if wanted. Never a synced checkout with `.git`.

**Third parties:** `ronin-doctor` checks *project root inside a Syncthing share with
`.git` not ignored*; `desk open` refuses on it; Atarashi offers the pinned view with a
stock `.stignore` (`.git`, `node_modules`); the install guide says: the server is the
home, other machines get a view, never a checkout.

## Cold assessment — retained

- Managed branch + worktree as a Ronin desk is sound (trunk-based development with a real
  merge queue) and stays hidden by default from users who do not care about git.
- A desk belongs to a coding assignment on a repository, not to every session.
- Never mutate a dirty sibling worktree between commits; awareness by notice, adoption at
  a safe boundary.
- Integration needs a serialized queue, candidate worktrees, gates before canonical
  movement, and atomic compare-and-swap ref updates — not a loose post-commit merge/reset.
- Local commits are not backups; parked tips need the recovery policy before cleanup.
- Convention gives the author the first go at a conflict; the house has the lead
  adjudicate (ruled). Stated once; stands.
- **Build the whole vertical lifecycle before exposing the feature** — and (owner,
  2026-08-28) **no staged sequencing**: cross-repo, receipts, restart and revert included
  in the first dogfood; scale back afterwards only if it has to be. The local act is a
  **hand-in** (`hand_in`); `push` is git's word only — open, save, commit,
  hand in, adopt, park, recover, team promotion, restart, revert — even if it is constructed behind a flag
  in smaller pieces.

## Where this stops short of Orca — on purpose

Orca puts the worktree at the centre of the screen. The house's person, and its clients,
do not think in branches and must not be made to. Everything above is a macro and a
roster line: a desk opens with the session, *hand in* is a word in the brief and a button,
the roster says what is ahead, pending, parked or blocked. No diff panel.
