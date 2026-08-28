<!--
  This PR is dev → master: the release boundary. It is NOT the first full check. The one
  full repository BYOIN ran at team → dev, on the exact candidate, before dev moved, and
  dev carries a promotion receipt for its exact SHA. CI (verify.yml) consumes that
  receipt — it must be complete, its full-BYOIN proof must have passed on THIS PR's head
  commit, and the ref advance must be done — and only then reruns --gates for release
  assurance. A PR without a receipt fails. docs/release.md · docs/test-protocols.md.
-->

## What this changes

<!-- One paragraph. What is different afterwards, and why it needed to be. -->

## Promotion receipt

<!-- Paste the receipt that proved this PR's head commit, whole, inside the fence below.
     It comes from the team promotion ledger (bin/ronin-store promotion_ledger, one
     <id>.json per attempt); the team lead or the promotion tool hands it to whoever
     opens the PR. CI parses this block; its name matters. -->

```ronin-promotion-receipt
```

- [ ] the receipt's `state` is `complete` and its `repos[cowork].candidate` is this PR's head SHA
- [ ] GitHub `verify` is green for this PR (receipt verified, then the `--gates` rerun)
- [ ] any SKIP in the receipt's proof named below, with what it means was **not** checked

<!--
  A SKIP is neither failure nor proof. The render check skips on a box with no
  headless browser (docs/host-tools.md) — that is ordinary, and it means the
  page has NOT been looked at. Say so rather than letting green stand in for it.
-->

## Anything a reviewer should not have to discover

<!-- A shared file you touched, a decision you made that could have gone the other way,
     a hand-in the ledger attributes to another session that a reviewer should know of. -->
