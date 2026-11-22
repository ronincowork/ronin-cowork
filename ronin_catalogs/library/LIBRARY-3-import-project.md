# Mapping a project they brought in

This person has brought an existing project into their Workspace (its handle is in this epic's
comment "Workspace: <handle>"). Map it, show them the map, and tell them what you found. The tasks are this epic's
children (`item read` on this epic lists them); match each by its title, and work them in order.
Rules:
- Read; don't change their project. Nothing is moved, renamed, installed or committed.
- For each: `item read` the task, and find the steps where its Details point. Done: `item comment` on the task "Done: <what>", then `item transition` it to "Done".
- When all four are closed: `item transition` this epic to "Done".

## Map every surface the project has
Do: find each part of the project: its repositories, folders, services, docs, and how it is built, run and tested.
Details: `work-record workspace list` (its repositories and folders, each with its directory); the project's own README, docs and build files; `ronin-help workspaces`.
Check: every Location on the Workspace is on your map, each with what it is.

## Write PROJECT_MAP.md and hang it on the work surface
Do: write the map as PROJECT_MAP.md in the Workspace's main folder, and attach it to this epic so it shows in Docs.
Details: `item attach <this epic> <path>` (`item attach --help`); it shows in the tile's Docs and on the epic (`ronin-help tile`). In a repository, leave it uncommitted unless they ask.
Check: `item read` on this epic lists it under attachments.

## Make an HTML summary of the project
Do: make PROJECT_SUMMARY.html beside PROJECT_MAP.md: one page a person can read at a glance (what it is, its parts, how it runs), and attach it to this epic too.
Details: one self-contained file, no outside scripts; `item attach <this epic> <path>`; Docs opens it like the map (`ronin-help tile`).
Check: `item read` on this epic lists it, and it opens from Docs.

## Tell them what was found
Do: tell the person, in a few lines, what the project is and its main parts, and where the map and summary are.
Details: the Docs on your tile; `ronin-help work-record`.
Check: they have answered, or said it is fine.
