# Dirty funnel recovery — root cause and build-out recommendation

Status: design for owner review; no implementation has begun.

## Incident finding

Promotion receipt `20260831T075710Z-promote-user_enroll-hq3l` is correct: it prepared
the Cowork candidate, then refused the coordinated promotion because the site's mounted
`dev` worktree had five tracked modifications. No ref moved and no BYOIN ran.

The evidence does not show an Agent writing into a reviewed funnel after review was
declared. The five tracked files have mtimes on 2026-08-23; the site's `RONIN_REPO`
declaration made it reviewed on 2026-08-28. The transition admitted a dirty checkout and
left discovery until the next promotion. The immediate root cause is therefore a missing
reviewed-mode readiness/migration check, compounded by a missing recovery workflow.

All five tracked working-tree blobs are already committed on named branches. One branch,
`fix/label-vm-provider-comparison-20260823`, contains byte-identical versions of all five.
The untracked VM explainer is also committed. The untracked `.stignore` is unique, but it
does not trigger the current tracked-dirt refusal. Two dirty paths (`docs/site.md` and
`explainers/index.html`) overlap the pending `user_enroll` candidate, and a three-way merge
between the preserved branch and that team line conflicts in both. Preservation is thus
already satisfied for the blocking bytes, but reconciliation is not.

The misleading root result is independently reproduced: resolving stores with `HOME=/root`
causes `ronin-promote user_enroll --dry-run` to say only `no team roster 'user_enroll'`.
`reposForTeam()` reads the current process's store before diagnosing operator/store
identity, so a wrong-user invocation is misreported as missing campaign data.

## Whole-bundle audit

The failure is wider than the promotion command. Ronin currently has two legitimate Git
arrangements, but its instruction and optional file-coordination boundaries do not yet
route them cleanly.

The owner's public coordination model has four choices:

```text
bare Agent
Cowork floor
Ronin Base
managed file coordination (optional)
```

The last choice coordinates files and integration when several Agents work in parallel:
managed worktrees, hand-in, lead integration/promotion, receipts and Git safeguards. It
does not control Agents and must not be presented publicly as “Ronin Control.” The
internal `ronin_control` Routine token may remain as a compatibility seam until KOTOBA is
deliberately renamed; this build-out does not perform that vocabulary migration.

The repository arrangements are:

| Fact | Reviewed product repository | Direct-publishing repository |
|---|---|---|
| declaration | `mode=reviewed`, working + stable lines, normally managed desks | `mode=direct`, stable line only, no desks |
| examples | Cowork, Services, Site, Shiwake | Lab, Koe |
| ordinary work | desk → hand-in → team line → promotion → `dev` | commit on `main` → Git push |
| publication | release process pushes `dev`, opens `dev → master` PR | working Agent pushes `main` directly |
| risk model | `dev` is shared/live; candidate proof, receipts, restart/revert | history is the artifact; no live reviewed funnel |

That distinction is sound. The problem is where it is taught and delivered:

- `ronin_methodology.md` is assigned to Ronin Base, but its source-control sections teach
  the complete managed file-coordination lifecycle (desks, `tejun-desk`, hand-in,
  promotion and receipts). A Base-only Agent can therefore be taught optional behavior
  its birth did not deliver.
- `github.md` is assigned to the internal `ronin_control` manifest, but it teaches both
  the reviewed and direct arrangements. The optional managed-coordination package is
  carrying instructions for the direct model in which its machinery is inapplicable,
  while a Base-only direct Agent does not get that SOP through its manifest.
- Both SOPs still teach retired park/recover semantics, contradicting the current owner
  ruling that a desk is handed in, handed off/co-owned, or explicitly closed.
- `github.md` says a direct repository can have `desks=managed`; `openDesk()` refuses every
  direct repository. The declared arrangement and executable contract disagree.
- Routine definitions, catalog checks and the hard-coded Routines surface exist, but the
  Campaign → Team Routine resolver and its birth projections are not implemented yet.
  Current desk opening is driven by lifecycle plus `RONIN_REPO`, independently of an
  effective managed-coordination selection. The surface publicly calls this “Ronin
  control” and “per repository,” while the standing Routine contract defines selection by
  Campaign and Team and applicability by repository. Both the name and the model drift.
- The launch brief is strong when an assignment exists, but a coding launch with no
  assignment says nothing about desks. Its receipt may explain why; the Agent prompt does
  not. In a reviewed root, that silence makes the shared/live funnel look like an ordinary
  place to edit.

The governing conjunction should be explicit:

```text
effective behavior = Routine enabled and delivered
                     + repository arrangement applicable
                     + launch lifecycle applicable
```

These are separate facts. `RONIN_REPO` never turns an optional package on; an enabled
package never changes a repository from direct to reviewed. For a reviewed coding launch,
managed file coordination on means a managed desk is opened and taught. With it off, none
of its behavior is delivered, but the Cowork birth must still state the neutral fact that
the selected root is a reviewed funnel and no managed working place was supplied. That is
an honest warning, not an enforcement claim. For a direct repository, managed file
coordination may be enabled at Campaign level but is inapplicable to that root; the receipt
says so and no desk is invented.

