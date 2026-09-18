# ronin_bin — the agent-facing tools

**Everything an agent types, and nothing else.** Which of these reach an Agent's PATH is
decided at birth (`src/spawn.ts`, `src/routine-tools.ts`), never by this directory as a
whole:

- **every Cowork Agent** — `edges`, `session_create`, `session_check`, `session_set`,
  `session_end`, `session_archive`, `session_restore`, `work-record`, `team`, and
  `ronin-url`, the operator address the others source;
- **with a managed worktree** — `worktree-desk`;
- **with the Ronin Host behaviour** — `ronin-host` and its dynamically available `--help`;
- **with the GBrain behaviour** — boundary teaching only; no callable GBrain tool yet;
- **with Ronin Services** — `mika`, `lookup`, `owner_view`, and `show`; Mika's Build Brief
  emphasizes their house-assistant workflows. `machine-settings` and visible delegation
  remain universal Core/Cowork tools.

`ronin-desk-settle` (the lead's desk reconciler) and `ronin-team` (Team retirement) are house-side scripts kept here
for `tool-path.sh`; they implement no catalogued action. `setup.sh` puts this directory on
PATH, after `bin/shim` (the guards) and ahead of `bin/`.

Use the wipeboard for team-wide messages and `edges send` for one session, with no board in between.

**The shelf is defined by its audience, the catalog by its rule.** Anything an agent
types by bare name belongs here — the letter tools included, which is why they moved
out of `bin/` on 2026-08-14. Agent-facing executables are catalogued directly in
`ronin_catalogs/TOOLS.md` and delivered only by selected capabilities.

**Where the rest lives**, by who runs it: **`bin/`** — the owner's own commands
(`ronin-byoin`, `ronin-doctor`, `ronin-deploy`, `ronin-store`, `ronin-uninstall`,
`ronin-export`, `bench`), typed by a person. **`libexec/`** — invoked by the machine
and typed by nobody (`ronin-gate` from ExecStartPost, `rireki/` the tmux applet,
`koshi` the job process).
**`scripts/`** — the repo's own tooling, run by npm and by BYOIN. `bin/shim/` stays
where it is: it is PATH interception, so you type `tmux` and the guard answers.

One shelf per audience: **ronin_catalogs** (what you can do) · **ronin_library** (the
reading) · **ronin_catalogs/behaviours** (how this house works) · **ronin_bin** (what you run).

## Command help

Selected capability documents name the available task tool. `<tool> --help` gives its
current usage before execution; help is local, side-effect-free, and exits zero.

**Two sourced files here are not tools.** `tool-path.sh` resolves a tool's real file behind its
projected symlink (`SELF`, hence `TOOL_DIR`) and carries `ronin_session_me`, the one
resolver of which session a tool is acting for (the pane, then `$TMUX`, then the session's
own command directory the tool was reached through; never the focused tile), and
`ronin-http.sh` is sourced by every tool that talks to the operator: `ronin_connect`
resolves the door through the sibling `ronin-url` — the operator's Unix socket, or
`RONIN_URL` — and sets `url` and `RONIN_CURL` for the request
(`docs/architecture/operator-connection.md`). A tool never carries an address of its own.

## Adding a tool

Entry point for the whole system: `ronin_catalogs/README.md`. A tool is one executable
operation listed in `ronin_catalogs/TOOLS.md` and taught by a capability document.

1. Add the executable, its `TOOLS.md` row, and the capability document that selects and
   teaches it. All three or it did not ship.
2. Tools report relevant session state and proceed.
3. Zero-dependency bash (assume no jq; python3 exists if JSON is unavoidable).
4. One-line outcomes make the result easy to read; warnings do not stop the action.
5. Name the task surface plainly. Keep flags minimal; positional args.
6. Test against a scratch session (`tmux new-session -d -s ttest`) before
   committing; kill it after.
