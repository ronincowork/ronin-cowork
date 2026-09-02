# RONIN WORKTREES — private file work without collisions

This reading belongs to the **Ronin Worktrees** Routine. The Routine equips an Agent for
managed worktrees, branches and hand-in; it does not promise that every Project Root will
open a worktree. Both the Agent and the repository must have Worktrees on.

## When your birth brief names a desk

The brief names the repository, worktree path, private branch and Team line. Work only in
that path. Before the first repository write, compare the brief with:

```sh
tejun-desk status --assignment
```

The separately compiled **desk contract** gives the complete working agreement for an
actual desk. Its four boundaries are distinct: save changes, commit a private checkpoint,
hand committed work to the Team line with `tejun-desk hand-in`, and leave Team promotion
to the Team lead. Never use `git push` as a substitute for hand-in.

If the reported desk is missing, points at another path or branch, or puts you on an
integration line, stop repository work and report the exact mismatch to the Team lead.
Do not create or repair the worktree yourself.

## When no desk is named

Use the Project Root's ordinary checkout and its repository instructions. Do not invent a
desk, branch, hand-in target or managed workflow merely because this Routine is enabled.
The launch receipt explains why no desk was opened when the repository did not allow one.

## Repository setup is a separate task

`ronin-repo-init <project-root>` is only for a Configuration task that explicitly says a
Project Root needs a local Git repository. Routine selection by itself is never permission
to initialize or change a repository.
