# The tmux connection, the spawn broker, and parked parts

How this server talks to the tmux server, why it no longer starts a process per question,
and how the Services parts are switched on and off. Written 2026-09-04, the day it landed.

## The problem it solved

Every question to tmux — list sessions, capture a pane, read an option — used to start a
`tmux` process. Starting a process from this server cost its only JavaScript thread about
45 ms, because Linux copies the parent's page tables on fork and the server carries
hundreds of megabytes of dirty memory (a small process pays 2 ms for the same thing). At
a dozen questions a second the thread was busy half of every second, and every request,
every dialog and every workbench waited behind it. Measured that morning: 288 child
processes in ten seconds, main thread ~52% busy, the home roster in 3 s, machine settings
in 7–10 s.

The same day, on the same box with more browsers open: 0 child processes in ten seconds,
main thread 13%, the home roster in 2.6 ms, machine settings in 142 ms.

## One connection: `src/tmux-client.ts`

tmux has a program interface, *control mode* (`tmux -C`): one client sends commands on a
pipe and reads replies framed by `%begin … %end` / `%error`, plus notifications. The client
in `src/tmux-client.ts` is the server's single door to tmux:

- `tmux.run(args)` takes **argv**, never a string; the client owns tmux quoting in one
  place. It resolves with stdout, rejects with the `%error` text. One command is in flight
  at a time; replies are matched by their frame number.
- A timed-out command tears the connection down and the client reconnects with backoff.
  While it is down, `run` falls back to `execFile('tmux', …)` so nothing stops, and
  `state()` says `fallback`.
- The connection is to the tmux server the environment names **at the time of the call**
  (`TMUX`, `TMUX_TMPDIR`), as `execFile` was; a change reopens the connection.
- It holds nothing alive while idle: the control child and its pipes are unreferenced
  between commands, so a process that ran one command exits on its own.
- Only a long-lived process should attach; the server opts in at boot. A CLI tool or a
  test that imports the client runs its one command through `execFile`.
- The control client attaches to an empty holder session, `grid_ctl`, so the pipe carries
  replies and server-wide notifications only. The roster and the recorder's sweep skip
  `grid_*` names.
- `tmux.on(kind, handler)` delivers notifications. `src/ws/events.ts` pushes the session
  list to browsers on `%sessions-changed`, renames and window changes, with the 2 s clock
  kept as a heartbeat; one `refresh-client -B` subscription carries every session's
  `#{window_activity}` for the roster.

**The rule:** no `execFile('tmux', …)` or `spawn('tmux', …)` in `src/` outside the client
and the pty attach paths (`src/ws/pty.ts`, `src/viewer.ts`). `tests/tmux.test.ts` refuses
it. A tile's Locked view is still a real `tmux attach` through a pty; that is Faucet A and
is not on the connection yet.

## The spawn broker: `src/spawn-broker.ts`

Programs that are not tmux — git, `systemd-detect-virt`, the updater — still have to be
started. They are started by a small child process forked at boot, before the server
grows, and spoken to over IPC: `execFile(file, args, options)` from the broker module
returns stdout and stderr, carries exit code, signal and timeout through, rejects what was
in flight if the broker dies, and remakes the broker on the next call. Measured: 92 ms per
`/bin/true` from the server directly, 8 ms through the broker. The one call that ends the
server, the restart in `src/host-guard.ts`, stays direct on purpose.

## The roster, computed once and on change

`/api/home` is computed once per two-second window and shared by every browser that asks
in it (`createWindowedLoader` in `src/routes/launch.ts`). A session's screen is captured
and classified only when its `#{window_activity}` stamp moved since the last
classification (`createActivityCache` in `src/status.ts`); an unchanged session keeps its
last status, ctx and model.

## Parts: what is on disk, and what runs

The Services parts live under `src/services/` (a placed copy; see the services repo's
`bin/dev-sync`). Whether a part **runs** is decided at start by `src/parts.ts`:

- A Routine claims the parts it runs — `- **parts:** …` in
  `ronin_catalogs/routines/<name>.md`; Ronin Services claims `counting, koe, koshi,
  koshi_weights, michi, rireki`. A claimed part loads only while that Routine is on for
  the Campaign. Off means the part is never imported: no timers, no routes, no recorder,
  and `/api/version` reports `stream: false`, so every tile is Locked.
- A part can declare itself parked with a `PARKED.md` in its folder whose first line is
  the reason. It is parked regardless of any switch. The recorder (`rireki`) is parked
  this way for the whole Services beta.
- A part no Routine claims (`machine`, `gbrain`) always loads.
- The switch is read once at start. `/api/installed` reports `parts` (on disk), `loaded`,
  `parked` (with `routine` or `reason`) and `restart_needed`; the Routines and Installs
  page's Services row says when the switch and the running copy disagree.

## Measuring it

The probes used that day are in `scripts/`: `profile.mjs` (a CPU profile of the live
server through the inspector), `eval.mjs` (in-process spawn cost), `reqrate.mjs` (requests
per endpoint), `refresh-probe.mjs` and `team-probe.mjs` (repeated browser reloads with
surface states, long tasks and errors). Open the inspector on the live server with
`kill -USR1 <pid>`; the port is localhost-only and closes with the process.

## What is not done

The tiles still refetch control, ctx and work record on every pushed session list; the
`/api/session-max` and `/api/messages` endpoints still work per call; the roster's
git-derived desk fields are not yet cached by record time; the services repo's own tmux
calls are not on the connection (its parts are parked); and the tiles themselves do not
ride the connection. The build-out and its measurements live in the lab.
