# ronin-cowork — Agent route

Choose the route that matches the user's request; do not make an installer read developer
contracts or make a contributor follow the installation journey.

- Assessing whether Ronin fits this machine: read
  [`docs/how-ronin-protects-you.md`](docs/how-ronin-protects-you.md).
- Installing or helping with first use: begin with [`docs/install.md`](docs/install.md) and
  stay through its handoff to `cowork_setup`, provider sign-in, and one working Agent.
- Working inside an existing coworkspace: use the question-first
  [`docs/README.md`](docs/README.md).
- Developing this repository: testing is governed by
  [`docs/test-protocols.md`](docs/test-protocols.md).

Testing: `docs/test-protocols.md`. Ordinary dev work does **not** run BYOIN — not at a
commit, not at a hand-in. Desk work follows the desk contract handed to you at birth
(`ronin_session_boot/assignment/DESK_CONTRACT.md`): **commit** preserves, **hand-in**
publishes to your team line, the lead's **team promotion** runs the first full repository
BYOIN at `team → dev`, the second runs at `dev → master`, and `git push` is the release
path's word alone. Installed-box
BYOIN after maintenance or a store change is a separate matter on that page. That
provider-neutral page is the whole contract; this file is only the pointer your CLI
auto-reads.
