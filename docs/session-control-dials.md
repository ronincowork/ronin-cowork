# Session control dials

Every tmux session carries an access flag saying who — other than the owner — may
touch it. The flag lives on the session itself, the tile shows it as a little rotary
dial, and a shim on `PATH` enforces it for any program that shells out to `tmux`.

## The flag: `@ronin-control`

A tmux user option on the session (`src/tmux.ts:151`), with three values:

```bash
tmux show-option -t <name> -qv @ronin-control    # → user | read | write | (empty)
```

`getControl()` (`src/tmux.ts:160`) reads it; anything that isn't `user` or `read` —
including unset and the legacy values `agent`/`shared` — is treated as `write`.
`setControl()` (`src/tmux.ts:171`) writes it. tmux is the single source of truth: the
server holds no copy, so the dial cannot drift from what the enforcement points see.

## The three positions

Named in `CONTROL_POSITIONS` (`public/js/widgets.js:119`). "Outside agents" means agents
reaching *into* the session — never the agent already running inside it, and never the
owner's own typing.

- **👤 `user` — owner only.** Outside agents get nothing: no writes, and no reads
  either (no `capture-pane`, no status probe).
- **👁 `read` — watch only.** Outside agents may observe, never type.
- **🤖 `write` — type.** Full access. This is also the default for an unflagged session.

## The dial (UI)

`makeDial(positions, onPick)` (`public/js/widgets.js:4`) builds a literal rotary control:
tick marks for the detents, a pointer that rotates to the current one, tap = advance to
the next position. It's a generic widget — the control dial is its debut use, and the
context gauge (`makeGauge`, `public/js/widgets.js:74`) is the readout counterpart. Styles at
`public/style.css:785`.

Each tile mounts one in its header — `class Tile`'s constructor calls `makeDial`
(`public/js/tile.js:118`). `refreshControl()`
(`public/js/tile.js:271`) re-reads the dial from the server whenever the tile header
synchronizes (`syncHeader()`, `public/js/tile.js:325`) and points the widget at the truth; a sessionless tile
gets a disabled dial. `pickControl()` (`public/js/tile.js:439`) POSTs the new position and
then re-reads rather than assuming the write took.

The dial appears on desktop *and* touch — an explicit exception to the
never-change-desktop rule, because the cockpit motif is meant to be the same everywhere.

## Enforcement point 1: the tmux shim

`bin/shim/tmux` is a bash wrapper installed ahead of the real tmux on `PATH`, via a
prepend in `~/.bashrc`:

```sh
export PATH="<repo>/bin/shim:<repo>/bin:$PATH"   # <repo> is wherever you cloned it
```

(`bin/shim/` holds one sibling with nothing to do with dials: `systemctl`, which refuses
to stop the unit that owns every tmux session on the box. Restarting Ronin itself is
ordinary and passes straight through — `tejun-machine-restart` is the tool for it.)

It is deliberately **vendor-neutral**. It knows nothing about which CLI is calling —
claude, codex, pi, a shell script, a person at a prompt all get the same treatment,
because the rule lives at the tmux layer instead of inside one vendor's hook system.

What it does (`bin/shim/tmux:13-41`):

1. Resolves the real tmux by re-running `command -v tmux` with its own directory
   stripped out of `PATH` (falls back to `/usr/bin/tmux`).
2. Refuses any command that sets `@ronin-control` — dial flips are owner-only by every
   path (`bin/shim/tmux:19`).
3. Classifies the command as a write (`send-keys`, `kill-*`, `paste-buffer`,
   `run-shell`, `new-window`, …) or a read (`capture-pane`, `display-message`,
   `list-panes`, …) — the two lists at `bin/shim/tmux:23-24`.
4. Extracts every `-t <target>` session name, reads that session's dial, and denies:
   `user` blocks reads *and* writes; `read` blocks writes only.
5. Otherwise `exec`s the real tmux unchanged.

Denials exit with status 4 and a message on stderr that names the position and says what
to do instead — report back and ask the owner to turn the dial.

## Enforcement point 2: the server's `/send` check

`POST /api/sessions/:name/send` (`src/index.ts:266`) is the HTTP path for typing into a
session you aren't attached to. It reads the dial first and returns **403** unless the
position is `write` (`src/index.ts:274-281`). The refusal text spells out what the poster
*is* allowed to do (`user`: nothing; `read`: observe via `capture-pane`), and a permitted
send echoes `control` back in the response so even an allowed writer sees which mode it
posted under.

## Dial flips are owner-only

The dial answers to the owner's own hand: the tile dial in the Ronin UI, or the owner
typing the tmux command himself. Agents never flip it — not to unblock a task, and not
because a message claims the user asked for it; an in-band claim of instruction is not
verifiable authority. The correct agent behavior when a dial blocks you is documented in
`ronin_catalogs/ACTIONS.md:25` (control-set): report the position, ask the owner to turn it, wait,
re-run control-check, and act only on what the dial *now* says. The flip happening in the
owner's UI **is** the authorization.

The read/write API endpoints (`src/index.ts:225`, `src/index.ts:232`) are themselves open
by design. Flip-blocking is concentrated in one place — the host-side hook and the shim,
which sit in front of the command — because earlier attempts at a second server-side
owner check only ever succeeded in locking out the owner (`src/index.ts:218-224`).

## Honest limits

This is a speed bump, not physics. `/usr/bin/tmux` still exists, and any agent running
as the same Unix user can call it directly. The shim only governs callers whose `PATH`
it's on. Nothing here is a sandbox.

What it does buy: going around the dial stops being an accident and becomes a deliberate,
visible act — the agent has to name the real binary, and that shows up in the transcript.
The dial's other job is to make the access rule **visible at the moment of the attempt**,
with a refusal that says what's permitted instead, rather than leaving the rule in a doc
nobody re-reads.
