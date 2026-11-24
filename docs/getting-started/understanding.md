# Understanding

How your Agents begin, and what they do on their own. Nothing here needs configuring to start;
skip it and come back whenever you like.

## Two kinds of Agent

- **Cowork Agent** (the default). It starts with Ronin's instructions, its brief: who is on its
  Team, how to message the others, how to hand in work and keep its items true. Best for Teams.
  What the brief holds: [the tile](../using-ronin/tile.md) shows it on the Agent's work record.
- **Bare-metal Agent.** The harness exactly as it comes, with nothing from Ronin. It knows nothing
  about the Team or its tools unless you tell it. Best when you want the tool untouched; start one
  any time from a Team's page.

Not sure? Leave Cowork on.

## The Ronin toolkit

Cowork Agents already know it.

1. **They talk to each other.** An Agent can message another directly, post a note to its Team's
   wipeboard, or share a document for the others to read. For every Team.
   [Team lead and edges](../using-ronin/team-lead-and-edges.md).
2. **They hand in work for review.** Each Agent codes in its own worktree. Finished work is
   handed in, the Team lead reviews it, and only then is it promoted to the shared branch. Mostly
   for coding Teams. [Workspaces](../using-ronin/workspaces.md#bring-in-a-repository).
3. **They track the work.** Epics hold the larger pieces; work items track who is doing what, as
   in Jira. Keep them in Ronin, or connect your Jira: Ronin reads it every minute while Ronin is
   open in a browser, and hourly otherwise. [Work items](../using-ronin/work-items.md),
   [Jira](../using-ronin/jira.md).
