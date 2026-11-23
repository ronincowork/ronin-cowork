# Workspaces

A Workspace is a body of work, like a project. It tells every Agent on it what the work is and
where it lives, so you say it once instead of to each Agent. Everything hangs on the Workspace:
Ronin keeps no list of folders of its own.

A Workspace holds:

- **Summary** — [its doc](#its-doc): what the work is for and what is in it, and notes.
- **Folders** — the folders and repositories its Agents work in, each a name and its path,
  with a short note. A repository's row also says how Agents work in it.
- **Integrations** — the outside services it uses.
- **Objective** and **Instructions** — what every Agent on it is told.
- **Mode** — Dangerously unless you choose Native (Native for providers that offer no Dangerously form).
- **Plans** — where its plans are kept ([Writing a plan](planning.md)).
- **Canvases** — one-page maps of the Workspace: its live site, repos, work, documents and outside services.

Ronin starts you with two: **Ronin Lab**, for ideas, research, assistants and planning before a
project exists, and **Project One**, for your first project. Add your own whenever you have work
somewhere else.

## Teams work in a Workspace

Every Team is launched in a Workspace, and every Agent on the Team gets it. Choose it on
**New Team**, or change it in the Team's **Configuration**. New Agent asks nothing about
where to work: the Team already knows.

An Agent with no Team has no Workspace. That is meant for helpers like Mika, which carry
everything they need.

## Its doc

Every Workspace has one doc: `~/ronin/office/workspaces/<name>.md`, made with the Workspace.
It is the one place its notes live. It starts with a **Summary**, a few lines on what the
Workspace is for and what is in it, then notes. A Workspace's **Work** view shows the whole doc
under its Teams and Epics; press **Edit** to change it there, then **Save**. `office read` shows each Summary. Agents read and
write it with `workspace-doc` (`workspace-doc --help`); it is a plain file, so you can open it
too. A Workspace without a Summary gets one from the PLAYBOOK-2 [playbook](playbooks.md): a fresh
Agent it is checked out to reads its folders and repositories, writes the Summary, and ends.

## Make or change a Workspace

Open the **Workspaces** door on Ronin Home (or **Workspaces** in [Ronin Setup](../getting-started/setup-workbench.md)).
Each Workspace is a stone, like an Epic's or a Team's: its name, and along its foot the progress of
what its Teams and their Agents hold. ⚑ at the top right means something open in it is flagged;
the small number at the bottom right is how many Teams work in it.
Flagged Workspaces come first, then the rest by name. The last stone is **New Workspace**.

Press a stone and that Workspace opens beside the stones, the way an opened Team does. At its top
is its bar: its name with **Launch**, its objective, its progress along the foot. Press the bar to
open its Configuration under it (Folders, Integrations, Agent info and Behaviors, with **Save**);
press it again to close it. Below the bar are three lines, each opening and closing, with its count:

- **Teams** — the Teams stones of this Workspace. Press one to open it beside them, with **Launch**
  into its workbench.
- **Epics** — the open Epics its Teams and their Agents hold, the same stones as on the Epics page.
  Press one to open its board, with **Launch** into the Team working it.
- **Document** — [its doc](#its-doc), as one page; **Edit** at its top right.

**Launch** opens the Workspace on its own page, `#/workspace/<name>`, in a new browser tab, with the
whole page's room. A stone dragged into a tilespace opens it whole there.

**New Workspace** is its **Name**, then what a made Workspace's Configuration has: **Folders**,
**Integrations** and **Agent info**. Press **Create**; nothing is kept until then. The made Workspace
opens with its Configuration open, where its **Behaviors** are.

In Config the page reads, top down: its **Folders**, then, folded until you open them, **Integrations**, **Agent info** (its objective, instructions, Mode and plans) and
**Behaviors**. **⋯** at the top holds **Archive**: the Workspace stops being offered when you
start a Team, and nothing is deleted; **Restore** brings it back.

### Folders

**Add a folder** picks a folder on this machine: walk to it or find it and press **Add**, make a
new one with **New folder here**, or paste its path. **Clone from GitHub** asks for the
repository, then where to put it: walk to a folder and press **Clone**. Under them is a row per
folder: its name and path and, for a Git repository, its remote in a line under them. Press × to
take a folder out of this Workspace; nothing on disk is touched. **+ note** on a row adds a note
for Agents (what the folder is for; it goes into their brief). Where Explorer is on, you can also
drag a folder from [Explorer](explorer.md) onto the page.

The same folder can be in several Workspaces; it is one folder, under one name, in each.

**What opens outside Workspaces.** On your own machine, documents an Agent links in Chat or lists
on its work record open from its tile, wherever they are. In a hosted office Ronin owns the
machine, so every folder under the office's home opens too (a project you haven't made a
Workspace yet, for one), except hidden ones: a file or folder whose name starts with "." never
opens there, not even from a link, and **Add a folder** doesn't show them.

### How Agents work in a repository

A repository's row shows its **Mode**; press the word to change it. It is kept on that row:

- **Reviewed** — each Agent works in its own worktree and branch and hands its work in to the
  Team lead, who checks it and promotes it to the repository's dev. Best for code, especially
  with several Agents at once. See [Managed worktrees](desks.md).
- **Direct** — every Agent works in the repository's one checkout and commits straight to it; no
  hand-in, no check. Best for notes, plans and research.

A repository added here starts Direct, on the branch it has checked out.

### Bring in a GitHub repository

**Clone from GitHub** uses this machine's Git access: a private repository clones only once this
machine is signed in to GitHub. That sign-in belongs to the machine's setup, not to a Workspace, so
the Workspaces page does not offer it.

### Plans and Canvases

In Agent info, **Plans** says where the Workspace keeps its plans: Ronin Lab's
`<campaign>/<workspace>/plans`, marked recommended. Press it to pick another of its folders and a
subfolder. On Save the plans move there; a plan of the same name already there stops the Save,
so one plan never overwrites another. Agents never see the folder: they use the `plan` tool.

Under Plans, **Canvases** names the Workspace's canvases: press one and it opens over the page,
read fresh, with × to go back. A Netlify site's canvas starts with two buttons, Draft (the newest
preview) and Live (the site); then Drafts, each preview its own entry with Open (what it is, who
made it, for which item); then Live, traffic, forms, the repos and the services an Agent typed in.
Agents make and keep canvases with the `canvas` tool. On a Team's workbench the same canvases are
on the Docs pane's **Canvases** shelf (its Workspace's): press one and it opens there, read now.

Nothing is kept until you press **Save** (or **Create**) at the top: it lights up once there is a
change, and **−** beside it throws the changes away.

## Where Agents start

Every Agent starts in the same folder, one Ronin keeps for all of them, whatever its
Workspace: a provider asks to trust that folder once, not once per Workspace. You never need
to open it; your project's files stay where they are.

A Workspace's folders tell your Agents where to work. They are not a lock: Agents can reach
whatever your account on this machine can. See
[how Ronin protects your machine and work](../getting-started/how-ronin-protects-you.md).
