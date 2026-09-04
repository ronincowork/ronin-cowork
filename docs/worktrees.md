# Ronin Worktrees

Ronin Worktrees is an Agent capability applied independently to each repository in an
assignment. It gives an enabled coding Agent a private Git worktree, a private branch, and
the commit → hand-in → team-promotion workflow. Repositories outside that combination use
their ordinary checkout and Git workflow.

Three keys carry the whole idea:

- **What it does:** isolated working folders and branches keep parallel Agents from
  colliding in the same files.
- **When it works:** both sides must say yes — the repository's Project Root enables
  Worktrees, and the Agent carries the Worktrees Routine.
- **The tradeoff:** work leaves the private worktree through the managed path — commit,
  hand-in, and the Team lead's merge — rather than landing directly on the shared branch.

## Resolution model

Two facts determine the result for each repository:

| Agent carries Ronin Worktrees | Repository enables Worktrees | Result |
|---|---|---|
| no | no | Use the repository checkout and ordinary Git. |
| no | yes | Use the checkout; repository metadata remains passive for this Agent. |
| yes | no | Use the checkout; the Agent's capability does not override the repository. |
| yes | yes | Use the Agent's managed branch and worktree. |

The Agent capability is a cascade: the Campaign supplies the default, a saved Team owns a
complete override, and the New Agent form may override individual Routine answers for that
Agent. The resolved `ronin_worktrees` answer is fixed at birth. Repository applicability
comes independently from each Project Root's `RONIN_REPO`; changing an Agent answer never
changes a repository profile. Resolution is per repository, so one assignment may contain
both managed worktrees and direct checkouts.

`src/worktrees-resolution.ts` owns the pure 2×2 decision. Its input contains the resolved
Agent capability, normalized repository applicability, checkout location, branch profile,
and any proposed managed coordinates. It returns each repository's `managed` or `direct`
mode, effective location, reason, and provenance. It does not read Campaign, Team, session,
environment, filesystem, or Git state.

## Repository profile

The Project Root editor presents the setting as **Worktrees**:

- **Use Ronin Worktrees** enables managed worktrees for capable Agents.
- **Use the checkout** keeps Agents in the repository checkout.

The same profile shows the repository workflow and branches:

- `mode=reviewed|direct`
- `working=<branch>` for a reviewed repository
- `stable=<branch>`
- Worktrees enabled or disabled

Saving a profile changes metadata only. It does not create, delete, rename, check out, or
move branches and worktrees. The Campaign setting **New project roots use Worktrees?** is
only the initial value written when a Project Root is added; the Project Root profile is
authoritative afterward.

On disk, `RONIN_REPO` currently retains `desks=managed|none` as compatibility storage.
`src/desks/arrangement.ts` is the boundary that parses that spelling and exposes the domain
answer as `worktrees: enabled|disabled`. Other consumers must not compare `desks=` or parse
`RONIN_REPO` independently.

## Launch and assignment

`src/launch-desks.ts` is the production consumer of the resolved answer:

1. Assignment planning proposes repository-specific managed coordinates.
2. `arrangementWorktreesInput()` normalizes each repository profile.
3. `resolveWorktrees()` runs once across the assignment.
4. Launch preparation opens only the rows resolved as `managed`.
5. The launch brief names every resolved location: the opened Worktree for a managed row,
   or an explicit instruction to edit directly in the repository checkout for a direct row.

A managed launch never silently falls back to a shared funnel checkout when opening its
worktree fails. The launch is refused with the reason. Direct repositories remain direct
and are not represented as missing desks. The Agent does not ask `tejun-desk` to decide
again; the 2×2 result is already in its brief.

An assignment can span several repositories. A desk is the repository-specific internal
record joining a session, branch, worktree, and integration line. The user-facing capability
and Project Root setting are called Worktrees; **desk** remains internal vocabulary where
that larger coordination record is meant.

## Working and integration lines

Reviewed repositories use these Git roles:

```text
team/<team>/<session>  private Agent branch and worktree
team/<team>/dev        team integration line
dev                    repository-wide integration and live line
master                 stable/release line where configured
```

Rōnin sessions use `solo/<session>` and hand in directly to `dev`. Branch names come from
the repository profile; tools do not assume that every repository uses `dev` and `master`.

Funnel points such as `team/<team>/dev` and `dev` are integration targets, not editing
worktrees. A coding session works in its resolved private worktree.

## Save, commit, hand-in, and promotion

| Boundary | Meaning | Verification |
|---|---|---|
| Save | Uncommitted files in one worktree. | None. |
| Commit | Private checkpoint on the Agent branch. | Focused development checks as useful; no boundary suite. |
| Hand-in | Publish committed work to the team line through an integration candidate. | Merge/conflict and near-instant admission checks only. |
| Team promotion | Combine the team line with `dev`. | Candidate construction, reference movement, restart and health. |
| `dev` → stable | Release through the configured release path. | `npm run verify` in GitHub. |

Commit preserves private work; hand-in publishes it to the team. Hand-in is serialized per
target line, builds in a disposable candidate worktree, and advances the line with a
compare-and-swap only after admission succeeds. Receipts record the source, candidate,
resulting line, and contributing session.

