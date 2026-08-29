# RONIN CONTROL SURFACE — current health network and rollout plan

> `ronin_control_surface` audit and implementation companion to `docs/worktrees.md`. That
> document owns the desk model and boundary semantics; this document owns the wider
> network through which Ronin teaches, observes, checks, promotes and protects session
> work. Audit made 2026-08-28 against the checked-out Ronin repositories.

## What the control surface is

The **`ronin_control_surface`** is the whole health network around work done by sessions.
It is not a screen and it is not synonymous with Git. It includes:

```text
                 TEACH
       birth brief · readings · roles · SOPs
                          │
                          ▼
WORK ────────► OBSERVE ────────► INTEGRATE ────────► PROVE ────────► PUBLISH
save/commit     desk + roster      hand-in/promotion     BYOIN + health    GitHub/CI/release
                          │                │                    │
                          └──── recover · attribute · notify ───┘
```

Its purpose is to keep four answers aligned:

- what the session was told to do;
- what work and repository state actually exist;
- what has been accepted at each boundary and why;
- who can recover or correct it when a check fails.

Desks/worktrees are the isolation and integration topology. BYOIN is the repository
fitness proof at `team → dev`. Deployment health checks prove the different fact that the
accepted `dev` app actually came back up. GitHub/CI/release are the remote review and
distribution edge. TEGAMI, rosters, receipts and notices connect those mechanisms so a
failure remains attributable to the closest responsible session and lead.

This wider name matters because implementing only branch management would leave the
existing BYOIN schedule, launch instructions, cleanup meanings and release claims in
contradiction.

## Outcome

The change is not principally a GitHub change. GitHub remains the remote for the two
published lines (`dev`, stable) and the review/release boundary. The large change is the
local path from a session to `dev`:

```text
today
session → project-root checkout on dev → git commit/push origin/dev → PR → master

target
session → assignment → repo desk(s) → hand-in → team/<team>/dev
        → team promotion + full BYOIN → local dev + restart
        → Git push → PR/CI receipt → stable
```

That chain is canonical across the three authorities. This document owns why the whole
network exists and where its boundaries sit. `docs/worktrees.md` owns the local desk,
hand-in and team-promotion mechanics. `ronin_sops/github.md` owns the operator procedure
for Git publication, PR verification and the owner-controlled merge. “Push” without
“Git” never names a local integration action.

Today Ronin repeatedly teaches and assumes the first path. Changing one SOP will not
change session behavior because the same behavior also comes from launch cwd, birth
briefs, roles, macros, Git guards, TEGAMI, team data and release CI.

## Control posture

Use the weakest control that reliably produces the behavior:

1. **Make the right thing the default.** An assisted coding launch opens the required
   repo desk(s), starts the terminal there, and states each desk and its team line in the
   birth brief.
2. **Teach at the moment of action.** One desk reading defines save, commit, hand-in,
   team promotion and Git push. Roles and macros point to it instead of inventing variants.
3. **Use tools for multi-step state changes.** Candidate creation, serialization,
   compare-and-swap, receipts, sibling adoption and coordinated multi-repo promotion
   cannot be made safe by prompt obedience.
4. **Show state instead of policing ordinary work.** TEGAMI and the roster show dirty,
   ahead, pending, parked and last-handed-in state per repo desk.
5. **Hard-refuse only shared-line corruption or loss.** A candidate may not advance a
   line after a conflict/failed boundary check; a dirty sibling is never rewritten; a
   stale expected ref never advances; and an unintegrated desk tip is never silently
   deleted. Editing a funnel checkout should remain the speed bump specified in
   `docs/worktrees.md`, not an attempt to imprison the shell.

Prompt language cannot provide atomicity. A tool should not decide when work is coherent.
That division is the rollout's governing rule.

## Current touchpoints

### 1. Authority and instructions that sessions read

