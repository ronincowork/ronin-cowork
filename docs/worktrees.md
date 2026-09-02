# Ronin Worktrees

Ronin Worktrees is an Agent capability applied independently to each repository in an
assignment. It gives an enabled coding Agent a private Git worktree, a private branch, and
the commit → hand-in → team-promotion workflow. Repositories outside that combination use
their ordinary checkout and Git workflow.

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
5. If no repository resolves as managed, the launch uses its ordinary checkout path.

A managed launch never silently falls back to a shared funnel checkout when opening its
worktree fails. The launch is refused with the reason. Direct repositories remain direct
and are not represented as missing desks.

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
| Team promotion | Combine the team line with `dev`. | One full repository BYOIN on the exact candidate before `dev` moves. |
| `dev` → stable | Release through the configured release path. | A second full BYOIN on the exact release candidate. |

Commit preserves private work; hand-in publishes it to the team. Hand-in is serialized per
target line, builds in a disposable candidate worktree, and advances the line with a
compare-and-swap only after admission succeeds. Receipts record the source, candidate,
resulting line, and contributing session.

When a team line advances, clean sibling desks adopt it immediately. Dirty siblings retain
their files and receive a pending update; they adopt at their next safe boundary or explicit
`tejun-desk sync`. The handing-in desk also adopts the accepted team state.

Team promotion builds the combined candidate, runs full BYOIN once, advances `dev` only on
success, restarts the live service, and performs deployment health checks. Failed candidate
verification leaves `dev` untouched. Failed post-restart health triggers the promotion
recovery path and remains visible in its receipt.

The complete testing boundary is defined in `docs/test-protocols.md`.

## Desk lifecycle and recovery

The current desk tools can open, inspect, synchronize, hand in, close/park, recover, and
explicitly discard repository desks. A branch without a mounted worktree is represented as
parked recovery state. The registry and receipts keep that state visible; no lifecycle
operation silently deletes an unintegrated branch or user files.

Use `tejun-desk status --assignment` to inspect the current assignment and `tejun-desk
receipts` to inspect publication history. `tejun-desk discard --yes` is the explicit path
that abandons an unintegrated desk. Funnel recovery is separate: dirty integration
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
- Do not run full BYOIN at ordinary commit or team hand-in boundaries.
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
- promotion tests for candidates, receipts, BYOIN boundaries, recovery, and atomic line
  movement.
