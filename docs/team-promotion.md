# Team promotion

`bin/ronin-promote <team>` admits a team line into its repository's working line.
Promotion coordinates candidate construction, reference movement, restart, and health.
Repository verification is independent: run `npm run verify` when a repository verdict is
needed.

## Promotion flow

1. Resolve every managed repository with accepted team work.
2. Build each candidate from the current working-line tip plus the team-line tip.
3. Write a promotion receipt before moving a reference.
4. Advance each working line with compare-and-swap and refresh its mounted worktree.
5. Restart the live app and run deployment health checks unless `--no-restart` was used.

`--dry-run` builds the candidates and moves nothing. A line already contained in its
working target needs no candidate.

## Recovery

- `resume <id>` rebuilds unfinished candidates from current tips and completes the
  interrupted change set.
- `abandon <id> <reason>` closes an interrupted attempt without undoing references that
  already moved.
- `revert <id>|last` builds and lands revert candidates, then restarts and checks health.
- `receipts [team]` and `show <id>` inspect the durable record.

Promotion receipts live in the `promotion_ledger` store. They record the candidate and
expected reference for each repository, each reference advance, restart and health
results, and recovery state. An interrupted receipt keeps partial movement visible until
it is resumed or abandoned.

The release pull request is opened with:

```sh
bin/ronin-promote pr <team>
```

The command opens or updates the pull request from the current working line. GitHub runs
`npm run verify` on the pull-request head.

## Verification

`tests/promotion.test.ts` exercises candidate construction, compare-and-swap movement,
interruption and resume, restart health, revert, and dry-run behavior against temporary
repositories. `tests/promotion-receipts.test.ts` exercises receipt storage and state.