### Instruction cut

Do not keep two overlapping all-purpose Git SOPs. Cut responsibility this way:

1. **Ronin methodology (Base) stays arrangement-neutral.** It owns work records,
   documents, Teams, coordination, planning and the general rule that work must become
   durable. Its source-control paragraph says to read the repository declaration and use
   the applicable delivered workflow; it does not name `tejun-desk`, branch topology,
   promotion, PR ownership, or direct-push commands.
2. **Direct Git guidance is general/Base situation reading.** `github.md` can own repository
   creation, secrets, small commits, shared-checkout coordination, fetch/integrate/push,
   and direct-to-stable history. It is discoverable to Agents who may need ordinary Git
   without managed file coordination.
3. **Reviewed Git guidance belongs wholly to managed file coordination.** Add a distinct
   SOP (working name `github_reviewed.md`, final catalog name to be reviewed) containing
   desk → hand-in → team promotion → release PR, receipts, conflict ownership and funnel
   recovery. The desk contract remains the short birth reading; the SOP is fetched when
   the situation calls for source-control work. The manifest may still be spelled
   `ronin_control` internally, but no public text teaches that name.
4. **Repository-local instructions remain the final concrete pointer.** `AGENTS.md`/
   README state only the declared arrangement, test boundary and relevant standing doc;
   they do not duplicate the whole SOP. Direct Lab/Koe instructions say direct `main`;
   Cowork/Site/Services/Shiwake say reviewed and point to the delivered managed path.
5. **One mechanical consistency check.** For every stock repository fixture and launch
   matrix, assert that declaration, effective Routine receipt, cwd/desk, boot reading,
   macro roster, command names and prompt all tell one story. Search checks also reject
   managed-coordination-only terms from Base methodology and retired park/recover wording.

## Boundaries that must remain

- Ronin Routines guide and equip Cowork Agents. They do not claim to prohibit a process
  from using other installed commands or paths.
- The launch path may make a managed desk the obvious, low-friction choice and refuse its
  own unsafe fallback. That is a claim about Ronin's launch transaction, not a fortress.
- Promotion must continue refusing a dirty mounted funnel before candidate proof or ref
  movement. Recovery must not add `--force`, stash-and-pop, or an implicit reset.
- Unique bytes are preserved before any funnel file changes. A named ref plus a durable
  receipt must make preservation inspectable; a stash is not sufficient.
- Preservation and reconciliation are separate decisions. “Already committed elsewhere”
  proves recoverability; it does not authorize merging that work or choosing it over the
  promotion candidate.
- Every mutation is scoped to paths whose current hashes still match the diagnosis.
  Concurrent change makes the transaction stop and re-inspect.
- Recovery is resumable and reversible. A crash may leave a visible in-progress receipt,
  never an unexplained half-clean tree.
- The owner can complete the workflow from the managed file-coordination surface; an
  Agent can invoke the same tool.
  Neither route requires the owner to SSH or assemble Git commands.

## Prevention

1. **Declare reviewed mode through a readiness transaction.** Before writing or accepting
   `RONIN_REPO desks=managed`, inspect the working and stable funnel worktrees. Report
   tracked and untracked dirt, in-progress Git operations, branch/worktree layout, and
   existing desks. A dirty result offers the recovery workflow; it does not silently mark
   the repository ready. Existing hand-edited declarations are diagnosed by Doctor and
   the project-root surface as “reviewed · funnel needs recovery,” not merely “managed.”
2. **Keep launch assistance concrete.** A coding/debug Cowork Agent on a reviewed repo
   already opens desks before spawn and starts in the primary desk. Strengthen the brief's
   first actionable sentence: name the current desk path, say that hand-in is the easy
   route to the team, and say “If this path and `tejun-desk status --assignment` disagree,
   stop and ask the lead.” Avoid “cannot,” “forbidden,” and supervision claims.
3. **Make the alternative explicit without endorsing drift.** When managed coordination
   is applicable,
   the launch control should read “managed desk (recommended)” versus “plain checkout,”
   with the latter explaining that Ronin will not provide desk/hand-in recovery there and
   that a reviewed root is the live funnel. A Routine being off remains non-delivery, not
   enforcement. The neutral floor/receipt may report arrangement and missing equipment;
   it must not smuggle managed-coordination commands into an off-Routine prompt.
4. **Surface funnel health before promotion.** Team/file-coordination status should show each target
   as `ready`, `dirty—preserved elsewhere`, `dirty—unique`, or `recovery in progress`, with
   path count, overlap with the current team line, last diagnosis receipt, and a single
   Diagnose/Recover action. The lead sees this before paying candidate/BYOIN cost.
5. **Prompt at useful boundaries.** DONE legs, hand-in, session close, reviewed-mode
   declaration, and promotion readiness should point to the existing desk/status tools.
   Prompts remain suggestions; only integration transactions retain hard data-safety
   refusals.

## Recovery transaction

Add one shared recovery engine used by an Agent tool and the owner-facing managed
file-coordination route.
Do not bury it inside `prepareCandidate`; promotion should call its read-only diagnosis and
return the recovery receipt/action when attention is needed.

