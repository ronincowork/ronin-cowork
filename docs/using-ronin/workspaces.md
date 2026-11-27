# Workspaces

A Workspace is a body of work, like a project. It tells every Agent on it what the work is and
where it lives, so you say it once instead of to each Agent. Everything hangs on the Workspace:
Ronin keeps no list of folders of its own.

A Workspace holds:

- **Objective** — what the project is, in your words: the one place that says so.
- **Folders** — the folders and repositories its Agents work in, each a name and its path,
  with a short note. A repository's row also says how Agents work in it.
- **Integrations** — the outside services it uses.
- **Instructions** — standing directions every Agent on it is told.
- **New Agent defaults** — the Mandate, Mode and models each new Team and Agent in it starts with,
  copied from the office's defaults when the Workspace is made; changed only on its Configuration.
- **Plans** — where its plans are kept ([Writing a plan](planning.md)).
- **Canvases** — one-page maps of the Workspace: its live site, repos, work, documents and outside services.

Ronin starts you with none. Setup's Workspace step asks how you are starting: from a Git
repository, an existing project not in Git, from scratch, or not sure yet, which makes **Ronin
Lab**, for ideas, research and planning before a project exists. Each Workspace's folder is
`~/ronin/<name>`, with `plans/`, `files/` and `repos/` inside. Add more whenever you have work
somewhere else.

A Workspace holds items too: open work of the project that no Team has yet, which go to its first
Team when Setup's Team step makes one, and its **Icebox** of parked ideas
([Writing a plan](planning.md#park-it-the-icebox)), which no Agent reads or pulls into work.

## Teams work in a Workspace

Every Team is launched in a Workspace, and every Agent on the Team gets it. Choose it on
**New Team**, or change it in the Team's **Configuration**. New Agent asks nothing about
where to work: the Team already knows.

An Agent with no Team has no Workspace. That is meant for helpers like Mika, which carry
everything they need.

## Make or change a Workspace

Open the **Workspaces** door on Ronin Home.
Each Workspace is a stone, like an Epic's or a Team's: its name, and along its foot the progress of
what its Teams and their Agents hold. ⚑ at the top right means something open in it is flagged;
the small number at the bottom right is how many Teams work in it.
Flagged Workspaces come first, then the rest by name. The last stone is **New Workspace**.

In **Settings**, the Workspaces card has the same stones, and a pressed one opens its
Configuration alone; its work (Teams, Epics) is on its own page, by **Launch**.

Press a stone and that Workspace opens beside the stones, the way an opened Team does. At its top
is its bar: its name with **Launch**, its objective, its progress along the foot. Press the bar to
open its Configuration under it (Describe, Where it lives, and More, with **Save**);
press it again to close it. Below the bar are two lines, each opening and closing, with its count:

- **Teams** — the Teams stones of this Workspace. Press one to open it under them as the Teams page
  opens it: its bar with **Launch** into its workbench, then its Agents and its Epics.
- **Epics** — the open Epics its Teams and their Agents hold, the same stones as on the Epics page.
  Press one to open its board, with **Launch** into the Team working it.

**Launch** opens the Workspace on its own page, `#/workspace/<name>`, in a new browser tab, with the
whole page's room. A stone dragged into a tilespace opens it whole there.

**New Workspace** asks "How are you starting?" with the same four ways as Setup's Workspace step:
from a Git repository, an existing project not in Git, from scratch, or not sure yet (Ronin Lab).
Each opens only its own questions; press **Create** and the made Workspace opens with its
Configuration open. It is the one way to make a Workspace, here, in Settings and in Setup.

A made Workspace's Configuration reads top down: **1 Describe**, "What are you working on?", its
objective and its kind; **2 Where it lives**, its folders and repositories; **3 More**, folded until
you open it: its instructions, New Agent defaults, plans, canvases, **Integrations** and
**Behaviors**. **⋯** at the top holds **Archive**: the Workspace stops being offered when you
start a Team, and nothing is deleted; **Restore** brings it back.

### Folders and repositories

Every Workspace has its own folder, `~/ronin/<name>`, its first row. **Add a repository** opens a
panel: a Git URL from any host (owner/name means GitHub) and **Clone**, and once GitHub is signed in
here, your repositories, each with **Use**. It first asks how Agents work in it, **Desks** unless you
choose **Direct**. Each repository is cloned into the Workspace's `repos/` folder. A public repository
needs no sign-in; a private one clones only once this machine is signed in to its host. For GitHub,
ask the Helpful Assistant to connect GitHub: it signs the GitHub CLI in with a code you approve in your
browser. That sign-in belongs to the machine, not to a Workspace.

Each row is a name and its path and, for a Git repository, its remote in a line under them. Press ×
to take a row out of this Workspace; nothing on disk is touched. **+ note** adds a note for Agents
(what the folder is for; it goes into their brief).

**What opens outside Workspaces.** On your own machine, documents an Agent links in Chat or lists
on its work record open from its tile, wherever they are. In a hosted office Ronin owns the
machine, so every folder under the office's home opens too (a project you haven't made a
Workspace yet, for one), except hidden ones: a file or folder whose name starts with "." never
opens there, not even from a link.

### How Agents work in a repository

A repository's row shows its **Mode**; press the word to change it. It is kept on that row:

- **Desks** — each Agent works on its own desk (a worktree and branch) and hands its work in to the
  Team lead, who checks it and promotes it to the repository's dev. Best for code, especially
  with several Agents at once. See [Managed worktrees](desks.md).
- **Direct** — every Agent works in the repository's one checkout and commits straight to it; no
  hand-in, no check. Best for notes, plans and research.

### Plans and Canvases

In More, **Plans** says where the Workspace keeps its plans: its own folder,
`~/ronin/<workspace>/plans`, marked recommended. Press it to pick another of its folders and a
subfolder. On Save the plans move there; a plan of the same name already there stops the Save,
so one plan never overwrites another. Agents never see the folder: they use the `plan` tool.

Under Plans, **Canvases** names the Workspace's canvases: press one and it opens over the page,
read fresh, with × to go back. A Netlify site's canvas starts with two buttons, Draft (the newest
preview) and Live (the site); then Drafts, each preview its own entry with Open (what it is, who
made it, for which item); then Live, traffic, forms, the repos and the services an Agent typed in.
Agents make and keep canvases with the `canvas` tool. On a Team's workbench the same canvases are
on the Docs pane's **Canvases** shelf (its Workspace's): press one and it opens there, read now.

Nothing is kept until you press **Save** at the top: it lights up once there is a
change, and **−** beside it throws the changes away.

## Where Agents start

Every Agent starts in the same folder, one Ronin keeps for all of them, whatever its
Workspace: a provider asks to trust that folder once, not once per Workspace. You never need
to open it; your project's files stay where they are.

A Workspace's folders tell your Agents where to work. They are not a lock: Agents can reach
whatever your account on this machine can. See
[how Ronin protects your machine and work](../getting-started/how-ronin-protects-you.md).