| Current touchpoint | What it says or does now | Required disposition |
|---|---|---|
| `AGENTS.md` | Auto-read contract: no dev-loop BYOIN; one full run at `dev → master`. | Replace the stale boundary with a short pointer: desk work uses the desk contract; full repo BYOIN runs at `team → dev`; installed-box BYOIN remains separate. |
| `ronin_sops/github.md` | Reviewed work is done continuously on shared `dev`, pushed daily; temporary worktrees fold into `dev` and disappear. Direct repos commit/push stable. | Rewrite reviewed mode around private desks, hand-in and team promotion. Preserve direct mode as a declared exception. Distinguish **hand-in/promotion** (local integration operations) from **Git push** (remote publication). |
| `ronin_sops/ronin_methodology.md` | `+cutcode` and `+land` commit and push coherent work to `dev`. | Describe commit as private preservation, hand-in as publication to the team, and team promotion as lead-owned admission to `dev`. Closing may prompt hand-in or park; it must not silently publish. |
| `docs/test-protocols.md` | Full BYOIN belongs to the exact `dev → master` candidate; GitHub isolated gates run on the PR. | Make `team → dev` the one full repository BYOIN. A matching SHA receipt travels to PR/CI; CI verifies/consumes it rather than being the first full check. Keep installed-box BYOIN after maintenance/update/store changes. |
| `ronin_session_boot/all/TEST_PROTOCOLS.md` and `REQUIRED_ABILITIES.md` | Universal birth reading reinforces current testing and landing behavior. | Update the universal test pointer. Do not inject desk rules universally into non-code sessions; add a desk reading dynamically only when desks were assigned. |
| `ronin_catalogs/session_roles/CutCode.md` | Says auto-commit and push coherent dev work; designated integrator checks `dev → master`. | Say commit coherent checkpoints privately, explicitly offer coherent work with hand-in, never run full BYOIN at commit/hand-in, and leave team promotion to the lead/compiler. |
| Repository `CLAUDE.md`, README and project docs | Several implementation checklists say “confirm branch dev,” preserve shared-checkout dirt, and commit/push to dev. Koe explicitly declares direct `main`; Lab is direct history-as-artifact. | Migrate reviewed-product docs. Keep explicit direct repos direct unless the owner changes their arrangement. A repo declaration chooses **reviewed desks** or **direct**, not whichever branch happens to be open. |

The known stale implementation documents include `docs/project-roots.md`,
`docs/agent-configuration.md`, `docs/team-workspace.md`, `docs/workspace-kit.md` and the
generated/reference copies that quote their resume checklists. Search and migrate the
semantic phrases, not merely literal `dev`, because `push`, “clean,” “land” and “branch”
all change meaning.

### 2. Session launch and prompt injection

| Code surface | Current behavior | Required behavior |
|---|---|---|
| `src/project-roots.ts` | A project root is one fixed directory. Live facts are one remote + current branch read from that directory. | Keep root as project identity/selection, but resolve an assignment into `repos[]`, each with repository identity, source line, desk branch and worktree. Do not pretend a multi-repo assignment has one cwd or branch. |
| `src/spawn.ts` (`resolveSpawn`, `buildBrief`) | Launch cwd is profile dir or root dir. Brief includes team context and shelf pointers, but no resolved desk contract. | Before agent launch, resolve/open desks; choose a primary desk cwd; inline a compact desk block listing every repo desk, current cwd, upstream line, and the three scopes. Add the longer desk reading to `Read first`. Plain terminals/manual launches remain literal and are not falsely briefed. |
| `src/routes/launch.ts` | Starts the CLI in the resolved root and writes project/team facts after birth. | Desk preparation must complete before CLI spawn so the first command starts at a desk. If preparation fails, launch may not silently fall back to a funnel checkout. Return a visible preparation failure. |
| `src/session-boot.ts` / `src/session-readings.ts` | Additive all/root/role/team-role shelves; no assignment-aware level. | Add an assignment/desk reading input or an explicit birth seed generated from resolved desks. Do not make a static root shelf guess which team/session branch exists. |
| `src/launch-profile.ts` | Correctly keeps live root/repos/branch out of static profile definitions. | Preserve that separation; desks are launch-time facts, not provider/model configuration. |

The injected minimum should be concrete, not a Git lecture:

```text
Your assignment has 2 desks:
  cowork   /…/worktrees/team/comp/fable   → team/comp/dev
  services /…/worktrees/team/comp/fable   → team/comp/dev
Save changes in a desk. Commit preserves only that desk. `hand-in` publishes committed
work to its team line; it is not `git push` and it does not run full BYOIN. The lead's
`team promotion` runs full BYOIN and promotes the accepted team state to dev.
```

### 3. Actions and macros that cause sessions to act

