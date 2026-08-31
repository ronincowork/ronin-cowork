# HOST TEST PROTOCOLS — installed boxes and user stores

This reading belongs to the **Ronin Host** Routine. It is the installed-box and user-store
half of `docs/test-protocols.md`. During the transition to effective-Routine startup
reading, `all/TEST_PROTOCOLS.md` remains the compatibility copy.

After installed third-party-box maintenance, an update, or a user-store customization,
run the installed-box verdict:

```bash
bin/ronin-byoin
```

This is separate from Ronin Control's repository-development cadence. Repository checks
prove the installed checkout; `ronin-doctor`, `byoin_user_check`, and store readouts prove
the machine and that user customization still surfaces. An empty or absent user store is
valid.

Verdict language is strict:

- **ok** — the named check ran and passed.
- **FAIL** — the named check ran and found a problem.
- **SKIP** — the check did not run; it is neither failure nor proof.

When diagnosing a named failure, rerunning that individual check is appropriate scoped
diagnosis. The release or maintenance verdict remains the designated complete BYOIN run.
See `docs/test-protocols.md` for the provider-neutral contract.
