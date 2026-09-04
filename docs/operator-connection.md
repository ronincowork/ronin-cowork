# Live operator connection

The running operator is the sole authority for its command connection. After its HTTP
listener is ready, it publishes one versioned JSON value in the tmux server option
`@ronin-operator`: the connectable URL, the matching short-lived CLI credential, and an
identity for that operator process. Publishing one value prevents clients from observing
a URL from one process with a credential from another.

Agent commands resolve that descriptor through the shared client. The small `ronin-url`
command is the shell-facing view of the same record; it is not another source of truth.
Wrappers locate shipped helpers from their own resolved file path, including through the
session-command symlinks, so `PATH` is only command discovery—not an internal dependency.

Command discovery is fixed separately at Agent birth. The launch route resolves that
Agent's enabled Routines, projects only their entitled commands as symlinks into that
Agent's own directory of the session-commands store, and prepends that directory to the
environment given directly to tmux and the Agent process. Ordinary non-interactive
descendants inherit it; they do not source `.bashrc`, `.profile`, or another owner shell
file. An Agent born with Ronin Base off therefore does not receive Base commands such as
`write_tegami`, `tejun-fork`, or `ronin-url`. Changing a Team or Campaign default later
does not mutate a running Agent's birth environment; recreate that Agent to give it the
newly enabled tools.

`RONIN_URL` is an explicit development/test override. `RONIN_CLI_TOKEN` supplies the
matching override credential; otherwise the descriptor's credential is used. With no
override and no valid versioned descriptor, commands refuse clearly instead of guessing a
loopback address. Browser Basic authentication remains separate from this local command
credential.

The operator replaces the complete descriptor when it starts. Consumers must not read or
publish retired split options such as `@ronin-url` or `@ronin-cli-token`, and must not copy
the connection into Campaign, Team, or session configuration.
