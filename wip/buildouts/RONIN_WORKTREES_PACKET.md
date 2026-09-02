# Ronin Worktrees — one Agent packet, per-repository applicability

> expires: when the 2×2 mechanics, Project Root configuration, vocabulary, and regression coverage have landed

## Goal

Make **Ronin Worktrees** one coherent capability packet carried by an Agent and applied
independently to each repository it touches. A repository opts into the packet only through
its Project Root configuration, recorded in `RONIN_REPO`. An Agent without the packet uses
ordinary Git and is not made to follow Ronin's worktree, desk, hand-in, branch, or promotion
workflow merely because that file exists.

An Agent may work across several repositories in one assignment. Some may use Ronin
Worktrees and others may use their checkout directly. No Campaign, Team, template, launch,
hook, or guard may silently become a second repository applicability switch.

## Vocabulary

- The product capability and user-facing switch are **Ronin Worktrees** / **Worktrees**.
- A **worktree** is the Git working tree created for an Agent in an enabled repository.
- A **desk** remains an internal coordination record and may remain in internal APIs, store
  names, and implementation types where it names more than the Git worktree. It is not the
  Project Root setting and is not a synonym presented beside Worktrees.
- **Coordination** is too vague for the Project Root field and must not label the Worktrees
  choice.
- `RONIN_REPO` is passive repository metadata. Git and an unequipped Agent do not acquire
  Ronin Worktrees behavior merely because it exists.

## The two independent facts

### Agent capability

The resolved Campaign → Team Routine answer determines whether a newly born Cowork Agent
carries the Ronin Worktrees packet. Changing that answer affects future births only.

The packet is resolved once and delivered as a unit:

- Worktrees-aware Git SOP;
- worktree/assignment reading;
- `tejun-desk`, hand-in, synchronization, and recovery tools/actions;
- worktree-aware code-cutting and landing workflows;
- birth receipt provenance;
- the environment or other single birth-scoped capability signal needed by mechanical
  adapters.

No component should independently rediscover Team configuration.

### Repository applicability

The Project Root's `RONIN_REPO` is the only applicability answer for that repository:

- `desks=managed` is migrated to the user-facing/internal canonical meaning
  **Worktrees enabled**;
- `desks=none`, or no record, means **Worktrees disabled** for that repository.

The stored key may be renamed only through an explicit compatibility migration. The first
implementation may retain `desks=` on disk if changing it would add risk, but all owning
code must expose one `worktrees: enabled|disabled` domain answer rather than spreading
string comparisons.

Project Root configuration owns this answer. The install-level "new projects" choice is
only a seed used when adding a new root; it never overrides an existing root.

## The acceptance matrix

| Agent carries packet | Repository enables Worktrees | Required behavior |
|---|---|---|
| no | no | Ordinary Git in the checkout. No Worktrees reading, tools, branch policy, hand-in, or guard. |
| no | yes | Ordinary Git in the checkout. `RONIN_REPO` is passive to this Agent; no Worktrees-specific hook or guard may refuse or instruct it. |
| yes | no | The Agent knows the packet is conditional and uses ordinary Git for this repository. No managed worktree or assignment entry is invented. |
| yes | yes | Ronin opens/resolves the Agent's worktree, provides the full packet, and uses commit → hand-in → team promotion mechanics. |

Every test of the matrix must cover both editing and committing, not merely launch metadata.

## Multi-repository resolution

Resolve applicability per repository, never once from the primary root and never once for
the whole Team. An assignment may therefore contain:

```text
ronin-cowork    Worktrees enabled  → Agent worktree + hand-in
ronin-services  Worktrees enabled  → Agent worktree + hand-in
shiwake         Worktrees disabled → repository checkout + ordinary Git
ronin-site      Worktrees enabled  → Agent worktree + hand-in
```

The birth receipt and work record must name both classes. The Agent starts in the primary
repository's resolved location. Direct repositories remain usable and visible without being
misrepresented as missing or failed desks.

## One mechanical activation seam

Create one domain-level resolver, conceptually:

```text
resolveWorktrees(agentCapability, repositories[])
  → packet enabled/disabled
  → per repo: managed/direct, location, reason, provenance
```

All downstream adapters consume this resolved result:

- launch location and worktree creation;
- birth reading;
- command projection;
- Git guard behavior;
- TEGAMI repository rows;
- birth receipt;
- launcher preview and Project Root display.

They must not reread Team configuration or independently interpret `RONIN_REPO`.

The repository-wide pre-commit hook must remain safe for ordinary Git users. Shared-index
protection may remain if it is workflow-neutral, but branch/worktree/hand-in enforcement
must require the resolved Agent capability and repository applicability. The current
unconditional `ronin-git-guard` call violates this rule.

## Git instruction packets

Split the current mixed Git guidance into two deliberate deliveries:

