# Getting set up in your new office

Irasshai: this person has just moved into their office. Get them started, in this order as their project allows:
1. Your setup
2. Agent Harness
3. Workspace
4. Integrations
5. Ronin Tour
6. Meet your Agents
The tasks are this epic's children; match each by its title, and find its steps where its Details point. Setup lists them as its steps; a press on one asks you to take it.
- A task's Open names the Setup surface for it: open it with `show <tab> <surface>` (the tab is in your launch prompt) as you take the task.
- Each is an offer: "no" or "later" is fine. What is already done needs no redoing.
- Close each task as it is done or declined.
- Meet your Agents is the end: close any open tasks as declined, close this epic, then end yourself with `session_end` (it archives you); Mika takes over from there.

## Your setup
Do: before your first words, understand where they are (the person and their project, their account, and this office as the facts in your brief have it) and write it down in their record, `~/ronin/library/ABOUT_USER.md`: find its `## Where they are` section and update it, or make it new. For each Workspace with no summary yet, start a fresh Agent to write it, and don't wait for it: summaries arrive in the Workspaces fact as they are written. Then close this task; what you understood is what you start the conversation from.
Details: the facts your brief lists; per Workspace with no summary (`workspace-doc list`): `session_create <name>`, then `item checkout LIBRARY-2 <name>` and `item comment <its new epic> "Workspace: <handle>"`.
Check: ABOUT_USER.md has Where they are, as things stand.

## Agent Harness
Do: at least one Agent harness signed in with their own account; more is better.
Open: `setup.providers`.
Details: Setup → Model providers (Let the Helpful Assistant authenticate, Use the CLI with the Helpful Assistant); `ronin-help provider-sign-in`.
Check: at least one reads Activated.

## Workspace
Do: their first Workspace, on a folder or on one or more repositories; done when its subtasks are done or skipped.
Open: `setup.roots`.
Details: `ronin-help new-workspace`.
Check: the Workspace exists with its folder or repositories.

### Decide its kind and name, and write down the plan
Do: settle the Workspace's kind (one of new-workspace's types) and its name, and record what they're planning.
Details: `ronin-help new-workspace` (the types; the objective; WORKSPACE.md listed in its docs).
Check: the Workspace's objective says what they plan, and its WORKSPACE.md names the kind.

### Sign in GitHub, if they use it
Do: the GitHub CLI signed in to their account, if they use GitHub; skip it if not.
Details: the GitHub CLI stone on the Workspaces door (Let the Helpful Assistant connect GitHub, Use GitHub CLI with the Helpful Assistant); `ronin-help workspace-folders`.
Check: the stone shows their account.

### Bring in their folders or repositories
Do: their folders, or the repositories they clone, in the Workspace; skip it if there are none yet.
Details: `ronin-help new-workspace` (folders, clone a repository).
Check: the Workspace lists them.

### Start Team 1
Do: once the Workspace exists, its first Team's lead started in the background: given the import-project epic if they brought in an existing project, else left to make its own assessment.
Details: the Team with `team roster write <team> --workspace <handle>`, its lead with `session_create <lead> --team <team> --role lead`, then `item checkout LIBRARY-3 <lead>` and `item comment <its new epic> "Workspace: <handle>"`; `ronin-help new-workspace`.
Check: the lead is running in the Workspace, holding the import-project epic or doing its own assessment.

## Integrations
Do: the outside services their project uses, each added: a bridge Ronin has, turned on for the Campaign; an MCP server with `mcp add`; a web API with `api add`; anything else noted on the Workspace. Each signed in now (the key pasted, or Sign in) or left for later; skip it if they use none.
Open: `setup.integrations`.
Details: `ronin-help add-an-integration`; `mcp --help`, `api --help`; the integrations surface shows each as it is added, with its state; `ronin-help integrations`.
Check: each service they named is added or noted, signed in or left for later; or declined.

## Ronin Tour
Do: offer a tour of how Ronin works, and give it if they want it.
Details: `ronin-help get-started`.
Check: given, or declined.

### Behaviours
Do: show how behaviours shape what their Agents are told, and help them write one if they want; skip it if not.
Details: `ronin-help customizing`.
Check: shown, or declined.

### Project management
Do: show how work items let them see their Team's work, and how to give one out, if they want; skip it if not.
Details: `ronin-help project-management`, `ronin-help work-items`.
Check: shown, or declined.

## Meet your Agents
Do: show them Team 1 and take them to it; then close this epic and end yourself.
Details: the Teams door on Home; `show <tab-id> <surface>`; `session_end`.
Check: they are on Team 1's page.
