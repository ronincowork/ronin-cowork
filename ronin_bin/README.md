# ronin_bin — the agent-facing tools

The executables the catalogs tell an agent to type, by bare name — `tejun`,
`tejun-step`, `tejun-send`, `tejun-peek`, `tejun-group`, `tejun-wipeboard`,
`tejun-harakiri`, `tejun-recall`, `tejun-remember`, `tejun-rireki`. `setup.sh` puts
this directory on PATH, after `bin/shim` (the guards) and ahead of `bin/`.

**What belongs here and what does not.** A tool — a script a cataloged action names
(`ronin_catalogs/TOOLS.md`) — lives here. The house's own scripts (`ronin-*`,
`setup.sh`, the shim, the byoin_checks) stay where they are: they have callers, not
actions, and an agent never types them. One shelf per audience:
**ronin_catalogs** (what you can do) · **ronin_library** (the reading) ·
**ronin_sops** (how this house works) · **ronin_bin** (what you run).

## Adding a tool

Entry point for the whole system: `ronin_catalogs/README.md`. A tool is an executable
that implements an ACTION in one call; the current catalog is
`ronin_catalogs/TOOLS.md`.

1. **A tool must implement a cataloged action.** No action → no tool. Add the action
   first (`ronin_catalogs/README.md`), then the tool, then a `> Tool:` pointer in the
   action's ACTIONS.md section, then a row in TOOLS.md. All four or it didn't happen.
2. **Tools self-enforce the dial** (`@ronin-control`) and the other safety rules of
   their action (ghost-text, confirm-started). The fast path must never be a bypass
   of the guard hook.
3. Zero-dependency bash (assume no jq; python3 exists if JSON is unavoidable).
4. One-line verdicts (DELIVERED / DENIED / BLOCKED / STUCK / NO-SESSION …) and
   meaningful exit codes — agents branch on these.
5. Name: `tejun-<verb>`. Keep flags minimal; positional args.
6. Test against a scratch session (`tmux new-session -d -s ttest`) before
   committing; kill it after.
