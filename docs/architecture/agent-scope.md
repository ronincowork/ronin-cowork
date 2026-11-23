# An Agent's temp and processes

Everything an Agent writes to temp and every process it starts are its own. They live on disk
under its session and in its own process group, and they go when it ends. This holds for every
Agent and every provider, and for plain shells too, because each one is born through
`createSession` (`src/tmux.ts`) and `processLaunch` (`src/launch-binding.ts`). The code is in
`src/agent-scope.ts` (w624).

For contributors. For what an operator sees, read [tmux server](../operating/tmux-server.md#each-agents-processes-and-temp).

## Why

On a 16 GB box, `/tmp` is tmpfs, so it sits in RAM. It held 4.9 GB, much of it rigs left by
Agents that had already ended. Processes started by ended Agents (test servers, copyparty, a
52-day-old test tmux server) ran on with ppid 1, and swap filled. That is how one Agent's test
took the box down (15 Nov 2026).

## Temp

At launch the Agent's environment gets `TMPDIR` and `CLAUDE_CODE_TMPDIR`, both pointing at
`<session store>/<key>/tmp`. Node, Rust (Codex) and most tools read `TMPDIR`. Claude Code puts
its scratchpad under `CLAUDE_CODE_TMPDIR`/`claude-<uid>/`. A launch's own `env` still wins.

The folder goes when the Agent goes ([the session folder is the Agent](session-archive.md#the-session-folder-is-the-agent)):
Delete, Hard Delete, or [archive expiry](session-archive.md#expiry). An archive keeps it, along
with the rest of the folder.

A unix socket path is at most 108 bytes, and tools append to the temp root (`tmux-<uid>/default`,
`claude-<uid>/…`). So a root longer than `TEMP_ROOT_MAX` (72) is replaced by a short one,
`<data root>/tmp/<sha256(key)[:16]>`, and `<session folder>/tmp` links to it. The start sweep
removes any short root whose session folder is gone.

`TMUX_TMPDIR` is never set: the Agent's own `tmux` calls must still reach the live server.

## One process group per Agent

tmux starts every pane in its own systemd user scope, `tmux-spawn-<uuid>.scope`. The scope's
Description reads `tmux child pane <pane pid> launched by process <server pid>`. A child stays
in its scope however it detaches (`setsid`, `nohup`, double fork, ppid 1). So the scope is the
Agent's process group, and Ronin acts on it by cgroup, never by a name pattern.

- **At launch** `ownScope` reads the pane's cgroup. It records the scope as `@ronin-scope` on
  the session and as `scope` in the session folder, sets the memory ceiling, and adds
  `pane-died` and `pane-exited` hooks that run `systemctl --user stop --no-block -- <scope>`.
  So a pane whose CLI exits on its own takes its children with it.
- **At every kill**, `killSession` is the single path for `session_end`, archive, Delete, Hard
  Delete and restore rollback. It reads the session's scopes, kills the session, then stops
  those scopes. The stop also takes the panes of any tmux server running inside them: a rig an
  Agent started is the Agent's (`withNested`). Viewers (`grid_*`) are skipped, because they
  share the base session's pane.
- **When a pane dies** (its CLI exits; `remain-on-exit` keeps the pane to read), the hooks
  stop its scope. The `pane-dead` tmux subscription (`PANE_DEAD_SUBSCRIPTION`,
  `src/tmux-client.ts`) pushes the change to Ronin, and `stopLeftoversOnPaneDeath` stops
  everything else that session left, as a kill would, without ending the session.
- **Never stopped:** the scope of a live pane (which protects grouped sessions), and the scope
  holding this Ronin process. `tmux-server.service` and `ronin.service` are services, not pane
  scopes, so they are never candidates.

## Helpers that leave the pane's scope

A CLI can start a helper that ends up in a scope of its own, outside the pane's. Codex's
app-server daemon runs as `<session folder>/cli-home/packages/app-server-daemon/releases/<v>/bin/codex`
in a `tmux-spawn` scope with no pane, so stopping the pane's scope missed it (KAN-548). Such a
helper is found by **where it runs from**: any process whose `/proc/<pid>/exe` or `cwd` is
inside the session folder, or its short temp root, belongs to that Agent (`folderScopes`,
`sessionFolders`). Its scope is stopped with the others at every kill, on pane death, and by
the start sweep. That is a path match, never a name match. Only pane scopes are taken, and
never a live pane's, so an Agent that `cd`s into another session's folder is safe.

Helpers land there because Ronin points each CLI's home into the session folder where the CLI
allows it (`launch_isolation`, `docs/agents/<cli>.md`; `cli-home/` is built in
`src/launch-binding.ts`). Every CLI's temp already goes there through `TMPDIR`.

| CLI | Home set to `cli-home/` |
|---|---|
| Codex | `CODEX_HOME` (`sessions` private, the rest linked from `~/.codex`; `packages/` is its own) |
| Copilot | `COPILOT_HOME` (`session-state` private) |
| Hermes | `HERMES_HOME` (named entries shared) |
| Claude, Kimi, Grok, Agy, OpenCode | not set: they run from their shared home |

A CLI that isn't moved can still run a helper from its shared home, outside every session
folder. That helper stops only if it stays in the pane's scope.

## Memory ceiling

`memoryCeiling()` sets these limits from the box's RAM (`os.totalmem()`):

| Property | Value | 16 GB box | 4 GB box |
|---|---|---|---|
| `MemoryMax` | a fifth of RAM, never under 1 GiB | 3.2G | 1G |
| `MemoryHigh` | 85% of MemoryMax: reclaim and throttle start here | 2.7G | 0.85G |
| `MemorySwapMax` | a quarter of MemoryMax, so one Agent cannot fill swap | 0.8G | 0.25G |

They are set with `systemctl --user set-property --runtime`, so they last for the scope's
life. A runaway is OOM-killed inside its own scope, not anywhere else on the box. These
numbers come from measurements on the 16 GB box: an Agent's scope peaked at 2–3 GB counting
page cache, which `MemoryHigh` reclaims first. Its own memory stayed well under 1 GB.

## The start sweep

`sweepLeftovers` runs once at service start (`src/index.ts`) and logs `[scope] …` lines saying
what it stopped and removed. It stops:

1. Scopes whose Description names **this Ronin's tmux server** and whose pane is not live.
2. For each session folder without a live pane (`liveSessionKeys`): the scope recorded there
   (`scope`), which covers scopes left from before a tmux server restart, and the scope of every
   process running from that folder.
3. The panes of tmux servers running inside any of those (`withNested`).

Otherwise it never stops a scope from a tmux server Ronin did not start. That server belongs to
the user, whether or not it is still running. The sweep runs only when Ronin is a systemd service.
A Ronin started from an Agent's pane (a rig, a test) never sweeps, so a rig cannot reach the
box's Agents. Without systemd, or off Linux, every step does nothing.

## Proof

The proof scripts used for w624 run on an isolated tmux socket with temp `RONIN_*_ROOT`s. A
fake Agent writes 8 MB to temp, starts a `setsid` child, and starts a rig tmux server whose
pane starts one more.

- **Old code:** temp lands in `/tmp` and stays. Both children outlive the Agent's end.
- **New code:** temp is in the session folder, the scope carries the ceiling, both children
  are gone at the end, and temp goes with the folder when the Agent is deleted.
- **The start sweep** stops the old code's two leftover scopes.
- **A pane that exits on its own** takes its child with it.

For KAN-548 the fake CLI copies a binary into `cli-home/packages/bin/` and starts it through a
rig tmux server that then exits, so the helper sits in a `tmux-spawn` scope of its own with no
pane. That is the Codex daemon's shape. Old code (w624): the helper outlives both the Agent's
end and its pane dying. New code: it is gone in both cases, and the start sweep stops the
helpers the old code left.
