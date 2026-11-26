# New Workspace
- **seed:** Set up a Workspace from one project type and the variants that apply: `ronin-help new-workspace`.
- **when:**
- **depth:** none
- **lists:** workspace_types
- **order:** 13

Setting up a Workspace with someone: first what the project is, then where it lives, then its
repositories, with GitHub only if they are private. From what they tell you, pick the one type
that fits (not sure: Blank), then ask only the variants that apply, one at a time. Build it from
their answers with `workspace` (`workspace --help`):
- What it is: the Workspace's objective, in their words, the one place that says so
  (`workspace create "<name>" --objective "<text>"`).
- Where it lives: its folders and repositories (`workspace add <handle> <folder|git-url>`), or on
  the Workspace page (Workspaces door → New Workspace; `ronin-help workspaces`).
- Standing directions to its Agents: its instructions (`workspace instructions <handle> "<text>"`).

The types and variants follow, one file each in `workspace_types/`; a file of the person's own
in `~/ronin/workspace_types/` adds one or replaces one by name.
