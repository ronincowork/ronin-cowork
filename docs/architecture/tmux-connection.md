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
- `tmux.on(kind, handler)` delivers notifications. `src/ws/events.ts` pushes the session
  list and the home rows to browsers on `%sessions-changed`, renames and window changes,
  with the 2 s clock kept as a heartbeat; each tick takes one session listing for both, and
  each is sent only when a field the UI paints moved (`sessionsSignature` leaves out
  `activity`), so a notification that changed nothing painted sends nothing. A row's
  `activity` comes from the listing. [The data path](data-path.md) states the rule and the
  lifecycle; everything else on `/events`:

  | Message | Sent | On connect |
  |---|---|---|
  | `{t:'teams', rosters}` | after each roster write, when it moved | held, sent |
  | `{t:'messages', list}` | when a file in the message queue folder changes and the queue moved | held, sent |
  | `{t:'memory', reading}` | the machine service's reading of memory, swap, load, cores and scope, taken once a minute and sent when it moved; `{off:true}` once when watching is off | held, sent |
  | `{t:'wipeboard', board, …}` | when a file under that board's folder changes and the board (last 100 posts, `more`) moved | answers `{t:'want', resource:'wipeboard', board}` |
  | `{t:'jikan', team, jobs}` | when that Team's jobs file changes and its jobs moved, and as `team:'*'` for every Team | answers `{t:'want', resource:'jikan', team}` |
  | `{t:'collection', filter, teams, boards, roots}` | `collectionReading(filter)` whole, to each connection holding that filter, when an item, a Team roster, the workspace folder catalog or the session list changes and the reading moved | answers `{t:'want', resource:'collection', campaign?, team?, board?, root?[]}`; the filter is kept until the connection closes |
  | `{t:'work-items', filter, items, …}` | the answer of `GET /api/work-items` for the filter (a Team's reading for `team`, one board's root and items for `board`, every item otherwise), on the same inputs, when it moved | answers `{t:'want', resource:'work-items', team?, board?}`; kept as above |
  | `{t:'github-setup', github}` | on the tick while a GitHub or git setup session is attached, when `GET /api/setup/github`'s answer moved, and once after the last one closes | — |
  | `{t:'services-setup', services}` | `{ registration, installed, activation }` after each write to registration, Services, Campaigns or machine settings, when the install watcher ends, and when Ronin HQ confirms the emailed link (asked every 15 s while a request waits and a browser is connected) | — |
  | `{t:'gbrain', snapshot}` | `GET /api/gbrain`'s answer while an install or uninstall runs, and once when it ends | — |
  | `{t:'mika', ...ready}` | after `POST /api/mika/ready` answers `starting`, while a browser is connected: her pane is looked at every 350 ms and the answer pushed when it changes, until it is not `starting` | — |
  | `{t:'shutdown', ...operation}` | each phase of a `POST /api/sessions/:name/shutdown` operation, and once when it is complete or failed | — |

  The store folders for boards, cron jobs and the message queue are the whole truth, and
  every writer (a route, a CLI child, the server) changes a file in them: the server
  watches each folder (`watchStore`) and pushes the resource the file names. The work item,
  Team roster and workspace folder catalog stores are watched the same way for the held
  readings; a filtered reading reaches only the connections that want that filter.

**The rule:** no `execFile('tmux', …)` or `spawn('tmux', …)` in `src/` outside the client
and the pty attach paths (`src/ws/pty.ts`, `src/viewer.ts`). `tests/tmux.test.ts` refuses
it. A tile's Locked view is still a real `tmux attach` through a pty; that is Faucet A,
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

## The roster, computed once and on change

The home rows are built by `homeRows` in `src/routes/launch.ts` from the session listing a
tick took: while a browser is connected, `src/ws/events.ts` broadcasts `{t:'home', rows}`
only when the painted fields moved (`homeSignature` leaves out a row's `activity` and stance
`at`); a fresh connection receives the rows once. A session's screen is captured
and classified only when its `#{window_activity}` stamp moved since the last
classification (`createActivityCache` in `src/status.ts`); an unchanged session keeps its
last status, ctx and model.

## Parts: what is on disk, and what runs

The Services parts live under `src/services/` (a placed copy; see the services repo's
`bin/dev-sync`). Whether a part **runs** is decided at start by `src/parts.ts`:

- An installation claims the parts it runs — `- **parts:** …` in
  `ronin_catalogs/installations/<name>.md`; Ronin Services claims `counting, kanban, koe,
  koshi, koshi_weights, machine, michi, rireki`, and the `gbrain` installation claims
  `gbrain`. A claimed part loads only while that installation is on. Off means the part is
  never imported: no timers, no routes, no recorder, and `/api/version` reports
  `stream: false`, so every tile is Locked.
- A claimed part must also have its **capability** switched on. `SERVICE_CAPABILITY_PARTS`
  in `src/parts.ts` is the sole capability-to-part expansion, and
  `CAPABILITY_ON_BY_DEFAULT` beside it is the only place that says what a missing choice
  means: Task manager, Usage stats and Machine status run until they are switched off, the
  rest are off until switched on. A Campaign records what the owner switched and authors
  no defaults of its own. A part belonging to no capability is governed by its
  installation switch alone.
- A part can declare itself parked with a `PARKED.md` in its folder whose first line is
  the reason. It is parked regardless of any switch. The recorder (`rireki`) is parked
  this way for the whole Services beta.
- **Installed is the gate.** Ronin Services cannot be installed without a registration, so
  no part re-checks entitlement once it is running, and `/api/installed` carries no
  `activated` fact for a surface to weigh. On means it works.
- The switch is read once at start. `/api/installed` reports `parts` (on disk), `loaded`,
  `parked` (with `installation` or `reason`) and `restart_needed`; the Installations
  card's Services row says when the switch and the running copy disagree.

## Measuring it

The probes used that day are in `scripts/`: `profile.mjs` (a CPU profile of the live
server through the inspector), `eval.mjs` (in-process spawn cost), `reqrate.mjs` (requests
per endpoint), `refresh-probe.mjs` and `team-probe.mjs` (repeated browser reloads with
surface states, long tasks and errors). Open the inspector on the live server with
`kill -USR1 <pid>`; the port is localhost-only and closes with the process.

## Global-dev Services placement

`npm start` and `npm run dev` prepare the global development runtime before starting
Ronin. Their `prestart`/`predev` command calls `scripts/prepare-dev-services.ts`, whose
resolver is `src/dev-services.ts`. It reads the registered `ronin_cowork` and
`ronin_services` Workspace Folders and each repository's declared working branch.
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