When a team line advances, clean sibling desks adopt it immediately. Dirty siblings retain
their files and receive a pending update; they adopt at their next safe boundary or explicit
`tejun-desk sync`. The handing-in desk also adopts the accepted team state.

Team promotion builds the combined candidate, advances `dev` by compare-and-swap,
restarts the live service, and performs deployment health checks. Failed post-restart
health triggers the promotion recovery path and remains visible in its receipt.

## Desk lifecycle and recovery

The current desk tools can open, inspect, synchronize, hand in, close/park, recover, and
explicitly discard repository desks. A branch without a mounted worktree is represented as
parked recovery state. The registry and receipts keep that state visible; no lifecycle
operation silently deletes an unintegrated branch or user files.

Use `tejun-desk status --assignment` to inspect the current assignment and `tejun-desk
receipts` to inspect publication history. `tejun-desk discard --yes` is the explicit path
that abandons an unintegrated desk. Funnel recovery is separate: dirty integration
worktrees are preserved to named recovery refs and receipts before cleanup.

## Where this is going (ruled 2026-09-04)

The owner's model for how worktrees stay clean as sessions are born and retire. The plan
and its build order are in the lab (`ronin-lab/plans/WORKTREE_LIFECYCLE.md`, with the
two-mode architecture in `plans/REPOSITORY_WORK_MODES.md`); the public explanation is the
*Checkouts and Worktrees* explainer on ronincowork.com. This section is the short form for
anyone changing the code below.

- **Two truths per repository.** Local `working` (`dev`) is the sole authority for accepted
  code: everyone promotes to it, everyone cuts from it. Remote `stable` (`master`) is
  released code and moves only by pull request. Remote `dev` is pass-through for the PR and
  nothing reads it back. Local `master` does not exist on the box; nothing read it.
- **Everything else is on loan.** Team lines are ephemeral queues: reset to `dev` after
  every promotion, deleted when the team retires, never on a timer. Desk branches are
  private checkpoints. Candidates are throwaway. Each has an owner, a recorded base, and a
  place it hands in to.
- **An Agent sees three verbs.** Get a worktree (`open`, cut from local `dev`, never from a
  team line), update it (`sync`, merges local `dev`; `status` reports lag, and 20 commits
  behind is a notification, not a block), hand it in (`hand-in`; the candidate is built from
  current `dev` plus the team delta plus the desk delta, so the line is brought current by
  the hand-in itself). Birth, retirement, ledgers and audits never appear in a brief beyond
  "hand in or close before you go".
- **Honey, not sticks.** No refusals on Agents beyond what git itself cannot do (a
  conflict, a lost compare-and-swap). Where a check remains it tells and does not block.
- **The house closes what it opens.** `open` records what it creates; hand-in removes its
  candidate; promotion resets the team line and settles desks made redundant by it; session
  close settles that desk; team retirement settles the line; startup finishes an
  interrupted transaction from the ledger. No cleanup chores for Agents or the owner.
- **The house also absorbs junk it did not make.** `ronin-desk-audit` (read-only, six
  invariants, exit code) and `ronin-desk-settle --dry-run | --yes` (the reconciler: settles
  contained refs, rows with no worktree, folders with no row, abandoned candidates; lists
  anything with unique commits and never deletes it unasked). House-run and owner-run, never
  an Agent assignment, no jurisdiction over a checkout repository's git.
- **One rolling `dev → master` PR.** A promotion makes sure one exists; later promotions
  join it and are each named in its evidence.
- **Desk runtime is its own by default.** A Ronin-created desk gets its own visible
  dependency location, shown in status, instead of a hidden symlink into the primary
  checkout. That removes the surprising coupling that emptied the operator's install on
  2026-09-04 without limiting what an Agent may do in its desk.

Today's leftover refs, registry rows and folders across the repositories are deliberately
untouched: they are the fixture the audit and settle tools are proven against. Nothing is
pruned by hand.

## Invariants for contributors

- Resolve Agent capability and repository applicability once; consumers dispatch from the
  typed result without re-deciding it.
- Keep `RONIN_REPO` parsing and `desks=` compatibility spelling inside the arrangement
  boundary.
- Do not derive managed coordinates from ambient session or Team state inside the resolver.
- Preserve input order and retain direct repositories in resolution results.
- Never infer one repository's applicability from the assignment's primary repository.
- Keep Project Root controls thin: they edit the repository profile but do not implement
  launch, branch, worktree, or promotion policy.
- Do not edit funnel-point worktrees directly.
- Run `npm run verify` when the repository needs a TypeScript and behavior-test verdict.
- Do not delete worktrees, branches, registry rows, receipts, or recovery state implicitly.

## Executable coverage

The focused contract is covered by:

- `tests/worktrees-resolution.test.ts` for the four resolution cells, mixed assignments,
  missing managed coordinates, edit/commit behavior, and hostile inherited Git variables;
- `tests/arrangement-declare.test.ts` and `tests/project-root-profile-create.test.ts` for
  profile normalization, validation, persistence, and Project Root transport;
- `tests/launch-desks.test.ts` for the single production consumer and managed/direct launch
  behavior;
- `tests/desks.test.ts` and `tests/desk-state.test.ts` for worktree lifecycle, registry,
  synchronization, recovery, and state reporting;
- promotion tests for candidates, receipts, recovery, and atomic line movement.
