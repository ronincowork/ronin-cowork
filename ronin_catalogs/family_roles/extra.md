# extra

The seats that fit no other shelf: the escape hatch (`OddJob`), the install's own setup
seat (`Atarashi`), and the plain terminal (`OpenShell`).

It was one of the three shipped Job Group shelves before the schema cut, and it is the
same shelf now. **Every stock task is on a shelf, and that is deliberate**: an unshelved
task renders in a flat tail that cannot fold, and a default that cannot fold defeats the
shelves (owner, 2026-08-21, on seeing exactly that).

`extra` states the ordinary defaults its first two tasks share. `OpenShell` declares
`agent: none`, which voids every agent-only field inherited from here — a role sits BELOW
a task in the cascade, so its defaults are dropped in silence rather than refused. That
asymmetry is what lets an agentless task sit on an ordinary shelf
(`src/launch-profile.ts`).

Its reading is whatever the owner puts on this role's own level of the session-boot shelf.
The house ships none.

- **icon:** ▫
- **label:** Extra
- **order:** 30
- **session_tasks:** OddJob, Atarashi, OpenShell
- **blurb:** the odd job, the setup seat, and a plain terminal
- **ask:** what do you want done?
- **remit:** The seats that fit no other shelf
- **dial:** write
- **permissions:** default
- **ack:** yes
- **opening:** {prompt}
