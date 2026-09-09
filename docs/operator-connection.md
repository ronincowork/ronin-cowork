# Live operator connection

The running operator is the sole authority for its command connection, and its door is a
Unix socket at a fixed path: `<data root>/run/ronin.sock`, which is `~/.ronin/run/ronin.sock`
unless `RONIN_DATA_ROOT` moves the data root, the same rule every Ronin store is found by
(`src/resources.ts`). The directory is mode 0700 and the socket 0600. That one file is four
things at once, and the kernel holds all four:

- **the address** — a tool connects to the path; nothing is looked up anywhere else;
- **the liveness check** — a connection either answers or is refused. There is no pid to
  compare and no record that can outlive the process that wrote it;
- **the credential** — whoever can open a 0600 socket is the user. A request arriving over
  it passes the auth gate with no bearer, no Basic and no cookie. HTTP callers keep theirs;
- **the "which Ronin"** — only one process can bind the path. A second Ronin started on the
  same data root finds a live socket, names what is answering there (`/api/version`), and
  exits 78 so the unit stops instead of retrying. A test copy runs under its own
  `RONIN_DATA_ROOT` and never meets the live door.

Only the **box instance** binds it — the entry point, under `NODE_ENV=production`, outside
the unit test runner — after its HTTP listener is up. Before binding it connects first: a
file nobody answers behind (left by a crash) is unlinked and replaced; a live one is the
sibling refusal above. On `SIGINT`/`SIGTERM` the process removes the socket it bound and
nothing else, so a dev run or a test stopping on the same box leaves the live operator
exactly as it found it. `npm run dev`, a hand-started `npx tsx src/index.ts` and the test
runner bind nothing at all.

This replaced the tmux server option `@ronin-operator` on 2026-09-05. That option was
memory of a tmux server that could be replaced under the operator, writable by any process
of the user, and erased on exit by every process that ever ran the entry point; five
outages in four days wore the one sentence *"Ronin may not be running"* while the page
answered 200. No tool may read or write it again; `tests/ronin-url.test.ts` pins that.

## How a tool finds the door

Resolution order, the same in both readers:

1. **`RONIN_URL`** — an explicit development/test target over HTTP, with `RONIN_CLI_TOKEN`
   as its bearer (the operator's CLI credential, random per process) and `RONIN_AUTH`
   (`user:pass`) for an HTTP Basic gate. Nothing in the house teaches this as the way to
   reach the live box; it is the override its refusals name.
2. **`RONIN_SOCKET`** — the socket of the operator that launched this session, handed to
   the newborn's environment at birth beside its command `PATH` (`src/routes/launch.ts`,
   `birthEnv`). An operator that bound no socket says nothing.
3. **the default path** — `<data root>/run/ronin.sock`, for a tool with no session at all:
   a cron job, a shell over SSH, the owner at a prompt.

The two readers are `src/cli-http.ts`, which every TypeScript command (`tejun-desk`,
`tejun-wipeboard`, `tejun-send`, `tejun-jikan`, promotion, recovery, bundle, auth) goes
through, and `ronin_bin/ronin-url` with its sourced sibling `ronin_bin/ronin-http.sh`, which
the zero-dependency shell tools (`tejun-fork`, `tejun-harakiri`, `tejun-session-set`,
`tejun-team-set`, `tejun-teampage`, `mika`) go through. `ronin-url` prints one line —
`RONIN_URL` when set, else the socket path — and `ronin_connect` turns that into the base
`url` and the `RONIN_CURL` transport options a request is built from; a caller never knows
which it got. Wrappers locate those siblings from their own resolved file path, including
through the session-command symlinks, so `PATH` is only command discovery, never an
internal dependency.

Two refusals, exit 4, one sentence each, so "never started" and "stopped" cannot wear the
same words again:

```
REFUSED: no Ronin has started on this box (no socket at /home/you/.ronin/run/ronin.sock).
Start Ronin, or set RONIN_URL for a development/test target.

REFUSED: Ronin is not running (socket at /home/you/.ronin/run/ronin.sock, nobody listening).
journalctl --user -u ronin.service -n 50 says why; start it with: systemctl --user start ronin
```

## What this is not

The browser's door is unchanged: `http://<BIND>:<PORT>` from `.env`, the banner, `ronin-gate`,
`ronin-doctor` and the promotion health check all keep asking *is the page up* at that
address. The socket answers a different question, *where do I send a command*, and is
added beside the HTTP listener, never instead of it.

Command discovery is fixed separately at Agent birth. The launch route resolves that Agent's
enabled Routines, projects only their entitled commands as symlinks into that Agent's own
directory of the session-commands store, and prepends that directory — then Ronin's own install bin dir, `~/.local/bin`, where Install
and Update put a CLI, so that a CLI named inside a tile is the one Ronin installed and not an
older system copy — to the environment given directly to tmux and the Agent process. Ordinary non-interactive descendants inherit
it; they do not source `.bashrc`, `.profile`, or another owner shell file. That directory's
name is also how `read_tegami`, `write_tegami` and `tejun-teampage` learn which session they
act for when the calling shell is not inside tmux and carries neither `TMUX_PANE` nor
`$TMUX`; the name is accepted only when it is a live session. An Agent born with Ronin Base
off therefore does not receive Base commands such as `write_tegami`, `tejun-fork`, or
`ronin-url`. Changing a Team or Campaign default later does not mutate a running Agent's
birth environment; recreate that Agent to give it the newly enabled tools.

## For a test

A test that needs an operator to answer gives it its own `RONIN_DATA_ROOT` and, when it
runs the entry point, `NODE_ENV=production` without `RONIN_TEST_RUNNER`; its tools then get
that root, or `RONIN_SOCKET` pointing into it. A test that only needs a door to knock on
listens on `<scratch>/run/ronin.sock` itself (`tests/cli-http.test.ts`,
`tests/ronin-url.test.ts`). Nothing in `tests/` reaches `~/.ronin`;
`tests/test-runner-isolation.test.ts` pins that the runner and a scratch entry point bind
no socket. The tmux side of the same rule is `tests/helpers/testserver.ts`.
