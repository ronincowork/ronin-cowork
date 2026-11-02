# Workspace folders

A workspace folder is a repository or folder Ronin knows by name: a project, a notes folder,
a site. A [Workspace](../using-ronin/workspaces.md) picks the ones its Agents work in.

Ronin starts you with two:

- **Ronin Lab** — for ideas, research, assistants, and planning before a project exists.
- **Project One** — for your first project.

That's enough to start. Add your own whenever you have work somewhere else.

## Add a folder

Open **Workspace folders** in [Ronin Setup](setup-workbench.md), or the **Workspaces** door
on Ronin Home.

1. Press **Add a repository or folder**.
2. Browse to the folder you want. Folders that are repositories are listed first.
3. Press **Keep** beside it.
4. Give it a name if you like, and press **Add**.

The name is only what you see in Ronin. Changing it later never moves or renames the folder.

## Bring in a GitHub repository

To work on a repository that isn't on this machine yet, use the **GitHub CLI** stone:
**Install**, then **Authenticate** to sign in to GitHub. Then press **Clone a repository**,
pick it, and it becomes a workspace folder like any other, ready to add to a Workspace.

Folders already on the machine don't need GitHub.

## One copy, or one each

When the folder is a repository, you choose how Agents share it, under **Repository** when
you add the folder or press **Edit** on it:

- **Worktrees** — each Agent gets its own private copy and branch, and hands its work in
  when it's done. Best for code, especially with several Agents at once. See
  [Managed worktrees](../using-ronin/desks.md).
- **Checkout** — every Agent works in the one folder. Best for notes, plans and research,
  where one shared, current copy is what you want.

You can change your mind later.

## Removing a folder

Press a folder's stone. **Archive** takes it off the list you pick from when starting an
Agent; **Exclude** removes it from Ronin altogether. Either way the folder and everything in
it stay on disk, and Agents already working there keep going.

A workspace folder tells your Agents where to work. It isn't a lock: Agents can reach
whatever your account on this machine can. See
[how Ronin protects your machine and work](how-ronin-protects-you.md).
