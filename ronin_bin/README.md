# ronin_bin — the agent-facing tools

**Everything an agent types, and nothing else.** Every Agent receives this whole directory
on PATH at birth. Each tool's file in `ronin_stock/tools/` says what the brief tells about
it, and to whom; nothing here is taken off an Agent's PATH.

Use the wipeboard for team-wide messages and `edges send` for one session, with no board in between.

**This folder is defined by its audience.** Anything an agent types by bare name belongs
here — the letter tools included, which is why they moved out of `bin/` on 2026-08-14. Each
has its file in `ronin_stock/tools/`.

**Where the rest lives**, by who runs it: **`bin/`** — the owner's own commands
(`ronin-byoin`, `ronin-doctor`, `ronin-deploy`, `ronin-store`, `ronin-uninstall`,
`ronin-export`, `bench`), typed by a person. **`libexec/`** — invoked by the machine
and typed by nobody (`ronin-gate` from ExecStartPost, `rireki/` the tmux applet,
`koshi` the job process).
**`scripts/`** — the repo's own tooling, run by npm and by BYOIN. `bin/shim/` stays
where it is: it is PATH interception, so you type `tmux` and the guard answers.

One folder per audience: **ronin_stock** (the foundations an Agent is built from) ·
**ronin_bin** (what you run).

## Command help

`<tool> --help` gives its current usage before execution; help is local, side-effect-free, and exits zero.

**Two sourced files here are not tools.** `tool-path.sh` resolves a tool's real file
(`SELF`, hence `TOOL_DIR`) and carries `ronin_session_me`, the one resolver of which
session a tool is acting for (the pane, then `$TMUX`; never the focused tile), and
`ronin-http.sh` is sourced by every tool that talks to the operator: `ronin_connect`
resolves the door through the sibling `ronin-url` — the operator's Unix socket, or
`RONIN_URL` — and sets `url` and `RONIN_CURL` for the request
(`docs/architecture/operator-connection.md`). A tool never carries an address of its own.

**`ronin-asking` is a hook, not a tool.** Claude Code and Codex run it on their hook events
(`docs/agents/claude.md`, `codex.md`), never an Agent. It runs on every tool call, so it makes
one request and no tmux call: it sends its `$TMUX_PANE` and Ronin finds the session
(`src/asking.ts`). It connects through `ronin-http.sh` like every tool, and exits 0 when no
Ronin answers.

- **`ronin-url`** — Prints where the live operator answers, one line: `RONIN_URL` when set (a development/test target over HTTP), else the path of the operator's own Unix socket — `RONIN_SOCKET` as told at birth, else `<data root>/run/ronin.sock`. The socket is the address, the liveness check and the credential; no tmux is consulted (`docs/architecture/operator-connection.md`). Exit 4 with one of two refusals: no Ronin has started here (no socket), or Ronin is not running (socket, nobody listening). Shell callers build their request through the sourced sibling `ronin-http.sh` (`ronin_connect` sets `url` and `RONIN_CURL`), and resolve both beside their own real file, so an absolute path or projected symlink never depends on Ronin directories being on `PATH`.
- **`shim/tmux`** (in `bin/shim/`) — On PATH ahead of real tmux: makes `kill-server` unavailable because it ends every session. All other tmux commands pass through.

## Adding a tool

Entry point for the whole system: `ronin_stock/stock_readme.md`. A tool is one executable
operation with its file in `ronin_stock/tools/` (the header: `ronin_stock/tools/tools_readme.md`).

1. Add the executable and its tools file, as you add its docs. Both or it did not ship.
2. Tools report relevant session state and proceed.
3. Zero-dependency bash (assume no jq; python3 exists if JSON is unavoidable).
4. One-line outcomes make the result easy to read; warnings do not stop the action.
5. Name the task surface plainly. Keep flags minimal; positional args.
6. Test against a scratch session (`tmux new-session -d -s ttest`) before
   committing; kill it after.