| Surface | Current mismatch | Target |
|---|---|---|
| `cut-code` / `+cutcode` | Generic branch work followed by `open-pr`; role text says push coherent dev work. | Work in assigned desks. A leg may prompt, never automatically perform, hand-in. No ordinary session PR. |
| `open-pr` | Mechanical `git push -u origin <branch>` then `gh pr create --base main`. | Release-only action: resolve declared working/stable pair and open only `dev → stable`; never publish a desk/team branch. |
| `check-clean` | One cwd: status + recent log; “everything pushed” means safe. | Inspect every assignment desk: saved/dirty, committed-ahead, accepted, pending-team-update, parked/recoverable. Remote publication is not session cleanliness. |
| `land-work`, `+land`, `harakiri`, delete-session | Assume a PR/push before ending or only guard unsaved work. | Close each desk explicitly as accepted, parked, reassigned or discarded. Capture unsaved files in `WIP:` only with an explicit close action; never auto-publish them. |
| team lead/compiler actions | No first-class desk queue or team promotion boundary. | Add `desk-open`, `desk-status`, `desk-sync`, `hand_in`, `desk-park`, `team-status`, `team-promote`, receipt inspection and attribution/replay. Coordinated assignment promotion spans repo candidates and produces one recovery receipt. |

Action definitions are load-bearing prompt injections: the catalog text is compiled into
the session when the macro runs. They must land in the same compatibility release as the
tools they name.

### 4. Git hooks, shims and mechanics

| Surface | Current behavior | Rollout treatment |
|---|---|---|
| `bin/shim/git`, `.githooks/pre-commit`, `libexec/ronin-claim` | Solve the shared-checkout/shared-index race by recording which session staged each path and refusing proven foreign staged files. | A managed worktree already has its own index, so this mechanism is unnecessary there. Retain it only for explicit shared/direct checkout mode during transition; make mode detection explicit. Do not let its old “every session shares one index” explanation teach the target architecture. |
| `setup.sh` `core.hooksPath` wiring | Installs repo-level hooks. Git config is shared by linked worktrees. | Keep one worktree-aware hook router; never rewrite hooksPath per desk. Hooks may warn at funnel points and preserve close receipts, but hand-in/promotion lives in a serialized service/tool, not loose post-commit hooks. |
| ordinary `git commit` | Commits current index. | Leave ordinary and private. No post-commit propagation or BYOIN. |
| ordinary `git push` | Currently the taught route to origin/dev. | Stop teaching it in desk sessions. Desk branches have no remote upstream, so accidental default push should fail naturally. The explicit hand-in tool performs local admission. Remote `dev` publication, if retained, belongs to the team-promotion/release executor. |
| candidate/ref advancement | Not present. | Central executor: queue per target ref, detached candidate, conflict/near-instant desk admission, full team gate, compare-and-swap update, mounted-line refresh, receipt. This is a hard integrity boundary. |
| sibling update | Not present. | Immediately fast-forward clean sibling desks; mark dirty desks pending and notify without changing their files; incorporate at commit/sync safe boundary. This needs a desk registry plus session notification. |

### 5. Durable state and visible surfaces

| Surface | Current shape | Required extension |
|---|---|---|
| TEGAMI `repos[]` (`src/tegami.ts`) | Each entry is only `{repo, branch}`; newborn gets the checkout it stands in; text tells sessions to keep branches current manually. | Per repo: repo/root identity, desk branch, worktree handle/path, team line, dirty, ahead/behind, pending update, last accepted hand-in, blocked reason and assignment/change-set id. Most fields should be derived/tool-owned, not prose the agent edits. |
| Team roster / APIs | Durable team has project root, repo list and a single branch string. | Store/derive the team's line per repo and roll session desks beneath assignments. A single `team_branch` cannot represent two repositories safely. |
| Tile/header/team page | Shows a branch/current checkout coordinate. | Show repo-aware desk state and roll it up: `2 desks · 1 pending · 3 commits private`. Keep detailed paths/SHAs behind inspection. |
| Project-root Admin | Reads only the catalog directory's current checkout. | Show repository arrangement and desk eligibility separately from the incidental branch mounted at the root. |
| receipts/ledger | Does not exist. | Durable hand-in, team-promotion and coordinated change-set receipts keyed by exact SHAs. They are both recovery state and failure attribution. Store outside replaceable install files. |

