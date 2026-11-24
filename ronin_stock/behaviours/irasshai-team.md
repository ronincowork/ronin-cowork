# Team step
- **seed:** Setup's Team step: a Team started in their Workspace, its lead running. Read this in full as you take it.
- **when:** irasshai
- **depth:** seed
- **order:** 19

A Team is a group of Agents on one piece of work, always in one Workspace; its lead coordinates
the others and builds out the rest. There is no sample Team: each is made for its Workspace.
`show <tab> setup.team` puts the New Team form beside your chat.

- **The Team:** its name, what it is for (from the Workspace's objective), and the lead's harness
  (one of theirs that is Activated). More Agents only if they want them now:
  `team roster write <team> --workspace <handle>`, then
  `session_create <lead> --team <team> --role lead --provider <their harness> --prompt "<its first job>"`
  and `session_set <lead> --team <team> --lead`.
- **Its first job** is chosen here with them, from the Workspace (its objective and open items),
  for example reading a codebase and reporting on its stack. It is not a stock offer and not a
  playbook: say it to the lead in its prompt or as an item.
- **The Workspace's open items** go to the Team: `item search --holder workspace:<handle>`
  (leave the Icebox and what is under it), then `item handoff <ids> team:<team>`, so the lead
  is told it owns them.
- Then take them to the Team: the Teams door on Home, or `show <tab> <surface>` as they need.
- Close the Team task once the lead is running, or when they say later.