### 1. Inspect and receipt

Capture, without changing the repository:

- process identity, repository owner, resolved user/data roots, roster path searched, and
  the likely owning account/store when they disagree;
- target ref/commit and mounted worktree; staged, unstaged, deleted, type/mode changes,
  untracked files, submodules, and in-progress Git operation;
- content hash and metadata for every dirty path;
- named local/remote-tracking refs whose tree contains each identical blob, plus a stronger
  “one named ref preserves the whole dirty tracked set” result when true;
- candidate changed paths, direct overlap, and a non-mutating three-way merge result;
- classification per path: identical-and-preserved, unique, or ambiguous/unreadable.

Write an immutable diagnosis receipt before offering mutation. Do not infer author from
mtime, reflog, or branch names; report those only as evidence.

### 2. Offer choices in plain language

- **Already preserved, no overlap:** “Use the committed copy on `<branch>`; restore this
  funnel path to `<target>`.” Nothing is merged.
- **Already preserved, overlap without conflict:** offer either clean-and-promote while
  leaving the branch for later, or prepare a separate reconciliation candidate for review.
- **Already preserved, conflicting overlap:** say preservation is safe but the two bodies
  of work conflict. Default to clean-and-promote while leaving the named branch untouched;
  a separate desk/hand-in later adjudicates that branch. Never auto-pick a side.
- **Unique work:** “Preserve on a recovery branch, then clean and retry” is the recommended
  single action. “Leave unchanged” is always available. Destructive discard requires a
  separate explicit confirmation after preservation status is shown.
- **Mixed:** preserve all unique paths first, then handle duplicate/conflicting paths by
  the rules above. One folder can contain more than one class.

### 3. Preserve without touching the funnel index

Use a temporary index/worktree-independent snapshot, not `git stash` and not a commit made
in the funnel checkout. Build a tree from the target commit plus the exact diagnosed dirty
state (including staged/unstaged distinction in the receipt, file modes, deletions, binary
content, symlinks and selected untracked files), create a commit with the target as parent,
and compare-and-swap a branch such as `recovery/<receipt-id>`. Also store a manifest with
hashes and the recovery commit. Re-read every source hash before publishing the ref; drift
refuses the operation.

The receipt moves `diagnosed → preserving → preserved → clearing → clean`, or `stopped`
with the exact completed actions. The recovery ref is never deleted automatically.

### 4. Clear and reconcile safely

After preservation proof, restore only the diagnosed tracked paths to the still-current
target, guarded by their diagnosed hashes. Untracked files are not removed merely to make
promotion happy; offer their own preserve/keep/remove choices. Re-inspect the complete
worktree. If tracked dirt remains, stop with the new paths. If clean, mark the receipt
recoverable with the inverse facts (target-before, recovery ref, hashes).

### 5. Resume promotion

The failed promotion receipt should link to the recovery receipt. “Recover and retry”
rebuilds all candidates from current refs; it never reuses the previously prepared Cowork
candidate. The new promotion gets its own receipt and records `retry_of`/`recovered_by`.
The original failed receipt remains failed and truthful.

## Wrong-user/store diagnostic

Before roster lookup, promotion and recovery should emit an identity preflight. If the
resolved roster store has no requested roster and the process identity/store root differs
from the repository/service owner, report:

> Running as `root`; Ronin stores resolve under `/root`. This repository/install is owned
> by `glen3`, whose Team records are outside the store searched. Run this through the
> owner-facing managed file-coordination action, or as the owning Ronin account. No
> repository state changed.

The implementation must derive identities and paths at runtime (account/store tools or the
same underlying modules), never hard-code `glen3`. A genuinely absent roster under the
correct owner keeps the existing “no team roster” diagnosis. The owner-facing API runs
under the Ronin operator account, so the ordinary owner workflow naturally selects the
right store.

## Recommended implementation cut

1. Resolve the instruction/Routine seam with the `CONTROL_BUNDLES` owner: adopt the four
   public choices, split Base, direct Git and reviewed managed-coordination teaching,
   remove retired park text, and define the
   enabled + applicable + lifecycle matrix and its birth receipt assertions.
2. Pure classifier and fixtures: dirty inventory, blob/ref preservation, whole-set branch,
   candidate overlap/merge result, identity/store preflight.
3. Recovery receipt schema/store and crash-safe state machine; snapshot/ref preservation
   before guarded clearing. Unit tests use scratch repositories and redirected stores.
4. `tejun-funnel diagnose|recover|show|resume` (final name subject to catalog/KOTOBA
   review) and `ronin-promote` integration that links receipts and rebuilds candidates.
5. Owner-facing Team/file-coordination status and actions using the same API, including confirmation
   for clearing/removal and downloadable/viewable receipts.
6. Reviewed-mode readiness in project-root declaration/Doctor, then launch/brief/status
   wording. Add promotion tests for duplicate, unique, mixed, overlap-clean, overlap-
   conflict, concurrent mutation, crash/resume, and wrong-user stores.

No full BYOIN belongs in these development legs. The one full repository BYOIN remains at
the eventual team promotion.
