# Why the tmux server gets its own systemd unit

## The failure

Sessions vanished "on the regular". Every tmux session on the box — agents mid-task,
shells, everything — gone at once, with no `kill-session` anywhere in the logs and no
crash. It looked like Ronin was killing tmux. It wasn't. systemd was.

## The mechanism

A tmux server is not a service; it's whatever process happened to start it. tmux forks
the server on first use and daemonises, but **daemonising does not leave a cgroup** —
the server stays in the cgroup of the process that asked for it.

Ronin asks for sessions: `tmux new-session` runs on every commons launcher spawn and on
`POST /api/sessions`. If no server is running at that moment, Ronin is the one that
starts it, and the server lands in `tmux-ronin.service`:

```
$ systemd-cgls --user-unit tmux-ronin.service
Unit tmux-ronin.service (/user.slice/…/app.slice/tmux-ronin.service):
├─1999849 npm start…
├─1999873 node … src/index.ts
├─2000201 tmux new-session -d -s shutdown     ← the tmux SERVER
└─2000466 tmux attach -t grid_shutdown_…      ← a viewer client (fine, it's ours)
```

systemd's default `KillMode=control-group` means *stopping a unit SIGTERMs every
process in its cgroup*. tmux handles SIGTERM by ending every session. So:

```
systemctl --user restart tmux-ronin   →   the whole box's tmux goes with it
```

Restarting Ronin is a routine thing — it's the documented way to pick up a `src/`
change. That's why it kept happening. And it was intermittent: when the server had
been started from an SSH login instead, it lived in that login's scope and survived,
so a restart looked harmless right up until the next time Ronin got there first.

Two clues that fingered it: the tmux server process was always *younger* than the
last Ronin start, and its `/proc/<pid>/cgroup` read `…/tmux-ronin.service`.

## The fix

`deploy/tmux-server.service` — a `oneshot` + `RemainAfterExit` unit whose only job is
to start the tmux server, so the server is born in **its own** cgroup and Ronin never
owns it. `deploy/tmux-server.conf` sources `~/.tmux.conf` and adds
`set -s exit-empty off`, which keeps the server alive with zero sessions — otherwise
the last session ending would exit the server and hand ownership of the next one back
to whoever asks first. The unit repeats that setting as an `ExecStartPost` (leading `-`,
so a missing server is not a failure), because the `-f` config only runs for a server
this unit actually started — enabling the unit on a box that already has a server would
otherwise leave `exit-empty` on.

