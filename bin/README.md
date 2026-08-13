# Adding tools (TEJUN)

Entry point for the whole system: `../TEJUN.md`. Tools are executables that
implement ACTIONS in one call. Current catalog: `../tejun_catalogs/TOOLS.md`.

## The rules

1. **A tool must implement a cataloged action.** No action → no tool. Add the action
   first (`../tejun_catalogs/README.md`), then the tool, then a `> Tool:` pointer in the
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
