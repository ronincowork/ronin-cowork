# test_protocols — one release-candidate verdict

This is the provider-neutral testing contract. It reaches every coding agent through
`AGENTS.md`, `CLAUDE.md`, and `ronin_session_boot`; it does not depend on one model's memory.

## Repository development

Ordinary work at a desk does **not** run BYOIN — not after a leg, not before a commit,
not at a hand-in, not after a service restart. Development uses direct dogfood and the
smallest scoped, diagnostic evidence needed to understand the change. Individual checks
may be run for that diagnostic purpose; they are not a substitute verdict and should not
be expanded into a private imitation of BYOIN.

The schedule (the WORKTREES build-out in ronin-lab, "What runs where"; mechanism in
`docs/team-promotion.md`):

| Boundary | Check |
|---|---|
| save · commit | none — private to the desk |
| hand-in → team line | mechanical admission only: the merge, conflict detection, near-instant invariants |
| **team promotion → `dev`** | **the first full repository BYOIN** (`bin/ronin-byoin --repo`), on the exact candidate, run by `bin/ronin-promote` |
| **`dev → master` PR** | **the second full repository BYOIN** (`bin/ronin-byoin --repo`) on the exact PR head, after CI consumes its promotion receipt |
| after `dev` moves | restart from the `dev` worktree, deployment health checks, automatic revert on failure |

The first full BYOIN runs exactly once per promotion into `dev`, by the lead or
compiler, in `dev`'s candidate worktree — `current dev + the team line's tip` — and `dev`
then carries a receipt for its exact SHA (`bin/ronin-store promotion_ledger`):

```sh
bin/ronin-promote <team>             # candidates → full BYOIN → receipt → advance → restart → health
bin/ronin-promote <team> --dry-run   # prove only; nothing written, nothing moved
```

The receipt records which mode ran; CI requires `full`. A SKIP in it is unverified, and
a candidate that changes after its run is a new candidate. Ordinary contributors do not
run BYOIN around their commits or hand-ins; a rōnin's `solo/<session>` hands in straight
to `dev`, so that hand-in *is* the promotion boundary and carries the full BYOIN.

GitHub runs the second full BYOIN only for a pull request to `master` or an explicit
`workflow_dispatch`, and it begins by verifying the receipt attached to the PR body
(`scripts/verify-promotion-receipt.mjs`) before any rerun. It does not run on pushes to
`dev` or `master`. Local pushes have no BYOIN pre-push hook. CI is release-boundary
evidence, not dev-loop cadence.

## Installed boxes and user stores

Agents maintaining an installed third-party box, applying an update, or customizing user
stores retain the full installed-box rule:

```sh
bin/ronin-byoin           # repository checks, UI tier where available, machine and user-store readouts
```

Run full BYOIN after installed-box maintenance, an update, or a user-store change such as a
session role, skin, macro, or SOP shadow. The repo checks prove the install; `ronin-doctor`,
`byoin_user_check`, and the store readouts prove the machine and that user customization
still surfaces. Empty or absent user stores are valid.

## Reading a verdict

- **ok** — the named check ran and passed.
- **FAIL** — the named check ran and found a problem; its output names the evidence.
- **SKIP** — the check did not run. A SKIP is neither failure nor proof.

BYOIN discovers its repository roster from `package.json`; no prose list duplicates it.
`byoin_check` names repository checks and `byoin_user_check` names installed user-store
checks. When diagnosing a failure already named by BYOIN, rerunning that individual check
is legitimate scoped diagnosis. The release verdict remains the one complete designated
BYOIN run.
