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
answered 200. No tool may read or write it again.

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

The two readers are `src/cli-http.ts`, which every TypeScript command (`worktree-desk`,
`edges wipeboard`, `edges send`, `edges schedule`, promotion, recovery, bundle, auth) goes
through, and `ronin_bin/ronin-url` with its sourced sibling `ronin_bin/ronin-http.sh`, which
the zero-dependency shell tools (`session_create`, `session_end`, `session_check`,
`session_set`,
`team roster write`, `edges page`, `mika`) go through. `ronin-url` prints one line —
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

## A daimyo's token

Over `RONIN_URL`, a Bearer that isn't the CLI token is a daimyo's: sign-in asks the Services
part that registered `sockets.addBearerCheck`, on every call and with no cache, whose seat it
is. A seat answered makes the call that seat's: one step ([seats.ts](../../src/seats.ts),
`asSeat`) sets every self-named caller field to the seat's name. Those fields are `by`,
`caller`, `author`, `from` on the Team page, and `session` on `/api/cli`. The route also finds
`res.locals.seat`, the check's `{ seat, status }`: the daimyo connector answers 401 with its
sign-in challenge when that is missing. A null answer falls
through to the usual sign-in. A seat has no shell, so its own work record is read and its
objective written over `GET`/`PATCH /api/sessions/:name/record` (what `work-record read` and
`update_record --objective` do for an Agent); the record is seeded when the seat first comes in,
and its holds move with `item` like anyone's. The status line the user wrote is told to Agents, never enforced
by a tool.

## What this is not

The browser uses `https://<full-Tailscale-DNS>:4810`, provided by Tailscale Serve.
The installed operator's HTTP listener is a loopback backend on its configured `PORT`;
internal health probes may contact that listener directly. A healthy backend alone does
not prove the browser's HTTPS route. The local command socket answers a different
question, *where do I send a command*, and exists beside that backend listener.

Command discovery is fixed separately at Agent birth. The launch route resolves that Agent's
installations, behaviours and root arrangement, projects only the entitled commands as symlinks into that Agent's own
directory of the session-commands store, and prepends that directory — then Ronin's own install bin dir, `~/.local/bin`, where Install
and Update put a CLI, so that a CLI named inside a tile is the one Ronin installed and not an
older system copy — to the environment given directly to tmux and the Agent process. Ordinary non-interactive descendants inherit
it; they do not source `.bashrc`, `.profile`, or another owner shell file. That directory's
name is also how `work-record read`, `work-record update_record` and `edges page` learn which session they
act for when the calling shell is not inside tmux and carries neither `TMUX_PANE` nor
`$TMUX`; the name is accepted only when it is a live session. An Agent born with Ronin Base
off therefore does not receive Base commands such as `work-record update_record`, `session_create`, or
`ronin-url`. Changing a Team or Campaign default later does not mutate a running Agent's
birth environment; recreate that Agent to give it the newly enabled tools.

## For a test

A test that needs an operator boots one through `tests/helpers/ronin.ts`: its own
`RONIN_DATA_ROOT`, and its tools get `RONIN_SOCKET` pointing into it
(`tests/tools.test.ts`). Nothing in `tests/` reaches `~/.ronin`; the runner clears the
caller's `RONIN_SOCKET`. The tmux side of the same rule is `tests/helpers/testserver.ts`.
