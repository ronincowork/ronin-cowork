# Team promotion

`bin/ronin-promote <team>` calls the operator's HTTP promotion surface, which admits a
team line into its repository's working line, and prints the reply.
Promotion coordinates candidate construction, reference movement, restart, and health.
One box-wide lock covers that entire run across every team. A later promotion waits,
names the active team, receipt, and state, then proceeds when health has been recorded.
Locks older than the in-flight window are reclaimed with the reason shown.
Repository verification is independent: run `npm run verify` when a repository verdict is
needed.

## Promotion flow

1. Resolve every managed repository with accepted team work.
2. Build each candidate from the current working-line tip plus the team-line tip.
3. Write a promotion receipt before moving a reference.
4. Advance each working line with compare-and-swap and refresh its mounted worktree.
5. Return the `restarting` receipt id to an HTTP caller.
6. Restart the live app and run deployment health checks unless `--no-restart` was used.
   The continuation records health and closes the receipt as `complete`, `reverted`, or
   `unhealthy`. On boot, a fresh `restarting` receipt resumes at health.

`--dry-run` builds the candidates and moves nothing. A line already contained in its
working target needs no candidate.

## Recovery

- `resume <id>` rebuilds interrupted candidates from current tips. For a `restarting`
  receipt it runs restart and health, then records `complete`, `reverted`, or `unhealthy`.
- `abandon <id> <reason>` closes an interrupted attempt without undoing references that
  already moved.
- `revert <id>|last` builds and lands revert candidates, then restarts and checks health.
- `receipts [team]` and `show <id>` inspect the durable record.

Promotion receipts live in the `promotion_ledger` store. They record the candidate and
expected reference for each repository, each reference advance, restart and health
results, and recovery state. An interrupted receipt keeps partial movement visible until
it is resumed or abandoned.

Promotion is the lead's job. When nobody is marked 人 on the team, `ronin-promote` answers
`NO-LEAD: team <t> has no team lead …` and builds no candidate. The agent reports the gap
and asks for a lead to be marked on the Team page. A revert or resume is recovery and needs
no lead; `--anyway` authorizes the promotion. The hand-in reports accepted, waiting, or
the missing lead.

The release pull request is opened with:

```sh
bin/ronin-promote pr <team>
```

The command opens or updates the pull request from the current working line. GitHub runs
`npm run verify` on the pull-request head.

## Verification

`tests/promotion.test.ts` exercises candidate construction, box-wide serialization,
stale-lock recovery, compare-and-swap movement, interruption and resume, restart health,
revert, and dry-run behavior against temporary repositories.
`tests/promotion-receipts.test.ts` exercises receipt storage and state.
