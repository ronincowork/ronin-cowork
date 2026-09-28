# Team Kanban

Team Kanban (the Task Manager) is the six-column view of a Team's work items: Idea, Plan,
Build, Review, Land, and Done. Open it from the Team Kanban card in the workspace selector
or the Kanban tab in Team Commons. Both surfaces render the Team's reading, which Team
Leads read with `team member status <team>`. Run `team --help` for the live surface.

The board is a reading, not another store. A work item is stored once, and a Team holds a
list of item ids; so does each Agent. The Team's reading is the items the Team holds plus
the items each of its members holds, each child listed after its parent where the lead
made any. A card shows who holds it: the Team (worked by its lead) or one Agent. An item
held by nobody and under no parent is unassigned and is not on any Team's board. See
[work records and projects](work-record.md) for the item's shape, stages, ladder, exit,
and status.

Team Kanban is available while Ronin Services and its Task manager component are enabled.
The `team project` and `work-record project` tools move the same items without Services.

## Land and Done are moved by receipts

Stage is a mark on the item, set by a tool, and every move is a line on the item's trail.
Two tools move it for you:

- An accepted `worktree-desk hand-in <repo> --project <id>` moves the item to Land, with
  the hand-in receipt on its trail.
- A completed Team promotion moves every item named on the hand-ins it carries to Done,
  with the promotion receipt on its trail.

Each of those acknowledgements ends by naming the item and the write that keeps its words
current. Nothing is derived at read time and nothing is blocked.

Dragging a card does not change the item. It sends one move request to the Agent that
holds it—or to the lead, for a Team-held item or a lead action—naming the command that
makes the move, and marks the request locally until the item's next read. Clicking an
Agent holder opens that Agent's tile in the workspace.

## Optional Trello adapter

Trello is an optional integration boundary, not the Team Kanban source of truth. An item
carries `external` ids for connected tools, and a connector reaches the same
`/api/work-items` routes as every tool: parent and child map to the tool's structure,
stage to its list or status, and holding to its assignee only where a Ronin Agent maps to
someone there. It must never store a second board in Ronin.
