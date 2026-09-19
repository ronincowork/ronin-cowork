# Developing Ronin

For contributors learning or changing the implementation. To use an installed Ronin,
start with the [documentation index](../README.md#evaluate-install-and-use-ronin).

- [Contributor map](../contributor-map.md): seven change areas and exact ownership.
- [CONTRIBUTING](../../CONTRIBUTING.md): contribution and review workflow.
- [Development method](ronin-methodology.md): managed worktrees, hand-in, and preview workflow.
- [Release](release.md): producing releases and the install/update boundary.
- [Dependency bundle](DEPENDENCY_BUNDLE_INSTALL.md): bundled runtime construction.
- [Release packaging](tarball.md): release coordination and verification.
- [First-use acceptance contract](USER_JOURNEY.md): what installation and Setup must establish.
- [Documentation ownership](documentation.md): usage, construction, and creator Lab material.

Use [verification guidance](verification.md): individual Agents run focused checks; the
Team lead/release maintainer owns `npm run verify` at the final combined gate, with earlier
runs by lead judgment. Playwright commands are explicit UI diagnostics. Follow the installed-user checks when changing an installed
box or its user stores, as described in [AGENTS.md](../../AGENTS.md).

Buildouts, plans, audits, and dated rollout evidence belong in the creators' Ronin Lab.
The pages here describe the current contribution and implementation contracts.