### 6. GitHub, CI, release and distribution

These are GitHub touchpoints but not all are desk touchpoints:

- `.github/workflows/verify.yml` currently runs gates on PRs to `master`. Change its
  contract to validate the exact received team-promotion SHA/receipt or deliberately rerun for
  release assurance; it must no longer claim to be the first/only full BYOIN.
- `docs/release.md`, `.github/workflows/release.yml`, tag ancestry checks, GitHub Releases,
  installer/update download URLs and tarball production remain the release/distribution
  path. Update boundary wording but do not route them through session desks.
- `bin/ronin-doctor`'s credential/dry-run push check remains a machine capability check,
  not evidence that a session desk is clean or publishable.
- `bin/ronin-build` and packaging dirty-tree/commit stamps should operate on an exact
  accepted candidate or stable checkout, never infer acceptance from the current cwd.
- New-repository creation with `gh repo create`, secret-history inspection, remote setup
  and default-branch/protection configuration remain valid. The chosen arrangement must
  additionally declare whether managed desks apply.
- External GitHub fetches for installation, updates, static tmux artifacts and releases
  are inventory items only; they do not participate in session integration.

Current repository modes observed:

| Repository | Current declared/observed mode | Desk rollout |
|---|---|---|
| `ronin-cowork` | reviewed `dev → master` | Primary implementation and first dogfood target. |
| `ronin-services` | checked out on `dev`; reviewed product sibling | Include in multi-repo dogfood and coordinated team promotion. Add an explicit repository contract if absent. |
| `ronin-shiwake` | checked out on `dev` | Reviewed-desk candidate after Cowork mechanics stabilize. |
| `ronin-site` | README declares work on `dev`, release to `master` | Reviewed desks, but not needed for first multi-repo proof. |
| `ronin-koe` | CLAUDE explicitly declares direct `main`, no `dev` | Preserve as direct. It is the counter-test proving desks are selected by declared arrangement, not forced globally. |
| `ronin-lab` | direct publishing; history is the artifact | Preserve as direct unless separately ruled. |
| archived `tmux-ronin` | historical repository | Exclude from implementation unless a live build/install reference is found. |

## Rollout — one feature, ordered implementation

> **Owner ruling, 2026-08-28: no staged sequencing.** Not cross-repo after single-repo,
> not single-repo dogfood before the receipt exists. Build the whole model — desks,
> hand-in, team promotion, adoption, park, recover, cross-repo receipt, restart, revert — and
> dogfood the full thing; scale back afterwards only if it has to be. The order below is
> build order inside one delivery, not a set of releases. Also ruled: the local act is a
> **hand-in** (`hand_in`), a session handing its submission in to the team's line;
> **team promotion** is the lead's admission to `dev`; `push` is Git's word and
> nothing else's.


This is one architectural change, not optional feature slices. The order below prevents
new behavior from being taught before the executor and recovery state exist.

### A. Freeze the contract and make it machine-readable

- `docs/worktrees.md` remains semantic authority.
- Add one repository arrangement record: reviewed/direct, local working line, stable line,
  remote-publication policy, and whether managed desks are enabled.
- Define assignment, repo-desk, team-line and receipt schemas, including multi-repo
  interrupted-promotion recovery.
- Resolve vocabulary in every command: **commit**, **hand-in**, **team promotion**, **Git
  push**. Never use bare “push” in a session instruction where two meanings are possible.

### B. Build the state/executor floor

- Implement desk registry and derivation of paths/branches.
- Implement open/status/sync/park and session-loss recovery.
- Implement serialized candidate admission and compare-and-swap receipts.
- Implement sibling clean adoption and dirty pending notification.
- Implement team promotion with the one full BYOIN and exact-SHA receipt.
- Implement cross-repo candidate preparation, compatibility gate and durable partial-
  advance recovery receipt.
- Add crash/race tests before pointing any real session at the executor.

### C. Change launch and visibility together

- Make assisted reviewed coding launches resolve their assignment desks before spawn.
- Start in the primary desk and inject the concrete multi-desk brief/reading.
- Extend TEGAMI/roster/team page so the owner and lead can see private, pending, accepted,
  parked and blocked states as soon as agents begin using desks.
