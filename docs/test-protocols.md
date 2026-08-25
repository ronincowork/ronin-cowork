# test_protocols — one release-candidate verdict

This is the provider-neutral testing contract. It reaches every coding agent through
`AGENTS.md`, `CLAUDE.md`, and `ronin_session_boot`; it does not depend on one model's memory.

## Repository development

Ordinary work on `dev` does **not** run BYOIN after a leg, before a commit, before a push,
or after a service restart. Development uses direct dogfood and the smallest scoped,
diagnostic evidence needed to understand the change. Individual checks may be run for that
diagnostic purpose; they are not a substitute release verdict and should not be expanded
into a private imitation of BYOIN.

One designated integrator runs exactly one appropriate BYOIN mode against the exact
`dev → master` release candidate:

```sh
bin/ronin-byoin --gates   # repository-only candidate; browser checks explicitly SKIP
bin/ronin-byoin --ui      # candidate changes rendered UI, browser journeys or composition
```

The integrator reads the complete verdict and records every SKIP as unverified. If the
candidate changes after that run, it is a new candidate and needs a new designated verdict.
Ordinary contributors do not rerun BYOIN around their individual commits.

GitHub runs the isolated `--gates` workflow only for a pull request to `master` or an
explicit `workflow_dispatch`. It does not run on pushes to `dev` or `master`. Local pushes
have no BYOIN pre-push hook. CI is release-boundary evidence, not dev-loop cadence.

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
