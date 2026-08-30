# ronin_bin — the agent-facing tools

**Everything an agent types, and nothing else** — `tejun`, `tejun-step`, `tejun-send`,
`tejun-peek`, `tejun-team`, `tejun-fork`, `tejun-session-set`, `tejun-team-set`, `tejun-wipeboard`,
`tejun-harakiri`, `tejun-recall`, `tejun-remember`, `tejun-rireki`, `tejun-desk`, `write_tegami`,
`read_tegami`. `setup.sh` puts this
directory on PATH, after `bin/shim` (the guards) and ahead of `bin/`.

**The shelf is defined by its audience, the catalog by its rule.** Anything an agent
types by bare name belongs here — the letter tools included, which is why they moved
out of `bin/` on 2026-08-14. A **TEJUN tool** is the subset that additionally
implements a cataloged action (`ronin_catalogs/TOOLS.md`), and that rule still binds
every `tejun-*`.

**Where the rest lives**, by who runs it: **`bin/`** — the owner's own commands
(`ronin-byoin`, `ronin-doctor`, `ronin-deploy`, `ronin-store`, `ronin-uninstall`,
`ronin-export`, `bench`), typed by a person. **`libexec/`** — invoked by the machine
and typed by nobody (`ronin-gate` from ExecStartPost, `rireki/` the tmux applet,
`koshi` the job process, `ronin-may-spawn`, `ronin-claim` from the git hooks).
**`scripts/`** — the repo's own tooling, run by npm and by BYOIN. `bin/shim/` stays
where it is: it is PATH interception, so you type `tmux` and the guard answers.

One shelf per audience: **ronin_catalogs** (what you can do) · **ronin_library** (the
reading) · **ronin_sops** (how this house works) · **ronin_bin** (what you run).

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
