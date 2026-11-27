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
  While it is down, `run` falls back to `execFile('tmux', …)` to keep commands available, and
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
- `tmux.on(kind, handler)` delivers notifications; there is no clock. `src/ws/events.ts`
  takes one session listing on `%sessions-changed`, renames, window changes and the listing
  subscription, and sends the session list and every Agent's card only when a field the UI
  paints moved (`sessionsSignature` leaves out `activity`). The activity subscription (a pane
  had output) wakes the transcript part's terminal read through `onPaneActivity` and marks
  that Agent's card `pane`. [The data path](data-path.md) states the rule and the
  lifecycle; everything else on `/events`:

  | Message | Sent | On connect |
  |---|---|---|
  | `{t:'teams', rosters}` | after each roster write, when it moved | held, sent |
  | `{t:'messages', list}` | when a file in the message queue folder changes and the queue moved | held, sent |
  | `{t:'memory', reading}` | the machine service's reading of memory, swap, load, cores and scope, taken once a minute and sent when it moved; `{off:true}` once when watching is off | held, sent |
  | `{t:'wipeboard', board, …}` | when a file under that board's folder changes and the board (last 100 posts, `more`) moved | answers `{t:'want', resource:'wipeboard', board}` |
  | `{t:'jikan', team, jobs}` | when that Team's jobs file changes and its jobs moved, and as `team:'*'` for every Team | answers `{t:'want', resource:'jikan', team}` |
  | `{t:'mika', ...ready}` | after `POST /api/mika/ready` answers `starting`, while a browser is connected: her pane is looked at every 350 ms and the answer pushed when it changes, until it is not `starting` | — |
  | `{t:'shutdown', ...operation}` | each phase of a `POST /api/sessions/:name/shutdown` operation, and once when it is complete or failed | — |

  The store folders for boards, cron jobs and the message queue are the whole truth, and
  every writer (a route, a CLI child, the server) changes a file in them: the server
  watches each folder (`watchStore`) and pushes the resource the file names. The work item,
  Team roster and workspace folder catalog stores are watched the same way for the held
  readings; a filtered reading reaches only the connections that want that filter.

**The rule:** no `execFile('tmux', …)` or `spawn('tmux', …)` in `src/` outside the client
and the pty attach paths (`src/ws/pty.ts`, `src/viewer.ts`). A tile's Locked view is still a real `tmux attach` through a pty; that is Faucet A,
a separate transport. Whether to replace it is an open Track A comparison, not a
prerequisite for the proposed Unlocked recording path.

## The spawn broker: `src/spawn-broker.ts`

Programs that are not tmux — git, `systemd-detect-virt`, the updater — still have to be
started. They are started by a small child process forked at boot, before the server
grows, and spoken to over IPC: `execFile(file, args, options)` from the broker module
returns stdout and stderr, carries exit code, signal and timeout through, rejects what was
in flight if the broker dies, and remakes the broker on the next call. Measured: 92 ms per
`/bin/true` from the server directly, 8 ms through the broker. The one call that ends the
server, the restart in `src/host-guard.ts`, stays direct on purpose.

## An Agent's card

[The Agent card](agent-card.md) says what the card is, its parts' owners and how it travels.
What tmux gives it: a pane's output marks the card `pane`, and a question drawn late in a
second still lands, since the activity stamp flips at the second's end (below) and that report
marks the pane again (KAN-616).

Which panes had output comes from one tmux subscription on the control client,
`ACTIVITY_SUBSCRIPTION` in `src/tmux-client.ts`: `name:stamp.over` per session,
comma-separated, where `over` is `0` while the stamp's second runs and `1` once it is past
(`#{T:@ronin-now}`, an option holding `%s`, is tmux's current second). tmux checks a
subscription each second, so the flip is one more report after a burst's last draw, and that
push reads the pane afresh. The comma is written `#,` because a bare comma inside `#{S:…}`
is tmux's own separator and is dropped. `activityMoved` in `src/ws/events.ts` names the sessions whose stamp moved; each
wakes the terminal read (`onPaneActivity`) and marks its card `pane`. `PANE_DEAD_SUBSCRIPTION`
says a pane died: its leftovers are stopped and `src/pane-death.ts` writes Stopped into the
Agent's hook record and tells its leads once (KAN-660). `LISTING_SUBSCRIPTION`
reports the Ronin options the listing carries (title, Teams, lead, Campaign), whoever sets
them, and the tick lists again.

## Parts: what is on disk, and what runs

The Services parts live under `src/services/` (a placed copy; see the services repo's
`bin/dev-sync`). Whether a part **runs** is decided at start by `src/parts.ts`: every part
present runs (owner, 2026-11-26, KAN-914: no Services switch, no per-feature switch;
[installations.md](installations.md)).

- A part can declare itself parked with a `PARKED.md` in its folder whose first line is
  the reason. The recorder (`rireki`) is parked this way for the whole Services beta.
- `/api/installed` reports `parts` (on disk), `loaded` and `parked` (with its `reason`, or a
  load failure).

## Measuring it

The probes used that day are in `scripts/`: `profile.mjs` (a CPU profile of the live
server through the inspector), `eval.mjs` (in-process spawn cost), `reqrate.mjs` (requests
per endpoint), `refresh-probe.mjs` and `team-probe.mjs` (repeated browser reloads with
surface states, long tasks and errors). Open the inspector on the live server with
`kill -USR1 <pid>`; the port is localhost-only and closes with the process.

## Global-dev Services placement

`npm start` and `npm run dev` prepare the global development runtime before starting
Ronin. Their `prestart`/`predev` command calls `scripts/prepare-dev-services.ts`, whose
resolver is `src/dev-services.ts`. It reads the `ronin_cowork` and `ronin_services`
rows of this box's Workspaces and each repository's working branch on its row.
Only the mounted Cowork global working checkout receives automatic placement; a
private worktree, candidate, preview, or `VERSION`-stamped release does not.

For global dev, preparation calls the Services working checkout's existing
`bin/dev-sync <cowork-working-checkout>`. The source must be at its working tip with
no uncommitted runtime changes. A missing mounted Services working branch or failed
placement stops startup with the reason, before the Services loader runs. The log
names the source checkout, revision, and target. With no registered Services source,
preparation skips placement; it does not install or remove a package.

Promotion still advances the repository working lines and requests its ordinary
restart. The operator units already use `npm start`, so that restart now prepares
Services too. A later manual start or restart uses the same preparation. `npm run dev`
prepares once before starting its watcher; restart that command after promoting
Services to refresh its placed runtime. Direct `tsx src/index.ts` bypasses the npm
startup pipeline and is not the global-dev start command.

This is development synchronization, separate from `bin/ronin-update --services`:
installed releases keep their artifact store, placement, and carry-forward update
flow. Neither operation changes which capabilities the Campaign has enabled.