- Keep manual terminals and direct repositories honest: no invented desk state.

### D. Replace every behavioral instruction in one compatibility release

- Update AGENTS, GitHub/methodology/test SOPs, CutCode and relevant birth readings.
- Replace macro/action semantics (`cutcode`, `check-clean`, `land`, `open-pr`, close).
- Migrate the implementation/resume docs found above and regenerate derived catalogs or
  reference tables from their authority.
- Scope the legacy claim hook to shared/direct mode and change its explanation.

Mixed old/new instructions are more dangerous than temporarily having no prose: an agent
born at a desk but told to push `dev` can bypass the intended boundary. Ship tools,
launch, prompts and visible state together.

### E. Dogfood the complete model

- Turn the control surface on only when all five implementation tracks below meet at the
  compatibility boundary. The first dogfood assignment includes both Cowork and Services;
  there is no Cowork-only operating phase.
- Exercise independent hand-ins, clean and dirty sibling adoption, conflicts, session
  death/park/recovery, full-BYOIN failure attribution, coordinated multi-repo promotion,
  restart/revert, and an injected interruption after the first repo ref advances.
- Keep Koe and Lab running as direct-mode regression tests during the same dogfood.
- Scale the completed model back only in response to measured failure. Do not leave a
  partly activated alternate architecture behind.

This is one delivery and one compatibility cutover. A–E describe dependency/build order,
not independently shippable releases or progressively enabled operating modes.

## Five execution tracks — one compatibility boundary

The five sessions work concurrently, but none declares the feature landed alone. Each
track owns a non-overlapping primary surface and records every cross-track interface in
this document before relying on it.

| Track | Owns | Must hand back |
|---|---|---|
| **Fable 1 — state and hand-in** | Arrangement/assignment/desk registry; desk open/status/sync/park; candidate merge; serialized hand-in; compare-and-swap; sibling adoption; desk receipts and recovery tests. | Stable types and commands consumed by launch, visibility and promotion. No BYOIN policy. |
| **Fable 2 — promotion and health** | Multi-repo team promotion; full BYOIN at `team → dev`; compatibility checks; exact-SHA/change-set receipts; attribution/replay; `dev` restart, health failure and revert; PR/CI receipt contract. | One promotion API/command and failure model. Does not create or launch desks. |
| **Fable 3 — launch and teaching** | Resolve assignment desks before assisted spawn; primary cwd; concrete multi-desk birth injection; assignment-aware reading; CutCode/AGENTS/SOP/macro/action behavior. | A session starts correctly informed in the desk supplied by Track 1. No ref mutation implementation. |
| **Fable 4 — state visibility** | TEGAMI `repos[]`; roster/team API schema; tile/team/project-root status; pending/parked/blocked/receipt roll-ups and notices. | Derived, repo-aware state without asking agents to maintain mechanical facts in prose. |
| **Fable 5 — compatibility and audit** | Legacy Git shim/hook scoping; reviewed/direct repository declarations; GitHub/release/build/doctor changes; semantic inventory closeout; end-to-end and direct-mode regression harness. | The compatibility cutover checklist and proof that stale instructions/paths are gone. |

### Track 4 interfaces — landed on cowork `dev`, 2026-08-28

