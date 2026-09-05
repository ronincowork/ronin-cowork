# Develop a New Project
- **label:** Develop a New Project
- **art:** ⌘
- **blurb:** A project lead and parallel feature Agents, each with its own worktree.
- **order:** 2
- **kinds:** coding
- **objective:** Build the project the owner describes, coordinating parallel features without colliding.
- **behaviours:** sops:teams, sops:github
- **routines_on:** ronin_worktrees

## agents

### project lead
- **team_lead:** yes
- **instructions:** Own the whole project, divide feature work cleanly, and integrate the team's results.
- **mandate:** execute · staff agents · code

### frontend
- **instructions:** Implement the project's frontend assignment in its managed worktree.
- **mandate:** execute · nobody · code

### backend
- **instructions:** Implement the project's backend assignment in its managed worktree.
- **mandate:** execute · nobody · code
