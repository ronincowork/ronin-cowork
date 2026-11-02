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

Open the **Workspaces** door on Ronin Home and press a Workspace, or place **New Workspace** from
the selector. Each stone lists the Teams launched in the Workspace and the Epics they work on. Its page reads
like New Team, every section folding to its answer: **Name & objective** (the
name is chosen once, when the Workspace is made; Teams hold it), then
**Agent info**, its instructions and Mode (folded until you open it), then **Locations**: a row per folder with its note
and, for a folder with Git, how Agents work in it (each in its own desk, reviewed, or all in one
folder). Open **Add folders** to browse this machine and tick the folders it uses; untick one, or
press ×, to take it out. Open **Clone from GitHub** to bring in a repository: it lands in the
folder Add folders is open on. Where Explorer is on, you can also drag a folder from [Explorer](explorer.md)
onto the page. **Save** (or **Create**) is at the top.

Agents start in a folder Ronin keeps for each Workspace. You never need to open it; your
project's files stay where they are.
