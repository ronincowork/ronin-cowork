# Desks (stored as Campaigns)

A Desk is the engagement containing Teams, Agents, and work. It is not a Git worktree.
The Settings workbench separates Machine Settings (machine controls, password,
installed integrations, and model providers) from Desk Settings (Desk identity,
Team and Agent defaults, and Workspaces). This grouping changes presentation, not
storage or inheritance.

## Machine status

Settings' **Machine status** card is the one complete account of this office: what is set up,
what isn't and what is available. It is the office's facts in one: the people and the notes on
them, the machine (hosted or self-hosted, Ronin's version, disk, Ronin Services' parts), in a
hosted office the Business Lounge account, each Workspace, every model provider, GitHub and
integration, the Teams and Agents, the open epics (onboarding's progress is its epic) and the
defaults new Agents get. Each office-fact is a file in `~/ronin/office/facts/`, rewritten about a second
after what it reads changes; `~/ronin/office/MACHINE_STATUS.md` is all of them, kept current. The
card shows it as it is when opened, and when it was written. Every Ronin's Settings has the card.
Agents read the same files, or all of them with `office read`.

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
