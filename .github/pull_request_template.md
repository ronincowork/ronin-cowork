<!--
  Before you open this: run the gates.

      bin/ronin-byoin --gates

  CI runs the same set (`--gates`), so a red PR here is a fault you could have
  seen locally in seconds. The pre-push hook runs it for you when hooks are
  wired — `git config core.hooksPath .githooks`, which `./setup.sh` does.
-->

## What this changes

<!-- One paragraph. What is different afterwards, and why it needed to be. -->

## Gates

- [ ] `bin/ronin-byoin --gates` — green, with its browser-UI SKIPs understood
- [ ] if UI-affecting: `bin/ronin-byoin --ui` — green, or its SKIPs named below
- [ ] any SKIP named below, with what it means was **not** checked

<!--
  A SKIP is neither failure nor proof. The render check skips on a box with no
  headless browser (docs/host-tools.md) — that is ordinary, and it means the
  page has NOT been looked at. Say so rather than letting green stand in for it.
-->

## Anything a reviewer should not have to discover

<!-- A shared file you touched, another session's work you had to work around,
     a decision you made that could have gone the other way. -->
