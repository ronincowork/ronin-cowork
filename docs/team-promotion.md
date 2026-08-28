# Team promotion — the one full BYOIN, and the receipt that proves it

The lead's admission of a team line into `dev`. Semantic authority: the WORKTREES and
RONIN_CONTROL_SURFACE build-outs in ronin-lab. This page is the mechanism and the interface:
what `bin/ronin-promote` does, what it writes, and what PR/CI reads from it.

## Where BYOIN runs — the schedule

| Boundary | Check | Why |
|---|---|---|
| save · commit | none | private to the desk |
| hand-in → team line | mechanical admission (merge, conflict, near-instant invariants) | shares work with the team; nothing has entered `dev` |
| **team promotion → `dev`** | **the full repository BYOIN, once, on the exact candidate** | the closest shared-code boundary; the lead can attribute a failure |
| `dev → master` PR | CI **consumes** the promotion receipt for the PR head, then may rerun `--gates` for assurance | `dev` already carries a receipt for that SHA |
| after `dev` moves | restart from the `dev` worktree; deployment health checks; automatic revert on failure | the one failure that surfaces after the ref moved |
| installed-box maintenance | full installed-box BYOIN (`docs/test-protocols.md`) | tests the machine, not the repo |

`bin/ronin-byoin` is unchanged: it runs against the worktree it is run in. Promotion runs
it in the candidate worktree, so the verdict is about the commit that becomes `dev`.

## What `bin/ronin-promote <team>` does

1. **Prepare** — for every repo on the team's roster (`repos`, else its `project_root`),
   resolve the home checkout, the line (`branch` on the roster, else `team/<team>/dev`)
   and the target (`working=` in the repo's `RONIN_REPO`). Build the candidate: a
   throwaway worktree detached at the target's tip, the line merged into it. Under the
   `worktrees` store, `.candidates/<repo>/<target>` — beside the desks, out of their way.
   A conflict, a missing line, or unsaved tracked changes in the funnel worktree refuses
   the whole promotion; `dev` is untouched. A line already in its target is skipped.
2. **Prove** — each repo's own `bin/ronin-byoin` in its candidate (`--mode full` by
   default; the receipt records which), then the **combined compatibility protocol**
   across the candidates. For cowork + services that is: `CONTRACT_V` agrees between the
   two `sockets-contract.ts` files, and services' `bin/dev-sync` mirrors the services
   candidate into the cowork candidate, where the seam gate (`check-kyokai`) and `tsc`
   run across the assembled pair. A repo with no BYOIN of its own is a SKIP that the
   compatibility protocol must cover, never a pass it did not earn.
3. **Receipt** — written to the `promotion_ledger` store *before* the first ref moves.
4. **Advance** — each target ref by compare-and-swap (`git update-ref <ref> <candidate>
   <expected_old>`) in receipt order; the mounted funnel worktree is then refreshed to the
   new tip. The first race stops the rest: refs past it are `skipped`, the receipt goes
   `interrupted`, and nothing is overwritten.
5. **Restart + health** — `systemctl --user restart ronin`, then `/api/health` and the
   render check (`scripts/smoke-ui.mjs`, a SKIP with no browser). On failure, `team
   revert` runs automatically through the same door and the team wipeboard is told.

`--dry-run` does 1–2 and writes nothing. `--no-restart` stops after 4.

## Recovery: resume, abandon, revert, bisect

- **`resume <id>`** — an interrupted promotion: refs already `done` stay done; raced or
  skipped repos are rebuilt on their *current* tips as a new promotion (own receipt), and
  the interrupted receipt closes as `complete` pointing at it, or `abandoned` if the rebuild
  did not land. A receipt left `advancing` by a process that died is resumed the same way
  after checking which refs actually moved.
- **`abandon <id> <why>`** — the lead gives an interrupted promotion up. Refs already moved
  stay moved; the receipt says which.
- **`revert <id>|last`** — a revert commit of that promotion's range per repo, landed on
  `dev` through the same door (candidate, full BYOIN, compare-and-swap, restart, health).
  Built on a throwaway `revert/<id>` branch, never on the team's line. The promotion is
  marked `reverted` with `reverted_by`; the range stays in the ledger, attributed.
- **`bisect <team>`** — when a failing gate does not name its culprit: rebuild the line's
  candidates one hand-in at a time from the target's tip, full BYOIN at each step, and
  name the first that fails with the files it touched. Moves nothing.

An `interrupted` (or orphaned `advancing`) receipt **blocks** every new promotion of that
team until resumed or abandoned. A `failed` receipt does not: nothing moved.

## The receipt

One JSON per attempt, `bin/ronin-store promotion_ledger` (data root; it outlives no
uninstall and is never in a repo — committing it onto `dev` would change the SHA it
proves). Shape: `src/promotion/receipts.ts`. The fields that matter to a reader:

```text
id            <utc stamp>-promote-<team>-<rnd>   (or -revert-)
kind          team_promotion | team_revert
state         preparing → proving → advancing → restarting → complete
              failed      stopped before any ref moved; dev untouched
              interrupted stopped after ≥1 ref moved; resume or abandon
              reverted    health failed; a revert landed (reverted_by)
              unhealthy   health failed and no revert landed; the lead decides
              abandoned   the lead gave an interrupted one up
history[]     every state it went through, with times — never rewritten
repos[]       repo · dir · line · target · expected_old · line_tip · candidate ·
              hand_in_receipts[] · files[] · (refused · conflict_files[])
proofs[]      repo · candidate · mode · passed · gates[{name,status,detail}] · verdict
compat        passed · checks[]
advances[]    repo · target · from · to · status pending|done|raced|skipped · found
restart       unit · at · ok
health        passed · checks[] · at
failure       stage · message · gates[] · files[] · hand_in_receipts[]
revert_of / reverted_by
```

`hand_in_receipts[]` are the desks ledger's ids (`src/desks/schema.ts`, `HandInReceipt`)
once that ledger answers; until then, the first-parent commits that carried the line
from `expected_old` to `line_tip`, oldest first — one per accepted hand-in either way.
`toChangeSet()` projects a receipt onto Fable 1's `ChangeSetReceipt`, the shape the
roster reads (`show <id> --shared`).

## The PR/CI contract

A `dev → master` pull request is not the first full check. CI reads the receipt for the
PR head and verifies — `scripts/verify-promotion-receipt.mjs`:

- `state == complete`, `kind` is a promotion or a revert;
- `repos[<repo>].candidate` **is the PR head SHA**;
- `proofs[<repo>]` for that SHA: `passed`, `mode == full`;
- `advances[<repo>]` to that SHA: `status == done`;
- no `reverted_by`.

The receipt rides in the PR body as a fenced block, which `show` prints ready to paste:

```sh
bin/ronin-promote show <id> --pr-block
```

A PR without the block fails CI. Any failure it names still points back through the
receipt's `hand_in_receipts` and `files` to the desk and session that introduced it.

## Tests

`tests/promotion-receipts.test.ts` (the ledger and state machine, temp store) and
`tests/promotion.test.ts` (the executor against a scratch git repository: failed proof,
conflict, dirty funnel, the mid-advance race and its resume, a died-mid-advance receipt,
health failure → revert, bisect, dry run — BYOIN, restart, health and the wipeboard
faked). `byoin.ts` and `health.ts` are the real effects and need a machine.