Consumed: Track 1's `src/desks/registry.ts listDesks({session|team}) → DeskStatus[]` and
`src/desks/arrangement.ts readArrangement`; Track 2's `src/promotion/receipts.ts
lastGoodPromotion / blockingReceipt / summarize`. Published for others: `GET /api/desks`
(every live session's desks + roll-up, memoised), `GET /api/sessions/:name/desks`,
`GET /api/teams/:name/desks` (members, parked desks of gone sessions `live:false`, team
line per repo, `promotion`); `src/desk-state.ts DeskState` (the one shape every surface
reads — registry first, git-derived for a letter repo with no row, nothing invented);
TEGAMI `repos[]` entries may carry `worktree` and `line` (tool-written, optional).
Where each shown fact comes from: `docs/desk-state.md`.

### Track 5 interfaces — landed on cowork `dev`, 2026-08-28

Published: **`RONIN_REPO`** at a repository root (key=value: `mode=reviewed|direct`,
`working`, `stable`, `desks=managed|none`, optional `publish=`; absent = undeclared shared
checkout) — the checked-in arrangement fact Track 1's `src/desks/arrangement.ts` reads;
**`libexec/ronin-repo-mode [claim|arrangement|working|stable|desks|checkout|index]`** — the
one answer to "what checkout am I in": a linked worktree is a `desk` (private index, claim
guard off), the main tree is `home` (shared index, guard on); `bin/shim/git`, `.githooks/*`,
`ronin-claim`, `bin/ronin-build` and `bin/ronin-doctor` all ask it. Consumed: Track 2's
`PromotionReceipt` (`state`, `repos[].candidate`, `proofs[].{mode,passed}`,
`advances[].{to,status}`, `reverted_by`). **Decided:** the receipt travels to `dev → master`
in the PR body as a ```` ```ronin-promotion-receipt ```` fence (the ledger is on the box;
committing it onto `dev` would change the SHA it proves); `verify.yml` runs
`scripts/verify-promotion-receipt.mjs` before its `--gates` rerun, and a PR without a receipt
fails. Hand-back and cutover checklist: `docs/control-surface-audit.md`
(row 5's switch is Track 3's `RONIN_DESKS=on`). Only Cowork's `RONIN_REPO` is written; the
sibling declarations and two §0 Syncthing findings (shiwake, site) are the owner's.

### Integration rules for the five tracks

- Track 1 owns shared schemas until it publishes their first compilable shape. Other
  tracks may propose fields but do not create competing definitions.
- Track 2 owns the meaning and schedule of BYOIN; Track 5 owns CI/release wiring to its
  receipt contract. Neither duplicates the other.
- Track 3 owns words handed to sessions; Track 4 owns facts shown about sessions. The
  same derived state source feeds both.
- Because the present checkout is still shared, sessions declare file ownership before
  editing and stop on overlap. The first useful output from Track 1 is the isolation
  floor; until then, concurrency means independent files, not simultaneous edits to one.
- Every track uses scoped tests while developing. Only the assembled team-promotion
  candidate runs full BYOIN; no track invents its own full run.
- The managing session integrates interface decisions, resolves overlaps, watches all
  five ladders, and alone calls the compatibility candidate ready for dogfood.

## Strict gates: the short list

Hard refusal is justified only here:

- candidate conflict or failed boundary check cannot advance its target ref;
- compare-and-swap mismatch cannot be overwritten or force-pushed;
- team promotion cannot move `dev` without a successful exact-candidate full-BYOIN
  receipt (or an explicit owner emergency procedure that records the override);
- no automation writes into a dirty sibling desk;
- no cleanup deletes an unintegrated tip without accepted archival or explicit discard;
- coordinated promotion cannot conceal partial advancement—an incomplete receipt blocks
  a new promotion of the same change set until recovered or abandoned explicitly.

Everything else is default, prompt, warning, status or lead decision: how often an agent
commits; when it offers a hand-in; when a lead promotes; whether a clean session syncs
now; and whether a direct repository uses desks at all.

## Verification and definition of done

The rollout is complete when all of these are demonstrably true:

- A searched inventory of active repositories yields no reviewed-session instruction to
  commit/push directly to `dev`, no “full BYOIN first at master,” and no generic
  `open-pr --base main` in ordinary landing paths.
- A new multi-repo coding session is born in a primary worktree with all desks in its
  brief and TEGAMI; a non-code/manual/direct session is not.
- Commit causes no propagation and no full BYOIN. Hand-in performs only mechanical
  admission. Team promotion performs the one full repo check and records attribution.
- Clean siblings adopt; dirty siblings receive a pending notice without filesystem
  mutation; session death leaves recoverable parked tips.
- Cowork + Services can promote as one change set and recover visibly from a forced
  mid-advance crash.
- `dev → master` PR/CI names and verifies the exact accepted SHA/receipt; installed-box
  BYOIN still covers the distinct machine boundary.
- Koe direct `main` and Lab direct history continue to work without fake team lines.

## Audit command for implementation closeout

At each migration pass, search all active Ronin repositories (excluding generated and
dependency trees) for both commands and behavioral phrases:

```sh
rg -n --hidden -g '!node_modules' -g '!dist' -g '!coverage' \
  '(git(hub)?|worktree|branch|BYOIN|push|pull request|open-pr|check-clean|land-work)'
```

Review every result as one of: session behavior, mechanical executor, visible state,
release/distribution, repository creation, or historical/generated reference. A literal
replacement pass is insufficient; the classification is the audit.

## Track 1 interfaces — state and hand-in (landed cowork dev 0d02528 + tool leg, 2026-08-28)

- **Shared schema** `src/desks/schema.ts`: `RepoArrangement` (from `RONIN_REPO`),
  `TeamLine`, `RepoDesk` → `DeskRecord` (registry row: + `pending`, `last_hand_in`,
  `blocked`) → `DeskStatus` (derived: `mounted`, `tip`, `line_tip`, `dirty`,
  `dirty_files`, `ahead`, `behind`), `PendingUpdate`, `Assignment`, `HandInReceipt`
  (`result: accepted|conflict|stale|refused`, keyed by `source_tip`/`expected_old`/
  `candidate`/`line_sha`), `ChangeSetReceipt`/`ChangeSetRepo`/`ChangeSetState` (shape;
  Track 2 writes), `DeskNotice` (`adopted|pending|pending_overlap|conflict`), helpers
  `teamLineBranch`, `teamDeskBranch`, `soloDeskBranch`, `deskId`.
- **Arrangement** `src/desks/arrangement.ts`: `readArrangement(repo, dir)`,
  `arrangementOf(root)`, `parseArrangement`, `desksManaged`. Absent file → `source:
  'absent'`, `desks: 'none'`; `mode` other than reviewed|direct refused by name.
- **Registry** `src/desks/registry.ts` (store `desks`, user root): `deriveAssignment({session,
  team, project_root})` (pure — team roster `repos`, else project_root; no desk for a
  direct/undeclared repo), `listDesks(filter)` → `DeskStatus[]`, `readDesk`, `updateDesk`,
  `readAssignment`/`writeAssignment`, `assignmentId(session, team)` = `<session>@<team|solo>`,
  path derivation `deskWorktree(repo, branch)` = `<worktrees>/<repo>/<branch>`,
  `candidateWorktree(repo, line)` = `<worktrees>/.candidates/<repo>/<line>`, `lineFor`.
- **Lifecycle** `src/desks/desk.ts`: `openDesk({repo, session, team, assignment?, branch?})`
  → `DeskStatus` (refuses funnel points, direct/undeclared repos, Syncthing §0),
  `resolveAssignmentDesks(input)` → `Assignment` (the launch seam; throws visibly),
  `adoptLine`, `syncDesk`, `closeDesk(repo, branch, {unmount})` → parked|deleted,
  `discardDesk` (explicit only), `recoverDesk(repo, branch, session)`, `parkedDesks`.
- **Hand-in** `src/desks/hand-in.ts`: `handIn(repo, branch)` → `{receipt, notices}`;
  `handInAssignment({desks})`. Per-line lock `src/desks/queue.ts` (`withLineLock`,
  `queueHolder`; dead-pid reclaim). Line advanced only by `casRef` (`update-ref` with
  expected old); line worktree `reset --hard` under the lock after a clean check.
- **Receipts** `src/desks/receipts.ts`: JSONL per repo and line under the desks receipts store;
  `appendReceipt`, `receiptsForLine`, `receiptsForDesk`, `receiptById`,
  `acceptedSince(repo, line, lastPromotedLineSha)` — what a change set carries.
- **Tool** `ronin_bin/tejun-desk` → `src/desk-cli.ts`: `status | open | hand-in
  [--assignment] | sync | park [--unmount] | parked | recover | discard --yes | receipts
  [--line [--accepted|--since]|--id] | assignment`. Exit 0/2/3/4/5. Test seams
  `RONIN_SESSION`, `RONIN_TEAMS`.
- **Consumed by**: Track 3 (`deriveAssignment`, `resolveAssignmentDesks`), Track 4
  (`listDesks`, `readDesk`, `receiptsForDesk`, `readArrangement`), Track 2
  (`acceptedSince`, `ChangeSetReceipt` shape), Track 5 (`RONIN_REPO` read here).
- **Open for the owner** (in CONTROL_STATE_HANDIN.md): repo segment in the worktree
  path; DeskNotice delivery to the sibling; the gitignored-copy list; solo hand-in
  refused while the home checkout is dirty.

## Track 2 interfaces — promotion and health (landed cowork dev bc5b977 + dc6696e, 2026-08-28)

- **The door** `bin/ronin-promote` → `src/promotion-cli.ts`: `<team> [--mode full|gates|ui]
  [--no-restart] [--dry-run] [--repo name=dir] | resume <id> | abandon <id> <why> |
  revert <id>|last | bisect <team> [--repo] [--from] | receipts [team] | show <id>
  [--pr-block|--shared]`. Repos from the team roster (`repos`, else `project_root`);
  line = roster `branch` or `teamLineBranch(team)`; target = the repo's declared
  `working` (`RONIN_REPO`); a direct repo is refused by name. Exit 0 ok / 1 refused,
  failed, interrupted / 2 usage.
- **Executor** `src/promotion/promote.ts`: `promoteTeam({team, repos, by, mode, restart,
  dryRun, effects})` — prepare → prove → receipt on disk → advance in receipt order →
  restart → health → revert on failure; `resumePromotion`, `abandonPromotion`,
  `revertPromotion`, `bisectLine`. Every machine effect is behind `Effects` (`byoin`,
  `compat`, `restart`, `health`, `notify`, `handInsFor`, test seam `beforeAdvance`).
- **Candidate** `src/promotion/candidate.ts`: `candidateDir(repo, target)` =
  `<worktrees>/.candidates/<repo>/<target>` (dev's candidate; Track 1's
  `candidateWorktree(repo, line)` is the line's); `prepareCandidate` (refuses dirty
  funnel, missing line, conflict — `dev` untouched), `advanceTarget` (`casRef` then
  `reset --hard` of the mounted funnel after a second clean check), `ledgerHandIns`
  (Track 1's `acceptedSince(repo, line, lastPromotedLineTip)` → ids + sessions; git
  first-parent fallback when the line has no rows).
- **Proof** `src/promotion/byoin.ts`: `runByoin` (the repo's own `bin/ronin-byoin` in the
  candidate; parsed `ok/FAIL/SKIP` lines + verdict; no tool → one SKIP, never a pass),
  `runCompat` — the combined protocol for cowork+services: `CONTRACT_V` equal across the
  two `sockets-contract.ts`; services' dev-sync tool into the cowork candidate; then
  `check-kyokai` + `tsc` there. Matches repos on the `ronin_`-stripped key.
- **Health** `src/promotion/health.ts`: `restartService` (`ronin`, else `tmux-ronin`),
  `healthCheck({dir})` — `/api/health` ≤40 s, then `scripts/smoke-ui.mjs` (exit 2 = SKIP,
  no browser), `notifyTeam(dir, team, text)` — the team wipeboard.
- **Receipt** `src/promotion/receipts.ts`, store `promotion_ledger` (data root), one
  `<id>.json`: `PromotionReceipt` ⊃ `ChangeSetReceipt` via `toChangeSet()`; states
  `preparing → proving → advancing → restarting → complete | failed (nothing moved) |
  interrupted (some moved; blocks the team) | reverted | unhealthy | abandoned`;
  `repos[]` (`expected_old`, `line_tip`, `candidate`, `hand_in_receipts[]`, `sessions[]`,
  `files[]`), `proofs[]`, `compat`, `advances[]` (`done|raced|skipped`), `restart`,
  `health`, `failure` (stage, gates, files, hand-ins, sessions), `revert_of`/`reverted_by`.
  Readers: `listReceipts(team)`, `readReceipt`, `blockingReceipt(team)`,
  `lastGoodPromotion(team)`, `summarize`.
- **Consumed by**: Track 4 (`blockingReceipt`, `lastGoodPromotion`, `summarize` on the
  Team page), Track 5 (`scripts/verify-promotion-receipt.mjs` reads `state`, `repos[].
  candidate`, `proofs[]`, `advances[]`, `reverted_by` from the PR-body fence that `show
  --pr-block` prints). Consumes Track 1's `git.ts`, `schema.ts`, `receipts.acceptedSince`.
- **Schedule** written into `docs/test-protocols.md`; mechanism and contract in
  `docs/team-promotion.md`. Tests `tests/promotion*.test.ts` (13; scratch git, effects
  faked). Remaining: the first real promotion on this box (needs a team line with a
  hand-in; `--dry-run` first — the full run restarts the live app).
