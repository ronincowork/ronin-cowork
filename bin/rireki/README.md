# RIREKI recorder — a standalone tmux applet

Cache every byte every tmux pane emits, to a plain file, forever. No Node, no daemon,
no browser, nothing watching required.

```bash
./rireki-install     # hook it into tmux + arm every pane already running
./rireki-sweep       # idempotent; re-arms anything that lost its recorder
./rireki-uninstall   # remove hooks, stop recorders (tapes stay on disk)
```

Tapes land in `$RIREKI_DIR` (default: `~/.ronin_session` —
set `RIREKI_DIR` for a standalone install):

```
$RIREKI_DIR/<key>/tape/<pane>/000001.tape   raw output bytes, exactly as emitted
```

`<key>` is the session's identity, not its name: `@ronin-key` if something stamped one,
otherwise `<session_name>-<session_created>`. tmux names can be renamed and reused, so
keying by name orphans a tape on rename and makes a recreated session inherit a dead
one's. The applet derives the key itself, which is why it needs nothing else installed.

## How it works

tmux gives each pane exactly one `pipe-pane` — a copy of the pane's raw output stream,
taken below the renderer, delivered with no client attached. The applet claims it with
`cat >>`: ~1MB RSS, nothing written while the pane is idle, and it keeps running when
whatever installed it is long gone.

Three hooks (`session-created`, `after-new-window`, `after-split-window`) run the sweep,
which arms any pane not already piped. **Hooks install; they do not heal.** A recorder
that dies — tmux restart, someone else grabbing the pipe — comes back on the next sweep,
so run one from cron or from your consumer if you want self-healing.

`@ronin-rireki off` on a session excludes it. Sessions named `grid_*` are skipped
(they are Ronin's viewers — a second view of a pane already taped).

## What it deliberately does not do

- **No rotation.** `cat` cannot rotate itself, so tapes grow without bound. A consumer
  is expected to be the janitor (Ronin re-points `pipe-pane` at a fresh segment at ~8MB
  and rings the total at 64MB). Standalone, add your own size check.
- **No timestamps, no framing, no cleaning.** The tape is the bytes. Anything cooked at
  capture time bakes a rendering decision into the recorder; interpretation belongs to
  whoever reads it.
- **No reach into any app.** It records a terminal, never an agent's internals. Works
  the same for a shell, vim, or any vendor's CLI.

## Reading a tape

Concatenate the segments in name order and replay them through any VT emulator. Plain
text in a hurry:

```bash
cat $RIREKI_DIR/<session>/<pane>/*.tape | sed -e 's/\x1b\[[0-9;?]*[a-zA-Z]//g'
```

Alt-screen apps (claude, vim, htop) repaint in place, so a naive strip repeats itself —
collapsing repaints into a transcript is reconstruction, not transcription, and any
consumer doing it should say so. Ronin's lens (`src/lens.ts` in the tmux-ronin repo) is
one implementation.
