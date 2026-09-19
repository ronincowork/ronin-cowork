# Workspace Folders — where Ronin works

Workspace Folders are your project roots — the known surfaces your Agents work on. A
Workspace Folder is a real directory on this machine or a GitHub repository. When you start
an Agent you choose one, and it becomes that Agent's ground: where it opens files, runs
commands, and keeps its work.

You need at least one before an Agent has anywhere to work. One is enough to start.

## Add one

Open **Workspace folders** in [Ronin Setup](setup-workbench.md), or the
Workspace Folders page in cowork commons afterwards. You give two things:

| You give | What it is |
|---|---|
| A directory | An existing folder on this machine, or a repository you clone through GitHub. |
| A name | What you will see in the launcher and on an Agent's record. Presentation only. |

The name is free to change later. Changing it never moves the directory, never renames the
folder on disk, and never changes the identity of any Agent already working there.

## GitHub repositories

Authenticate with GitHub from the same surface to work on remote repositories as well as
folders already on this machine. Once authenticated you can clone a repository and register
it in one step, and it becomes a Workspace Folder like any other.

Local directories do not need this. Authenticate only when you want Ronin reaching
repositories that are not already on the machine.

## Choosing a folder

Point at the project you actually want worked on — the repository, the notes directory, the
site. Prefer the folder you would open in an editor.

A Workspace Folder can be a Git repository or a plain directory.

## Desks or a shared checkout

When a Workspace Folder is a repository, you choose how Agents work inside it.

| Choice | What each Agent gets | Suits |
|---|---|---|
| [Managed worktree](../using-ronin/desks.md) | Its own branch and working tree | Active code editing, and several Agents at once |
| Shared checkout | The one working tree, on whatever branch it is on | Notes, research, plans, and reading |

Prefer desks whenever the work is code and more than one Agent may touch it. Parallel
Agents on one checkout share a single set of uncommitted changes, so one Agent's
half-finished edit is visible to every other and easy to lose.

Prefer a shared checkout for a repository of documents rather than code — plans, notes,
research, drafts and work in progress. A desk adds ceremony to every edit: a branch to
open, work to commit, a hand-in, and a merge. For code that isolation is often worth it.
For documents, the useful default is usually one current copy that everyone can read.

A repository can change its mind. Start with a shared checkout and open desks later if the
work turns into code, or switch back when one shared copy becomes more useful.

You can register as many as you like, and the same machine can hold unrelated ones — a work
repository, a personal notes folder, a site. Agents see only the one they were started in.

## What this is and is not

Registering a folder is how you **point** Ronin at work. It is a convenience and a record,
not a sandbox: Ronin's tiles run as the account that installed Ronin, and that account's
own file permissions are what actually limit reach. If you need a harder boundary, put it
at the account or machine level — see
[how Ronin protects your machine and work](how-ronin-protects-you.md).

## Removing one

Removing a Workspace Folder removes Ronin's record of it. It does not delete the directory
or anything in it. Agents already running in that folder keep running; the folder simply
stops being offered when you start something new.

## Related

- [Ronin Setup](setup-workbench.md) — the first-run door, and every page behind it
- [Managed worktrees](../using-ronin/desks.md) — private branches for Agents in a repository
- [Workspace Folders — construction](../architecture/project-roots.md) — the handle, the
  record, and how session identity resolves it
