# Desks (stored as Campaigns)

A Desk is the engagement containing Teams, Agents, and work. It is not a Git worktree.
The Settings workbench separates Machine Settings (machine controls, password,
installed integrations, and model providers) from Desk Settings (Desk identity,
Team and Agent defaults, and Workspaces). This grouping changes presentation, not
storage or inheritance.

## Machine status

Settings' **Machine status** card is the one complete account of this office: what is set up,
what isn't and what is available. That covers the machine (hosted or self-hosted, Ronin's
version, disk), the people, every model provider (installed, signed in, Activated or off), the
GitHub CLI, onboarding's steps, each Workspace with its folders, repositories and Teams, every
integration, connected or not, Ronin Services' parts, the defaults new Agents get and, in a hosted
office, the Business Lounge account. Ronin gathers it from wherever each fact lives. **Write it
now** saves it to `~/ronin/library/MACHINE_STATUS.md`, and the card shows what was written and
when. Every Ronin's Settings has the card. Agents read the same text live with `office read`, and
write the file with `office write`.

Desks remain keyed Campaign records inside `machine_settings.json`. Each record has a stable id,
title, description, desk profile, resolved desk choices, state, creation timestamp, and
agent, Cowork, and template defaults.

`src/campaigns.ts` validates and normalizes Campaign values. It reads and writes through
`readMachineSettings()` and `writeMachineSettings()` and owns no file path.

The API surface is:

```text
GET    /api/campaigns
POST   /api/campaigns
GET    /api/campaigns/:id
PUT    /api/campaigns/:id
POST   /api/campaigns/:id/archive
```

Campaign ids contain lowercase letters, digits, hyphens, or underscores. Editing a
Campaign does not change its id. Archiving hides it from active lists and does not stop
sessions or delete records.

Teams, project roots, sessions, templates, and wipeboards carry `campaign_id` references.
The Campaign record does not embed those collections.

A Campaign holds **Workspaces**: projects, each with an objective, instructions, its
repositories and folders, and the Mode its Agents launch in. Every Team is launched in a
Workspace and its Agents inherit it; an Agent without a Team has no Workspace. See
[Workspaces](workspaces.md).
