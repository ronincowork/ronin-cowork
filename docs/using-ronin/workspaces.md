# Workspaces

A Workspace is a project. It tells every Agent on it what the work is and where it lives, so
you say it once instead of to each Agent.

A Workspace holds:

- **Objective** — what the project is for.
- **Instructions** — anything every Agent on it should know.
- **Locations** — the folders and repositories its Agents work in, each with a short note.
- **Mode** — Native, or Dangerously for providers that offer it (Native where they don't).
- **Plans** — where its plans are kept ([Writing a plan](planning.md)).

## Teams work in a Workspace

Every Team is launched in a Workspace, and every Agent on the Team gets it. Choose it on
**New Team**, or change it in the Team's **Configuration**. New Agent asks nothing about
where to work: the Team already knows.

An Agent with no Team has no Workspace. That is meant for helpers like Mika, which carry
everything they need.

## Make or change a Workspace

Open the **Workspaces** door on Ronin Home and press a Workspace, or place **New Workspace** from
the selector. **Show** above the stones picks what hangs under each one: the Teams launched in it, the Epics they work on, or both. Its page reads
like New Team, every section folding to its answer: **Name & objective** (the
title and name are chosen once, when the Workspace is made; Teams refer to them, so once
made the section is just the **Objective**), then
**Locations**, then **Agent info**, its instructions and Mode (folded until you open it).
Locations opens with two choices. **Add a folder** browses this machine: tick the folders the
Workspace uses; untick one, or press ×, to take it out. **Clone a repo** asks for the
repository, then where to put it: walk to a folder and press **Clone**. Under the choices is a
row per folder. A folder with Git shows its **Mode**, which belongs to the repository; press the
word to change it. **Reviewed**: each Agent works in its own worktree and hands its work in to the
Team lead, who checks it and promotes it to the repository's dev. **Direct**: every Agent works in
the repository's one checkout and commits straight to it; no hand-in, no check. The two are
explained once, above the rows. **+ note** on a row adds a note for Agents (what the folder is
for; it goes into their brief). Where Explorer is on, you can also drag a folder from [Explorer](explorer.md)
onto the page. Under the rows, **Plans** says where the Workspace keeps its plans: Ronin Lab's
`<campaign>/<workspace>/plans`, marked recommended. Press it to pick another Location and a
subfolder. On Save the plans move there; a plan of the same name already there stops the Save,
so one plan never overwrites another.
Agents never see the folder: they use the `plan` tool. Nothing is kept until you press **Save** (or **Create**) at the top: it lights up once there
is a change, and **−** beside it throws the changes away.

Every Agent starts in the same folder, one Ronin keeps for all of them, whatever its
Workspace: a provider asks to trust that folder once, not once per Workspace. You never need
to open it; your project's files stay where they are.
