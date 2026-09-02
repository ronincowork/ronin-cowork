# control-surface audit — the compatibility cutover, and the proof the old path is gone

The control surface (KOTOBA: `ronin_control_surface`) moves reviewed work off the shared
`dev` checkout and into repo desks: **commit** preserves at the desk, **hand-in** publishes
to the team line, the lead's **team promotion** runs the one full repository BYOIN and admits
the team's state to `dev`, and **Git push** is the release path's word alone. The model is the
lab's WORKTREES buildout; the wider network is its RONIN_CONTROL_SURFACE companion. This page
is the fifth track's hand-back: the checklist that turns the feature on, and the audit that
says every instruction, mechanism and visible fact agrees with it.

**Rule this page enforces:** mixed old and new instructions are more dangerous than none.
An agent born at a desk but told to push `dev` bypasses the boundary. Nothing below is
flipped until every row of the checklist is true.

## The cutover checklist

Turn on only when all of these hold, in this order. Each row names its owner and the proof.

| # | Condition | Track | Proof |
|---|---|---|---|
| 1 | `RONIN_REPO` declares every reviewed product repository (`mode=reviewed`, `working`, `stable`, `desks=managed`); direct repositories are declared `mode=direct` | 5 | `libexec/ronin-repo-mode` at each root answers `arrangement=…`; see "Repository declarations" below |
| 2 | `.git` is in the `.stignore` of every Syncthing share holding a checkout | 5 / owner | `bin/ronin-doctor` — the Syncthing row is `ok` on every machine |
| 3 | Desk registry, open/status/sync/park, serialized hand-in with compare-and-swap, sibling adoption and desk receipts exist with crash/race tests | 1 | `tests/desks*.test.ts` green; `docs/desks.md` |
| 4 | Team promotion runs full BYOIN on the exact candidate, writes the receipt, advances by compare-and-swap, restarts `dev`, health-checks, reverts on failure | 2 | `tests/promotion*.test.ts` green; `docs/team-promotion.md`; one receipt with `state=complete` in `bin/ronin-store promotion_ledger` |
| 5 | A coding launch resolves desks before spawn, starts in the primary desk, and carries the desk block; every other launch gets no desk state | 3 | `tests/launch-desks.test.ts` green; the repository's `RONIN_REPO` (`desks=managed`) is the one gate — no install switch (owner, 2026-08-29); a coding launch that gets none says why on its receipt |
| 6 | TEGAMI `repos[]`, roster and team page show desk state (private · pending · accepted · parked · blocked) from derived facts | 4 | `tests/desk-state.test.ts` green; `GET /api/sessions/:name/desks` |
| 7 | The legacy claim guard runs only where an index is shared; a desk is a pass-through | 5 | `tests/control-surface-compat.test.ts` — shared/desk/direct through the real shim and hooks |
| 8 | `dev → master` CI consumes the promotion receipt before its `--gates` rerun; a PR without a receipt fails | 5 | `.github/workflows/verify.yml`; `scripts/verify-promotion-receipt.mjs`; `.github/pull_request_template.md` carries the fence |
| 9 | `bin/ronin-build` refuses a commit off the declared stable line; `bin/ronin-doctor` reads the arrangement | 5 | `bin/ronin-build --bare v0.0.0` on a `dev` checkout fails with "not on the declared stable line" |
| 10 | No reviewed-session instruction says commit/push `dev`, "full BYOIN first at master", or generic `open-pr --base main` | 3 / 5 | the inventory below is fully classified with no open **session behavior** row |
| 11 | The first dogfood assignment spans Cowork **and** Services; Koe and Lab run direct alongside | lead | assignment on the roster; `ronin-repo-mode` in each says what it should |

**It is on.** Rows 1–10 hold; desks follow each repository's `RONIN_REPO` and nothing else.
A new project root writes its own `RONIN_REPO` from ⚙ *Worktrees for new project roots* (default:
desks); `bin/ronin-doctor` lists every root's answer. Scaling back is per repository —
`desks=none` in its file — never a partly activated architecture left behind.

## Repository declarations — measured 2026-08-28

`RONIN_REPO` is the checked-in fact; `libexec/ronin-repo-mode` reads it and never infers an
arrangement from the branch that is open. Absent = undeclared shared checkout, guard on.

