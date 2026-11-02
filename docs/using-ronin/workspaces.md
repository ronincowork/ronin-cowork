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

Open the **Workspaces** door on Ronin Home and press a Workspace, or **New Workspace**. Its page
is the whole Workspace. Under **Locations**, open folders on this machine and tick the ones it
uses; untick one, or press **Remove**, to take it out. Give each a note. For a folder with Git,
say how Agents work in it: each in its own desk, reviewed, or all in one folder. To bring in a
repository from GitHub, open the folder it should go in, type the repository and press **Clone
here**. Where Explorer is on, you can also drag a folder from [Explorer](explorer.md) onto the page.

Agents start in a folder Ronin keeps for each Workspace. You never need to open it; your
project's files stay where they are.
