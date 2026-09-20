# Desks (stored as Campaigns)

A Desk is the engagement containing Teams, Agents, and work. It is not a Git worktree.
The Settings workbench separates Machine Settings (machine controls, password,
installed integrations, and model providers) from Desk Settings (Desk identity,
Team and Agent defaults, and Workspaces). This grouping changes presentation, not
storage or inheritance.

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
