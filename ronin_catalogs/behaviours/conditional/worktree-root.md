# Managed worktree — get, update, and hand in

- **label:** Managed worktree
- **scope:** conditional
- **requires:** arrangement:managed
- **installation:** —

Run `worktree-desk --help` before the first worktree command in a session. The tool owns the
current syntax and resolves the repository's declared arrangement; do not reproduce its
guarded work with raw Git worktree commands.

An assigned worktree is a private branch and working folder. Compare `worktree-desk status --assignment`
with the brief before writing. `worktree-desk sync <repo>` merges global dev by default.
Use `--source team` for the shared Team review line, `--source lead` for the Team lead’s
private worktree, or `--source <repo:branch>` for a specific teammate’s worktree in the same repo.
Only committed work merges; read what sync reports. A conflict leaves your files untouched:
resolve it on your worktree, then commit and hand in.

Your worktree's `node_modules` is the live install Ronin runs from. Don't install, update
or delete packages there; a package change goes to your Team lead.

Commit preserves a private checkpoint; `worktree-desk hand-in <repo> --item <id>` admits
committed work to Team review, moves the item to In Review and tells the lead, so there's
no need to tell it yourself. Sync changes neither source custody nor your hand-in
destination. None of those operations is Git push.

If no worktree was named, `worktree-desk open <repo>` either opens one or reports that the
repository uses its checkout. A contradiction between the assignment and status is the
one case to stop and report on the Team wipeboard; do not create the missing branch or
worktree yourself.

After the final hand-in, status must say `CERTIFIED CLEAN`: no unsaved files and every
commit on the Team line. Your worktrees end with you, never before you: `session_end` closes
certified worktrees and the Agent together; anything else keeps both and says what to do.

`worktree-desk discard` refuses an occupied worktree, names who stands there, and deletes
nothing; Hard Delete removes the Agent and its worktrees together.

More: `ronin-help desks`
