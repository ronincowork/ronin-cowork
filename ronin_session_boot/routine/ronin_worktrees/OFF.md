# RONIN WORKTREES — what this Agent is working without

Ronin Worktrees is **off** for this Agent. Every Agent on a repository shares its one checkout: two Agents editing the same file collide, and the owner is the only one who will notice. There is no private desk, no hand-in, no team line, no promotion receipt; work reaches a branch only by the owner's own Git.

Worktrees gives each Agent a private branch and worktree per repository, a mechanical hand-in to the team line, and one full check before anything reaches `dev`. It pays the moment more than one Agent touches one repository.

**The switch:** Team Configuration for this team, or the Campaign's Routines for new teams. The repository must also allow Worktrees on its project root. If the owner asks for parallel Agents on one codebase, this is the Routine.
