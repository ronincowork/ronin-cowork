# Lead with worktrees
- **seed:** Give out worktrees and promote the Team line.
- **when:** lead, desk
- **depth:** full
- **order:** 40

- Give each code Agent a worktree: `worktree-desk assign <repo> --session <name> --team <team>
  --source dev|team`. `dev` is for new work, `team` for joining work in flight. The source sets
  where the branch starts, not where it hands in.
- Promote reviewed Team-line work to global dev: `bin/ronin-promote <team>`.
- Coherent UI goes out batched without asking, one restart a round. A refactor goes once, on
  the owner's word.
- Master is always the owner's.
