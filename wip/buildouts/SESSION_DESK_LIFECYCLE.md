# Session and desk lifecycle repair

## Goal

Fix the recurring Ronin defect in which closing a managed desk removes its worktree while
the owning live Agent terminal still uses that worktree as its current directory, making
all later turns fail with an invalid cwd. Establish the exact failure seen by
`setup_gbrain_form` and `setup_services_impl`, preserve the intended distinction between
desk close and session archive/end, and explain and correct the case where
`tejun-desk sync` reports `ADOPTED` without advancing a stale clean desk.

This work is limited to session/desk lifecycle mechanics. It must not absorb or redesign
the Setup workbench execution work.

## Legs

1. Reproduce and locate both defects.
   - Trace desk close, session cwd tracking, archive/end, and sync/adoption through the
     HTTP command surface and lifecycle services.
   - Use only a `ronin-testserver open <name>` server for tmux reproduction, and close it
     afterward.
   - Capture a deterministic closed-worktree/live-session invalid-cwd reproduction that
     matches the two affected Setup sessions.
   - Construct a stale, clean managed desk and prove the exact state transition that can
     print `ADOPTED` without moving its branch tip.

2. Settle the lifecycle contract and choose the KISS repair.
   - A desk close removes only a clean desk already integrated into its line.
   - Closing a desk does not end a live session; the session must remain usable from the
     project root after its assigned worktree disappears.
   - Archiving preserves a resumable session; hard end/delete intentionally does not.
   - Sync must distinguish a real branch update from metadata/source adoption and must
     not imply that a stale desk advanced when it did not.
   - Keep the repair in lifecycle/desk infrastructure, not Setup workbench code.

3. Implement the smallest repair and focused regressions.
   - Rehome a live owning session safely before its managed worktree is removed, through
     the existing tmux control-mode boundary.
   - Make the sync result accurately describe and/or perform the required stale-clean
     desk advancement, based on the reproduction.
   - Add behavior tests for close with a live owning session, archive/end distinctions
     where relevant, refusal/error preservation, and the stale-clean sync case.

4. Document and prepare promotion evidence.
   - Update the standing lifecycle/worktree documentation with the resulting semantics.
   - Remove this buildout when all remaining work has landed.
   - Commit coherent checkpoints, hand them in to the Team line, run narrow tests while
     developing, then run `npm run verify` as Team Lead before promotion.
   - Report the exact reproduction, root causes, behavioral change, focused and full
     verification, and any residual risk before promotion.

## Constraints

- Do not touch a live or ad-hoc tmux server; all diagnostic tmux commands use the path
  returned by `ronin-testserver open`.
- All server-to-tmux calls remain behind `src/tmux-client.ts`; non-tmux processes remain
  behind `src/spawn-broker.ts`.
- Do not modify Setup workbench behavior except for an unavoidable test fixture reference;
  the lifecycle fix must be general.
- Do not close this session's own desk before its hand-in is promoted to local `dev`.
- Preserve unrelated user changes and never Git-push a desk or Team line.

## Proposed agent assignments

If parallel work is wanted after this plan is approved:

- A reproduction agent on a fresh managed desk from the Team line: isolate the
  closed-desk/live-session cwd sequence using `ronin-testserver`, producing tests or a
  concise handoff but no Setup implementation changes.
- A sync agent on a fresh managed desk from the Team line: isolate the
  `ADOPTED`-without-advancement state machine and propose the smallest corrected contract.

The lead retains lifecycle semantics, integration, documentation, full verification, and
promotion. These agents are proposals only; none has been launched.

## Verification

- Focused unit/behavior tests for desk close, session cwd recovery, and desk sync.
- Any relevant explicit Playwright diagnostic only if the defect cannot be proven below
  the UI; it is not part of the default verdict.
- `npm run verify` on the coherent Team review line before promotion.
- `npm run byoin` only if the repair changes an installed box or user stores.

## Definition of done

- The prior invalid-cwd sequence is deterministic in a regression test and passes after
  the repair: closing an eligible managed desk leaves its live Agent able to take a next
  turn from the project root.
- Close, archive, and hard-end semantics are explicit and covered at the appropriate
  boundaries.
- A stale clean desk can no longer receive a misleading `ADOPTED` result without the
  branch/state outcome being made explicit and correct.
- The change is independent of Setup workbench execution, documented as current behavior,
  narrowly tested, fully verified by the Team Lead, committed, and handed in for review.
