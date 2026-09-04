# ronin-cowork — Agent route

Choose the route that matches the user's request; do not make an installer read developer
contracts or make a contributor follow the installation journey.

- Assessing whether Ronin fits this machine: read
  [`docs/how-ronin-protects-you.md`](docs/how-ronin-protects-you.md).
- Installing or helping with first use: begin with [`docs/install.md`](docs/install.md) and
  stay through its handoff to `cowork_setup`, provider sign-in, and one working Agent.
- Working inside an existing coworkspace: use the question-first
  [`docs/README.md`](docs/README.md).
- Developing this repository: run `npm run verify` for the TypeScript and behavior-test
  verdict. Playwright suites are explicit diagnostic commands.

Desk work follows the desk contract handed to you at birth
(`ronin_session_boot/routine/ronin_worktrees/WORKTREES.md`): **commit** preserves,
**hand-in** publishes to the team line, and `git push` belongs only to release work.
After changing an installed box or its user stores, run `npm run byoin` to check that
current user customization surfaces.