| Repository | Checked out | `RONIN_REPO` | `.git` in `.stignore` | Disposition |
|---|---|---|---|---|
| `ronin-cowork` | `dev` | **declared** reviewed `dev → master`, desks managed | yes | first dogfood target |
| `ronin-services` | `dev` | absent | yes | **owner:** declare reviewed `dev → master`, desks managed — needed for the first (two-repo) dogfood |
| `ronin-shiwake` | `dev` | absent | **no** — `.stignore` holds one line and it is not `.git` | **owner:** add `.git` to `.stignore` on every machine (§0), then declare reviewed |
| `ronin-site` | `dev` | absent | **no `.stignore` at all** inside a Syncthing share | **owner:** add `.stignore` with `.git` on every machine (§0), then declare reviewed |
| `ronin-koe` | `main` | absent; CLAUDE.md declares direct `main`, no `dev` | yes | declare `mode=direct stable=main desks=none` — the counter-test that desks follow the declaration |
| `ronin-lab` | `main` | absent; direct, history is the artifact | yes | declare `mode=direct stable=main desks=none` |
| `tmux-ronin` (archived) | — | — | — | excluded: no live build/install reference found |

Only Cowork's file is written by this track: the other repositories are other sessions'
trees, and a declaration is the owner's arrangement decision (`ronin_sops/github.md`), not a
tool's convenience. The two §0 findings block desks in those repositories until fixed.

## Interfaces this track relies on, and hands back

- **Reads** Fable 2's receipt (`src/promotion/receipts.ts`): `state`, `repos[].{repo,
  candidate}`, `proofs[].{repo, candidate, mode, passed}`, `advances[].{repo, to, status}`,
  `reverted_by`. **Decides** the transport: the receipt JSON rides the PR body in a
  ```` ```ronin-promotion-receipt ```` fence, because the ledger lives on the box and
  committing it onto `dev` would change the SHA it proves. `workflow_dispatch` takes the
  same JSON and the commit as inputs.
- **Reads** the linked-worktree fact from git (`--git-dir` ≠ `--git-common-dir`), never a
  registry: the guard decision must be right even when no registry answers.
- **Hands back** `RONIN_REPO` (read by Fable 1's `src/desks/arrangement.ts`, which adds the
  optional `publish=` key) and `ronin-repo-mode` (read by the shim, hooks, build and doctor).
- **Does not** own BYOIN's meaning or schedule (track 2), the words sessions are handed
  (track 3), or the facts shown about them (track 4).

## The semantic inventory — classified

The closeout search (RONIN_CONTROL_SURFACE, "Audit command") over tracked files, excluding
`package-lock.json` and the staging copy: **226 files**. A literal replacement pass is
insufficient; the classification is the audit. Every file falls in one class:

