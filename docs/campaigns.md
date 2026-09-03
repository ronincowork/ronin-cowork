# Campaigns

Campaigns are keyed records inside `machine_settings.json`. Each record has a stable id,
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