`tmux-ronin.service` gains `Wants=`/`After=tmux-server.service`, plus an
`ExecStartPre` that restarts the server unit **only when no server is running at all**
(i.e. when there are no sessions to lose — the unit staying `active (exited)` after
its server died is the one case `Wants=` can't catch).

`src/host-guard.ts` does two things: warns at startup if the running server shares
Ronin's cgroup, and — the part that actually closes the hole — runs `ensureTmuxServer()`
before every `createSession()`. If no server is running, Ronin asks systemd to start
`tmux-server.service` instead of forking one itself. Ronin can no longer be the process
that starts a tmux server, which is the whole bug stated as a rule.

## Is this a hack? Does it matter that the host is a VM?

No, and no.

**It isn't a workaround for a Ronin quirk.** "A long-lived tmux server gets its own
systemd unit" is the ordinary way to run tmux under systemd — the same reason `screen`
and `tmux` user units exist in the wild. What was unusual was the *app* owning the
server by accident. `exit-empty off` is a documented tmux server option, not a trick,
and `Wants=`/`After=` is plain dependency ordering. The one defensive line is
`ExecStartPre` (`--no-block`, best-effort), and it is only a convenience — the
guarantee lives in `ensureTmuxServer()`, which is checked synchronously on the one code
path that could ever recreate the problem.

**Virtualisation is irrelevant.** This is process/cgroup ownership inside one Linux
user session; it behaves identically on bare metal, a VM, or a cloud instance. dohyo is a
rented VM (`dohyo-unified`, a Hetzner vServer; the original dohyo was an Azure VM) and the
hosting was never the reason. What *does* matter is the init system:

- **Linux + systemd** — affected; fixed by the units above.
- **macOS (launchd)** — not affected. launchd kills a job's process group, and tmux
  daemonises into its own session and process group, so it escapes on its own. The
  guard code no-ops off Linux.
- **No service manager (`npm start` in a shell)** — not affected: nothing kills a
  process group on your behalf. If the server ends up as a child of your shell it dies
  with your login, which is normal tmux behaviour and why `enable-linger` exists.

The one thing that survives the fix, by design: **stopping `tmux-server.service` ends
every session.** That unit owns them. That's ownership, not fragility.

## Rules that follow

- **Ronin must never be the process that starts the tmux server.** Anything that adds
  a new "create a session" path inherits this constraint.
- **Never `systemctl --user restart tmux-server`** while sessions exist — that unit
  owns them, and stopping it is the one legitimate way to kill them all.
- `systemctl --user restart tmux-ronin` is safe once the server unit is in place.
  Before it, it was the most destructive command on the box.

## The guard on the remaining foot-gun

The second rule above is the only one left that a human (or an agent) can break by
typing an ordinary-looking command, so it is enforced rather than merely written down:
**`bin/shim/systemctl` refuses to stop this unit while sessions exist.**

```
$ systemctl --user restart tmux-server
ronin-guard: refusing `systemctl restart tmux-server` — 2 tmux session(s) are live.
ronin-guard:
ronin-guard:   kojin
ronin-guard:   ronin
ronin-guard:
ronin-guard: This unit OWNS those sessions. Stopping it ends every one of them —
ronin-guard: agents mid-task included. It is not a way to 'refresh' the server.
…
$ echo $?
4
```

It sits beside `bin/shim/tmux` in `bin/shim`, and **it is in force only where that
directory precedes `/usr/bin` on `PATH`** — the export is in `docs/session-control-dials.md`
and belongs in the login shell's rc file. Where it is on `PATH` it covers typed commands and
any agent that shells out; where it is not, `/usr/bin/systemctl` is reached directly and
nothing refuses, so the rule is written down and nothing else. Check with
`which systemctl` before relying on it.

`stop`, `restart`, `try-restart`, `reload-or-restart`, `try-reload-or-restart` and `kill`
against `tmux-server[.service]` are checked; every other systemctl call — including
`restart tmux-ronin` and `status tmux-server` — is passed straight through.

**Why not systemd's own `RefuseManualStop=yes`?** Because it refuses *always*, and one
manual stop is legitimate: reviving a server that died. Both `tmux-ronin.service`'s
`ExecStartPre` and `ensureTmuxServer()` do that by restarting this unit. The session
count is exactly the line between the two cases — a restart with sessions live is the
accident, a restart with none is the repair — so the guard allows the repair path and
never has to be worked around for it.

Viewer sessions (`grid_*`) don't count toward the refusal: Ronin creates and kills them
per websocket, so losing them costs nothing.

When killing every session really is the intent (a wedged server, say — the cutover
below doesn't need it, since the restart above it already leaves zero sessions):

```bash
RONIN_KILL_TMUX=1 systemctl --user restart tmux-server
```

Speed bump, not physics — `/usr/bin/systemctl` is still there. The point is that
wiping the box becomes a deliberate, visible act instead of a reflex.

## Cutover on an already-broken host

The running server is already in the wrong cgroup; nothing can move it there. It has
to be replaced once, which ends the sessions it holds. Do it when the box is quiet:

```bash
systemctl --user daemon-reload
systemctl --user enable --now tmux-server     # no-op if a server is already running
systemctl --user restart tmux-ronin           # last restart that takes tmux with it
systemctl --user restart tmux-server          # server re-born in its own cgroup
```

Verify — the server must NOT appear under the app's unit:

```bash
systemd-cgls --user-unit tmux-ronin.service    # node + `tmux attach` clients only
systemd-cgls --user-unit tmux-server.service   # the tmux server lives here
```

## Test rigs: `$TMUX` beats `TMUX_TMPDIR`

How the second wipe happened (2026-08-07, 21:41:58): an agent tore down its private
test rig with `TMUX_TMPDIR=/tmp/wbt2 tmux kill-server` — but forgot `unset TMUX` in
that one command. Inside a pane `$TMUX` is always set, and tmux prefers the socket
named in `$TMUX` over `TMUX_TMPDIR`. The kill landed on the live server and ended
every session on the box.

Rules for any script or agent driving a scratch tmux server:

- **Always `env -u TMUX tmux …`** (or `unset TMUX` in the same shell) when using
  `TMUX_TMPDIR` — better, use an explicit socket: `tmux -L <name>` / `-S <path>`.
- The tmux shim refuses the ambiguous combination (`$TMUX` + `TMUX_TMPDIR`, no
  `-S`/`-L`) outright, and refuses `kill-server` on any socket that still has live
  sessions (`RONIN_KILL_TMUX=1` overrides, same as the systemctl guard).
- **Never `pkill -f` a pattern that matches the live app** — `pkill -f "tsx
  src/index.ts"` matches the production Ronin too. Record the test PID when you
  start the rig and kill exactly that.
