# Campaign scope

Every Campaign-scoped record carries a `campaign_id`. Team rosters, project roots,
sessions, templates, and wipeboards select by that id. An empty filter selects all
Campaigns.

`src/campaign-scope.ts` validates relationships and supplies selectors for these records.
Campaign values live under `campaigns` in `machine_settings.json` and are accessed through
the machine-configuration read and write operations.

Archiving a Campaign changes only the Campaign state. Referenced records remain available
and running sessions continue.
