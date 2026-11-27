# Teams collection construction

For contributors. For navigation and Team creation, read [Workbench](../using-ronin/workbench.md)
and [New Team](../using-ronin/new-team.md).

The Teams workbench exists at `#/cowork`, rendered by
`createCoworkView({ kind: 'cowork' })` in `public/js/cowork-view.js`.

It uses the shared `workbench` format: the same workspaces, two/four shape,
discovery column, placement, drag/drop,
recall, sizing and lifecycle as `kind: 'team'`. Its selector exposes one Team roster,
Teams, New Team and New Agent. The roster is the detailed grouped Agent list formerly
shown on the Ronin Desk: role, work record chip, status, context, desk state and model stay aligned
in each row. Pressing an Agent opens it under its row, never launches it (KAN-964): its
Team's lead as one question that makes another member lead (`setTeamLead`), then its
configuration (`createAgentCompositionReader`); dropping an Agent on a Team heading adds that
membership through the canonical Teams API. The workbench first opens on the Team roster in
Workspace 1 and the Teams stones in Workspace 2.

Ronin Desk is not offered here; its card and shared workspace surface live in the Campaign
workbench at `#/campaign`.

Each Team heading has Launch and Delete actions instead of an Agent count. Launch opens
the existing `#/team/:name` workbench in a new browser tab. Delete uses the canonical Team
deletion API and always confirms first, including the number of Agents whose membership
will be removed. The unassigned Rōnin heading has neither action.

Team identity and membership are deliberately separate and singular: a durable roster
defines a Team; each Agent owns its validated list of Team names. A roster never stores
members, and there are no free-form Agent labels. Deleting a Team removes that name from
every Agent after a consequence warning; it is not blocked by active membership.

Every standalone non-channel surface uses Workspace Kit's shared surface header, whose
depth is the same `--row-head` as a terminal Tile and a Commons tab strip. Team detail,
New Agent, the Team roster and blank Workspace use the same frame.

There is no League destination or parallel workspace implementation. The legacy
`#/league-workspace` hash migrates to `#/cowork`.
