# team
- **seed:** create or read a Team's roster and what it holds
- **when:**
- **depth:** seed
- **serves:** team-lead
- **order:** 60

`team` is a Team's record: write or read its roster (objective, launch defaults) and read
what the Team and each member hold. New Team means `team roster write`. Membership and
lead come from sessions and change with `session_set`; giving an item to the Team is
`item handoff <id> team:<name>`; posting to it is `edges wipeboard`; listing Teams is
`edges team`.
