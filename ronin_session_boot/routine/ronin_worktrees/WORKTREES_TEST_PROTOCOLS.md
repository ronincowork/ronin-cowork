# CONTROL TEST PROTOCOLS — repository development

This reading belongs to the **Ronin Control** Routine. It is the repository-development
half of `docs/test-protocols.md`. During the transition to effective-Routine startup
reading, `all/TEST_PROTOCOLS.md` remains the compatibility copy.

Ordinary work at a managed desk does **not** run full BYOIN after a leg, before a commit,
at hand-in, or after a service restart. Use direct dogfood and the smallest scoped,
diagnostic evidence appropriate to the change. An individual check is evidence for that
diagnosis, not a substitute release verdict.

| Boundary | Check |
|---|---|
| save · commit | none — private to the desk |
| hand-in → team line | mechanical admission: merge, conflict detection and near-instant invariants |
| **team promotion → `dev`** | **one full repository BYOIN**, on the exact assembled candidate |
| `dev → master` PR | CI consumes the promotion receipt; an isolated rerun is assurance |
| after `dev` moves | restart from `dev`, health checks, and automatic revert on failure |

Team promotion belongs to the lead or compiler. Contributors commit coherent checkpoints
and hand them in; they do not privately imitate the promotion gate. A rōnin's
`solo/<session>` hand-in goes directly to `dev`, so that hand-in is its promotion boundary.

The receipt is valid only for its exact candidate SHA and must record a full verdict. A
changed candidate needs a new verdict. `SKIP` means unverified, never passed. GitHub's
isolated checks verify the promoted SHA; they are not the first full repository check.

See `docs/test-protocols.md` and `docs/team-promotion.md` for the provider-neutral release
contract and promotion mechanism.