1. **Ordinary Git:** follow the user's request and the repository's own contributor
   instructions; inspect current state, preserve unrelated work, and do not invent branch,
   worktree, review, hand-in, or publication policy.
2. **Ronin Worktrees Git:** for repositories where the packet applies, work in the resolved
   worktree and use commit → hand-in → team promotion. For repositories where it does not
   apply, fall back explicitly to Ordinary Git.

An Agent carrying Ronin Worktrees receives the conditional Worktrees Git packet. An Agent
without it receives only Ordinary Git when Git guidance is otherwise selected.

## Project Root experience

Replace the ambiguous **coordination / none** field with an explicit **Worktrees** choice:

- **Use Ronin Worktrees** — each Cowork Agent carrying the Ronin Worktrees Routine receives
  its own branch and worktree in this repository and can hand work in to its Team.
- **Use the checkout** — Ronin does not create or manage worktrees for this repository;
  Agents use ordinary Git under the user's and repository's instructions.

The editor must also make the repository's branches understandable and editable:

- repository workflow: reviewed or direct;
- working branch, when reviewed (examples: `dev`, `main`);
- stable branch (examples: `main`, `master`);
- Worktrees: on/off;
- a plain-language preview of the resulting flow before Save.

Do not assume `dev`, `main`, or `master`. Validate branch names and explain that changing
configuration does not rename or migrate Git branches automatically.

The Campaign setting becomes **New project roots use Worktrees?** It seeds a new root's
record only. The Project Root editor is the place to change an existing repository.

## Transitions

### Turn on for a repository

- Confirm the exact before/after `RONIN_REPO` profile.
- Validate Git repository and worktree prerequisites.
- Write the profile atomically; never change branches or move refs implicitly.
- Affect future Agent births and future repository resolutions.
- Existing Agents retain the packet and locations recorded at their birth; the UI says a
  relaunch is needed.

### Turn off for a repository

- Inventory open, dirty, ahead, blocked, and parked worktrees before changing the record.
- Refuse a destructive stranding transition. Present the work that must be handed in,
  parked, recovered, or explicitly retained.
- Do not delete branches, worktrees, receipts, or user files as part of the toggle.
- After the transition, future resolutions use the checkout and no new managed worktree is
  opened.
- Existing Agent assignments remain historical/live facts until those sessions finish;
  changing repository configuration must not rewrite their birth receipts.

## Implementation legs

### A. Mechanics and domain model

1. Introduce the single Worktrees resolution result and route launch, assignment, tools,
   reading, receipts, and work records through it.
2. Resolve every repository independently and retain direct repositories in a mixed
   assignment/result.
3. Make Worktrees-specific Git enforcement conditional on both dimensions of the matrix.
4. Separate ordinary shared-index protection from Worktrees workflow enforcement.
5. Remove or subordinate direct `desks`/Routine checks outside the resolver.
6. Add the complete 2×2 and mixed-repository regression suite.

### B. Project Root UX, vocabulary, and SOPs

1. Rename visible **Desks/coordination** choices to **Worktrees** and **Use the checkout**.
2. Clarify the new-root seed versus an existing root's authoritative configuration.
3. Present reviewed/direct, working, stable, and Worktrees as one understandable repository
   profile with a flow preview.
4. Split Ordinary Git and conditional Ronin Worktrees Git guidance.
5. Update KOTOBA/KOKUGO and every affected lexicon key in the same commit as visible text.
6. Add UI smoke coverage for creating and editing roots with nonstandard branch names.

### C. Integration audit

After A and B are handed in, one integrator searches for every remaining direct use of
`ronin_worktrees`, `RONIN_REPO`, `desks=`, `tejun-desk`, `ronin-git-guard`, and visible
"desk/coordination" strings. Each occurrence must be classified as catalog definition,
the one resolver, an adapter consuming its result, compatibility storage, or a defect.

## Verification

- Unit tests for all four matrix cells.
- An Agent without Worktrees can edit and commit on the branch it was launched into even
  when `RONIN_REPO` says managed.
- An Agent with Worktrees uses a managed worktree only in enabled repositories.
- One launch spanning enabled and disabled repositories produces correct paths, reading,
  tools, work-record rows, and receipt entries for both.
- Project Root create/edit round-trips `dev`, `main`, `master`, and a nonstandard valid
  branch name without inventing or moving refs.
- Turning off reports outstanding managed work and never deletes it.
- Scoped mechanics, module, lexicon, and UI checks pass. Full BYOIN remains reserved for
  team promotion under `docs/test-protocols.md`.

## Definition of done

There is one Agent-level packet selection, one repository-level applicability record, one
resolved answer consumed everywhere, and executable proof of the 2×2. The Project Root
surface plainly says Worktrees, lets the owner choose branch names, and distinguishes the
new-root default from an existing repository's setting. An Agent not carrying Ronin
Worktrees can work normally in any repository without Ronin teaching or enforcing the
Worktrees workflow.
