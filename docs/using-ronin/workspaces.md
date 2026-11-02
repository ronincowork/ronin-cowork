# Workspaces

A Workspace is a project. It tells every Agent on it what the work is and where it lives, so
you say it once instead of to each Agent.

A Workspace holds:

- **Objective** — what the project is for.
- **Instructions** — anything every Agent on it should know.
- **Locations** — the folders and repositories its Agents work in, each with a short note.
- **Mode** — Native, or Dangerously for providers that offer it (Native where they don't).

## Teams work in a Workspace

Every Team is launched in a Workspace, and every Agent on the Team gets it. Choose it on
**New Team**, or change it in the Team's **Configuration**. New Agent asks nothing about
where to work: the Team already knows.

An Agent with no Team has no Workspace. That is meant for helpers like Mika, which carry
everything they need.

## Make or change a Workspace

Open the **Workspaces** door on Ronin Home. The Workspaces are on the left; press one to edit
it, or press **New Workspace**. Pick its locations from the folders Ronin already knows, or press
**Add a location** to make a new folder, choose one on this machine, or clone one from GitHub; it
is added to the Workspace in the same step. Press **Save**.

The folders Ronin knows are on the right, for their upkeep: Git, how Agents work in a
repository, archiving.

Agents start in a folder Ronin keeps for each Workspace. You never need to open it; your
project's files stay where they are.
