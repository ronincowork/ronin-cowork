# ronin-cowork — Agent route

Choose the route that matches the user's request; do not make an installer read developer
contracts or make a contributor follow the installation journey.

- Assessing whether Ronin fits this machine: read
  [`docs/getting-started/how-ronin-protects-you.md`](docs/getting-started/how-ronin-protects-you.md).
- Installing or helping with first use: begin with [`docs/getting-started/install.md`](docs/getting-started/install.md) and
  stay through its handoff to Ronin Setup, provider sign-in, and one working Agent.
- Working inside an existing coworkspace: use the question-first
  [`docs/README.md`](docs/README.md).
- Developing this repository: start with the [contributor map](docs/contributor-map.md)
  for code ownership and [KOTOBA](KOTOBA.md) for vocabulary. Individual Agents use focused
  checks; `npm run verify` is normally the Team lead/release maintainer's final combined
  gate, not a per-Agent hand-in requirement. A lead may request an earlier integration
  run. Follow [verification guidance](docs/development/verification.md). Playwright suites
  are explicit diagnostic commands.
- Talking to tmux from the server: every call goes through the control-mode client
  (`src/tmux-client.ts`); programs that are not tmux start through the spawn broker
  (`src/spawn-broker.ts`). [`docs/architecture/tmux-connection.md`](docs/architecture/tmux-connection.md) says why.
- Need a tmux server that is not the live one? `ronin-testserver open <name>`, use the
  `tmux` path it prints for every command, `ronin-testserver close <name>` when done —
  nothing else. A server you did
  not get that way is one you may not touch.

Desk work follows the desk contract handed to you at birth
(`ronin_stock/behaviours/working-at-a-desk.md`): **commit** preserves,
**hand-in** publishes to the team line, and `git push` belongs only to release work.
After changing an installed box or its user stores, run `npm run byoin` to check that
current user customization surfaces.
