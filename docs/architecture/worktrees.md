# Ronin Worktrees

Ronin Worktrees is an Agent capability applied independently to each repository in an
assignment. It gives an enabled coding Agent a private Git worktree, a private branch, and
the commit → hand-in → team-promotion workflow. Repositories outside that combination use
their ordinary checkout and Git workflow.

Three keys carry the whole idea:

- **What it does:** isolated working folders and branches keep parallel Agents from
  colliding in the same files.
- **When it works:** the repository's Project Root declares Worktrees (`desks=managed` in
  `RONIN_REPO`). The Agent needs no switch; it is told the folder is a worktree root.
- **The tradeoff:** work leaves the private worktree through the managed path — commit,
  hand-in, and the Team lead's merge — rather than landing directly on the shared branch.

## Resolution model

One fact determines the result for each repository, its own `RONIN_REPO`:

| The Workspace Folder declares | Result | The page the Agent is pointed at |
|---|---|---|
| `desks=none`, or no `RONIN_REPO` | a **checkout**: work on its current branch with ordinary Git; announce files; no hand-in | `ronin_catalogs/behaviours/conditional/checkout.md` |
| `desks=managed` | a **worktree root**: the Agent's managed branch and worktree, commit, hand-in, the lead's promotion | `ronin_catalogs/behaviours/conditional/worktree-root.md` |

There is no Agent-side arrangement switch. The birth packet teaches both approaches and
names each selected repository's arrangement; `worktree-desk open <repo>` names the route
for a repository encountered later. The worktree capability is available to every Cowork Agent
so later managed work needs no new loadout. Resolution remains per repository, so one
assignment may contain both a worktree root and a checkout.

New Agent keeps **Born in** separate from **Workspaces**. Workspaces lists every registered
Workspace Folder, defaults Born in to selected, and allows that default to be removed.
Before birth, launch uses an existing checkout for every selected direct repository and
opens a worktree for every selected managed repository. Born in alone does not allocate a worktree.

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
and are not represented as missing worktrees. The Agent does not ask `worktree-desk` to decide
again; the 2×2 result is already in its brief.

An assignment can span several repositories. A worktree is the user-facing repository work
location. Internally, the persisted `desk` record joins a session, branch, worktree, and
integration line; that compatibility identifier does not surface as product terminology.

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

A hand-in moves the line and nothing else: no worktree, the handing-in one included, is
merged or rewritten by it. A worktree takes in accepted work only when its session runs
`worktree-desk sync`, which defaults to local `dev`. An explicit `--source team` merges
the shared Team line; `--source lead` resolves a lead-owned worktree; `--source <repo:branch>`
selects a particular same-repository worktree. Each operation resolves one exact commit,
merges committed history only, and reports source SHA and destination before/after HEAD.
Ambiguous lead worktrees require an explicit worktree. Source files, custody, and the hand-in
destination are unchanged. This is opt-in adoption, never a side effect of hand-in.
After `ACCEPTED` the worktree’s tip is contained in the line’s new merge commit; the worktree
itself has not moved and may still lack other Team work. The tool then tells the team lead itself,
in the lead's tile (or on the team wipeboard when the tile cannot take it); a team with no
lead gets one sentence back saying nobody was told.

### Provisional visual staging is a separate lane

Before ordinary hand-in, an Agent may commit a coherent private candidate and send the Team
lead its Agent, repository, exact commit, intended surfaces, and supersedes information. This
“provisional visual hand-in” is communication, not a first-class tool verb, hand-in receipt,
approval, or promotion. The private branch remains the source.

The lead serially composes exact provisional commits in one dedicated disposable staging
branch/worktree and serves that worktree on a separate preview port. Agents do not edit it
concurrently. Rejection changes or rebuilds only the disposable composition; it never deletes
the Agent's private commit. Visual approval publishes nothing. Finished work still reaches the
Team line through ordinary `worktree-desk hand-in`, then lead review and promotion. See the concise
[visual-staging Behavior](../development/ronin-methodology.md#visual-staging-one-disposable-team-preview).

Team promotion builds the combined candidate, advances `dev` by compare-and-swap,
restarts the live service, and performs deployment health checks. Failed post-restart
health triggers the promotion recovery path and remains visible in its receipt. When it
completes, promotion posts the moved line on the team wipeboard and tells each session
whose hand-in rode in, in its tile, which receipts are now on `dev` and that its worktree is
finished and certified clean. A worktree is finished when that notice arrives, not when its
hand-in is accepted — and finished means parked, or ended with its session by
`session_end`; it is never closed under a live session. An Agent's shell is opened
inside its worktree at launch and stays there, so the worktree it stands in ends with it,
never before it. `worktree-desk close` is for a worktree nobody is standing in: a second
repository's worktree, or a worktree whose session is already gone.

## Worktree lifecycle and recovery

The current worktree tools can open, inspect, synchronize, hand in, close/park, recover, and
explicitly discard repository worktrees. A branch without a mounted worktree is represented as
parked recovery state. The registry and receipts keep that state visible; no lifecycle
operation silently deletes an unintegrated branch or user files.

Use `worktree-desk status --assignment` to inspect the current assignment and `worktree-desk
receipts` to inspect publication history. `worktree-desk discard --confirm "DISCARD repo:branch"` is the explicit path
that abandons an unintegrated worktree. Funnel recovery is separate: dirty integration
worktrees are preserved to named recovery refs and receipts before cleanup.

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
- Use focused checks in the private worktree. The lead owns the full `npm run verify` verdict
  at the combined integration/release gate; see [verification guidance](../development/verification.md).
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
