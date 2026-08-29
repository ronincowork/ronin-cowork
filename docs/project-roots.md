# Project roots — include a project in Ronin

A `project_root` is Ronin's handle for **where work happens**. It binds a short name to
an existing directory, the project's remit and matching words, its session-boot shelf,
and its memory keys. The new-session launcher, Admin Desk, session identity, and recall
all resolve that one handle.

## Where the record lives

There are two files with the same basename and different jobs:

| File | Scope | Contains |
|---|---|---|
| `ronin_catalogs/PROJECT_ROOTS.md` | system, shipped with Cowork | provider/model launch table; **no project roots** |
| `$(ronin-store catalogs)/PROJECT_ROOTS.md` | owner installation | the projects included on this Ronin installation |

The second file is commonly described as **user scope**. That means owner-specific Ronin
state: Ronin creates and reads it, but keeps it outside a product git checkout so an upgrade
cannot replace the owner's directories. It is part of the running Ronin installation. It is
not a second product catalog and should not be committed to `ronin-cowork`.

The API and Admin Desk are co-editors of this markdown file. Use the API for ordinary changes
because it validates the handle, directory, and resulting document atomically. Do not add an
owner directory to the shipped catalog.

## The invariant

A project root records an **existing directory**. It does not create, clone, move, delete, or
manage that directory, and it does not create a GitHub repository. Those filesystem/repository
steps happen first; inclusion in Ronin happens second.

```text
project/repository exists on disk
          ↓
POST /api/project-roots includes it in Ronin
          ↓
GET /api/project-roots/detail proves disk + git facts
          ↓
Admin Desk and ＋ New show the project
```

## SOP A — include an existing directory

### 1. Inspect; do not infer

Resolve these facts from the actual directory:

```text
name    lowercase handle: letters, digits, - and _
dir     absolute directory path
remit   one plain sentence saying what work belongs there
match   words a person may use when asking to work there
memory  existing OBOERU memory keys that should be recalled, if any
```

Before proposing inclusion, prove:

```bash
test -d <absolute-directory>
git -C <absolute-directory> rev-parse --show-toplevel   # only when it is a repo
git -C <absolute-directory> remote get-url origin       # only when it is a repo
git -C <absolute-directory> branch --show-current       # only when it is a repo
```

The returned git top level must equal the project-root directory; a nested directory must not
inherit its parent's repository identity. A non-git directory is a legal project root.

### 2. Show the proposed block

Show the owner the exact values before writing. Example:

```markdown
## shiwake
- **dir:** /home/glen3/dohyo/ronin-shiwake
- **memory:** ronin, shiwake
- **match:** shiwake, ronin-shiwake, hq, entitlement, tomodachi
- **remit:** Ronin HQ receiver, entitlement authority, transactional mail and intake
```

Do not invent a directory or memory key. Omit an optional field rather than fabricate it.

### 3. Include through Ronin

After approval, call the running Cowork API:

```http
POST /api/project-roots
Content-Type: application/json

{
  "name": "shiwake",
  "dir": "/home/glen3/dohyo/ronin-shiwake",
  "memory": "ronin, shiwake",
  "match": "shiwake, ronin-shiwake, hq, entitlement, tomodachi",
  "remit": "Ronin HQ receiver, entitlement authority, transactional mail and intake"
}
```

The Admin Desk's **▣ Project root** include action and MIKA's `+project_root` job use this same
endpoint. They are preferred human-facing paths. Editing the owner catalog by hand remains an
emergency/advanced path, not a separate workflow.

`409` means the handle already exists: inspect and use `PUT /api/project-roots/:name` only if
the owner intended to edit it. A validation refusal is an answer; do not bypass it by hand-editing.

### 4. Verify all four surfaces

Inclusion is not complete until all of these agree:

1. `GET /api/project-roots` contains the handle and directory; this is the launcher's live list.
2. `GET /api/project-roots/detail` reports `exists: true`. For a repository, its live `remote`
   and `branch` match git; these facts are read from disk and are never copied into the catalog.
3. Admin Desk → **▣ Project root** shows the entry without an excluded/archived state.
4. **＋ New** offers the project root; a test session launched with it starts in the recorded
   directory and carries `@ronin-project_root=<handle>`.

If API verification succeeds but the browser is stale, reload the surface; do not create a
duplicate entry.

## SOP B — create a new GitHub project and include it

This is SOP A preceded by repository creation. Do not blur the two authorities.

### 1. Agree repository identity

The owner decides:

- GitHub owner/organization and repository name;
- public or private visibility;
- local absolute directory;
- initial branch/license policy.

Confirm `gh auth status` has authority for the selected owner. Missing authority is a real gate.

### 2. Establish a base branch

For a new private Ronin repository, create a minimal base commit on `main` (for example a concise
README). This gives implementation work a stable PR base. Then clone it into the agreed sibling
directory and verify the top level, origin, and branch.

Never nest the checkout inside another project repository. Never put production data or secrets
in the checkout.

### 3. Include and verify

Run SOP A steps 1–4 against the new directory. Repository creation is not proof of Ronin
inclusion, and a catalog entry is not proof the repository exists; both halves must pass.

### 4. Include it in the owner's file sync when this machine uses one

This step is conditional, but the check is mandatory. A hosted Ronin machine may use Syncthing,
Dropbox, or another owner-chosen mechanism to make project files visible on their own computer;
a local install may need nothing.

Measure rather than infer:

1. Read the machine's standing sync documentation and applicable SOP (for Syncthing,
   `ronin_sops/syncthing.md`).
2. Check the actual running process/API and inventory its configured folders. Do not conclude
   that syncing is absent from one inactive systemd scope; Syncthing can run as a user or system
   unit.
3. If sibling project repositories are shared but the new project is absent, add a share using
   their established folder-id, device, path, type and ignore conventions.
4. Configure **every receiving device**, not only the hosted box. A one-sided Syncthing folder is
   merely a pending offer and syncs nothing.
5. Exclude generated/runtime material such as `node_modules` using the same conventions as sibling
   repositories. Never sync production data, secrets, browser profiles, caches or deployment
   state merely because the source checkout is shared.
6. Rescan on the machine where the files originate, then prove the peer is connected and reports
   completion 100% with zero needed items. Search both ends for sync-conflict files.

If the agent cannot reach the receiving device, it may configure and verify the hosted side, but
must report the precise pending acceptance step to the owner. It must not call a one-sided offer
complete.

Sync is visibility, not backup. Git remains source history and the off-machine production backup
remains a separate requirement.

### 5. Establish and obey the repository's publishing arrangement

Choose the mode with the owner; do not decide from the repository name alone. The full
contract is `ronin_sops/github.md`.

Under the reviewed arrangement, a repository declares a working and stable branch. Ronin's
current product repositories use:

```text
dev       current integrated development work
master    released/reviewed line
```

The repository says which arrangement it uses in `RONIN_REPO` at its root (`mode`, `working`,
`stable`, `desks`); tools read that file and never infer the arrangement from the branch that
happens to be checked out (`libexec/ronin-repo-mode`). `dev` and `master` are **funnel
points**: merged into, never edited in place, and the only two lines that reach the remote.
The normal review PR is **`dev → master`**, and it carries the team-promotion receipt that
proved the PR's head commit (`docs/release.md`). Do not push per-feature, per-agent, phase,
remediation, or topic branches to the remote; merged PR head branches accumulating beside
`dev` and `master` are repository clutter and make Admin Desk look as though unfinished work
remains.

A session that changes code works at a **repo desk** — its own branch and worktree, cut from
its team's line (`ronin_session_boot/assignment/DESK_CONTRACT.md`; the model is the lab's
WORKTREES buildout). Commit preserves work privately at the desk;
**hand-in** publishes committed work to the team line; the lead's **team promotion** runs the
one full repository BYOIN and admits the team's state to `dev`. A desk branch is never
published to the remote and never opened as a PR. Until a repository's desks are enabled, its
home checkout is shared: stage only your own paths and preserve every unrelated change there
(the claim guard, `libexec/ronin-claim`, refuses a commit carrying files your session never
staged).

For a new reviewed repository, agree whether the stable branch is `main` or `master`, create
`dev` from it, make the stable branch the GitHub default, and enable automatic deletion of
merged PR head branches as a backstop—not as a substitute for the two-branch rule. Normal work
never merges its own PR from the working branch to the stable branch and never deploys via
`git pull`.

Under the direct arrangement, the repository declares one branch—`main` or `master`—that agents
may publish to without a PR. In a laboratory, agents commit and push coherent checkpoints,
including deletions and abandoned directions, because its history is how earlier ideas remain
recoverable. Agents stage only their own work, fetch before pushing, never force-push, and
preserve the unsquashed history. `ronin-lab` declares direct publishing to `main`.

## Edit, archive and exclude

- `PUT /api/project-roots/:name` edits only named fields and preserves the rest of the block.
- `archived: yes` removes a root from the new-session picker while retaining it in Admin Desk.
- `DELETE /api/project-roots/:name` removes the catalog block only. It never deletes the directory
  or GitHub repository.

Always state which of those three outcomes is intended. "Remove this project" is ambiguous and
must not become a filesystem deletion by assumption.

## Failure rules

- Directory absent: stop; create/clone it or correct the path before inclusion.
- Invalid handle: choose a valid lowercase handle; do not weaken validation.
- Wrong git top level: choose the repository root rather than a nested directory.
- Wrong/missing remote: repair repository identity before presenting it as a project repo.
- Duplicate handle: inspect before editing; never silently replace another project.
- Ronin API unavailable: report the service failure. Do not create a competing write path.
- Browser does not show an API-verified root: diagnose the read/render path, not the catalog data.

## Which campaign a root belongs to

A project_root carries a `- **campaign_id:**` line naming the body of work it belongs to.
An Agent and a Cowork may reference only a root in their own campaign, and the refusal names
both. Root **names stay globally unique** — the catalog keys them by heading — so a combined
multi-campaign view groups roots by campaign rather than merging same-looking names.

A root written before campaigns has no line, which reads as unmarked and resolves to the
initial campaign until the boot migration stamps it. The full contract, including why a
roster nests its storage where a root does not, is `docs/campaign-scope.md`.

## Implementation authority

- Catalog storage and validation: `src/project-roots.ts`
- Campaign scoping, the refusals and the migration: `src/campaign-scope.ts` · `docs/campaign-scope.md`
- HTTP API and live facts: `src/routes/catalogs.ts`
- Session identity: `src/tmux.ts` and `src/routes/sessions-api.ts`
- Assisted owner workflow: `ronin_catalogs/MIKA_MACROS.md` (`project_root`)
- Session-boot shelf: `docs/session-boot.md`
- Owner configuration boundary: `docs/user-config.md`