| Class | Meaning | Files | Disposition |
|---|---|---|---|
| **session behavior** | tells a session what to do with git, a branch, BYOIN or a PR | `AGENTS.md`, `CLAUDE.md`, `ronin_sops/github.md`, `ronin_sops/ronin_methodology.md`, `ronin_catalogs/ACTIONS.md` (cut-code · open-pr · land-work · check-clean · harakiri), `ronin_catalogs/MACROS.md`, `ronin_catalogs/session_roles/CutCode.md`, `ronin_session_boot/all/*`, `ronin_session_boot/assignment/DESK_CONTRACT.md`, `docs/test-protocols.md` | migrated by tracks 2 and 3 (`9eaa22d`, `51608c2`); this track re-searched them — no remaining "push dev", "confirm branch dev", "BYOIN first at master" or `--base main` in an ordinary landing path |
| **session behavior — resume checklists** | implementation READMEs whose "exact resume checklist" told a successor to confirm `dev` and push to it | `docs/project-roots.md`, `docs/agent-configuration.md`, `docs/workspace-kit.md`, `docs/team-workspace.md`, `docs/customize.md`, `docs/league.md`, `docs/new-team.md` | migrated by this track: work at the desk, commit there, hand in; `master` rules unchanged |
| **mechanical executor** | code that moves refs, builds candidates, records receipts, guards an index | `src/desks/*`, `src/promotion/*`, `src/launch-desks.ts`, `bin/shim/git`, `.githooks/*`, `libexec/ronin-claim`, `libexec/ronin-repo-mode`, `scripts/verify-promotion-receipt.mjs` | current by construction; the claim guard is scoped to shared indexes |
| **visible state** | derives or shows branch/desk facts | `src/tegami.ts`, `src/desk-state.ts`, `src/routes/desks-api.ts`, `src/team-rosters.ts`, `src/project-roots.ts`, `src/spawn.ts`, `src/session-boot.ts`, `src/routes/launch*.ts`, `public/js/{tilehead,desks,roster,team-*,new-team*,projectroots,shingo,system}.js`, `ronin_bin/write_tegami`, `docs/desk-state.md`, `docs/desks.md`, `docs/team-promotion.md` | tracks 1, 3, 4; `write_tegami` accepts `repos[]` entries of `{repo, branch, worktree, line}` and carries the tool-written `worktree`/`line` through a save that omits them (closed 2026-09-02) |
| **release / distribution** | tags, artifacts, updates, the remote | `.github/workflows/*.yml`, `.github/pull_request_template.md`, `bin/ronin-build`, `bin/ronin-update`, `bin/ronin-deploy`, `bin/ronin-doctor`, `bin/ronin-byoin`, `scripts/get-ronin`, `scripts/tmux-static/build.sh`, `docs/release.md`, `docs/tarball.md`, `docs/install.md`, `docs/DEPENDENCY_BUNDLE_INSTALL.md`, `docs/hetzner-vm.md`, `docs/rent-a-machine.md`, `docs/USER_JOURNEY.md`, `docs/is-this-safe.md`, `src/routes/version.ts`, `src/routes/update-api.ts` | this track: CI consumes the receipt, build refuses off-stable, doctor reads the arrangement; the rest name GitHub only as the download origin |
| **repository creation** | making a new repo, secrets before the first push | `ronin_sops/github.md` ("Making a new repository"), `ronin_sops/secrets.md`, `ronin_bin/tejun-secrets`, `ronin_catalogs/MIKA_MACROS.md` | valid as written; a new repo must additionally write `RONIN_REPO` — **open for track 3's prose** |
| **historical / generated / incidental** | commit hashes in diaries, `git grep` in check scripts, "push" as a verb about events or palettes, lexicon tables, `branch` as a code path | `scripts/check-*.mjs`, `scripts/kokugo-table.mjs`, `docs/kokugo-table.md`, `ronin_catalogs/lexicons/professional_en.md`, `docs/ui.md`, `docs/ui-agents.md`, `docs/model-providers.md`, `docs/cowork-space.md`, `src/ws/*`, `src/sockets.ts`, `src/settei.ts`, `public/style.css`, the rest of `public/js/*`, `tests/*`, `wip/buildouts/*`, `KOTOBA.md`, `KOTOBA_GLOSSARY.md`, `README.md` | no session instruction; nothing to migrate |

**Open rows** (not blocking the checklist, named so they cannot go dark):

- `ronin_sops/github.md` "Making a new repository" should end by writing `RONIN_REPO`.
- `docs/test-protocols.md` (track 2) — re-check its wording once the promotion path lands.

## Decisions for the owner

1. **Declarations in sibling repositories** (table above): services, shiwake, site
   reviewed; koe, lab direct. This track wrote only Cowork's.
2. **Two §0 findings**: `ronin-shiwake` and `ronin-site` are inside Syncthing shares with
   `.git` not ignored. Desks cannot open there until fixed on every machine.
3. **A PR without a receipt now fails CI.** Any `dev → master` PR open before the first team
   promotion will go red on its next push; that is the contract, said early.
4. **Which lifecycles get a desk** (track 3 set coding + debug; review/design/orchestrate do
   not).

## Regression harness

`tests/control-surface-compat.test.ts` is the compatibility floor and runs in BYOIN's unit
gate. It drives the real `bin/shim/git`, `.githooks/pre-commit`, `.githooks/post-commit`,
`libexec/ronin-claim` and `libexec/ronin-repo-mode` in throwaway repositories: a reviewed
home checkout records the claim and refuses a foreign staged file; a desk records nothing and
commits anything; a declared-direct shared checkout behaves as it always has; overrides are
explicit; outside git everything fails open. The receipt verifier's accept/refuse table, the
PR-body fence and the CLI's exit codes are pinned in the same file. End-to-end desk → hand-in
→ promotion → PR is exercised by the dogfood assignment (checklist row 11), not by a unit test:
it needs the machine.
