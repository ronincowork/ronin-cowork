<!--
  This PR is the isolated release boundary. Ordinary dev commits and pushes do not run
  BYOIN. Record the designated integrator's one exact-candidate verdict below; GitHub runs
  its own --gates check for this PR to master.
-->

## What this changes

<!-- One paragraph. What is different afterwards, and why it needed to be. -->

## Release-candidate evidence

- [ ] designated integrator ran one appropriate BYOIN mode on this exact candidate
- [ ] GitHub `--gates` check is green for this PR to `master`
- [ ] any SKIP named below, with what it means was **not** checked

<!--
  A SKIP is neither failure nor proof. The render check skips on a box with no
  headless browser (docs/host-tools.md) — that is ordinary, and it means the
  page has NOT been looked at. Say so rather than letting green stand in for it.
-->

## Anything a reviewer should not have to discover

<!-- A shared file you touched, another session's work you had to work around,
     a decision you made that could have gone the other way. -->
