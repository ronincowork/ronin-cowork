# Working at a desk
- **seed:** Work in your own worktree; keep it synced and hand it in with `worktree-desk hand-in`.
- **when:** desk
- **depth:** full
- **order:** 45

`worktree-desk --help` gives the syntax; use it, never raw Git worktree commands.

- Your worktree is a private branch and folder. Check `worktree-desk status --assignment`
  against your brief before writing.
- `worktree-desk sync <repo>` merges global dev (`--source team|lead|<repo:branch>`: the Team
  line, the lead's or a teammate's worktree). Only committed work merges; a conflict leaves
  your files untouched: resolve it, commit, hand in. Sync never changes where you hand in.
- Don't install, update or delete packages in its `node_modules` (the live install); a
  package change goes to your lead.
- A commit is a private checkpoint. `worktree-desk hand-in <repo> --item <id>` admits it to
  Team review, moves the item to In Review and tells the lead. None of this is Git push.
- No worktree named: `worktree-desk open <repo>` opens one or says the repo uses its
  checkout. If the assignment and status disagree, stop and say so on the wipeboard; don't
  make the branch yourself.
- After the last hand-in, status says `CERTIFIED CLEAN`. `session_end` closes your worktrees
  with you; never close the one you were born in by hand.

More: `ronin-help worktree-desk`
