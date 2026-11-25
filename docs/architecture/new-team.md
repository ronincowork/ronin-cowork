# New Team construction

For contributors. See [Start a Team](../using-ronin/new-team.md) for the owner journey.

`public/js/new-team-form.js` owns the form and draft. `new-team-draft.js` owns name
normalization; `new-team-check.js` checks proposed names against live sessions and each
other. `team-agents.js` converts the form's Agent rows to launch inputs;
`team-loader.js` launches them through the existing launch API.

The form reads Campaign defaults, then lets the owner edit the Team and its
Agents. The draft starts with one Agent row marked `team_lead`, named `<first word of the
team name>_lead` (the first word ends at the first `-` or `_`); the name follows the Team name
while it still reads as the previous name's lead, so an edited name stays, and the row is
removed like any other. Its provider and model stay blank, which for a lead is the Team lead
model on Models > Defaults. Clearing the form seeds the lead again. The Workspace stones (Born in, Workspaces) sit in section 2 under
the name and instructions, not inside the Agent defaults fold: the roster and its lead are read
against a named Workspace (owner, 2026-10-21). On Launch it reserves a browser tab and validates Agent names before the first
write. It creates the Team through `POST /api/team-rosters`; only a successful create
reaches the Agent loader. That prevents a rejected duplicate Team create from launching
another cast. Agent births are awaited in order.

If some births fail, the Team and successful Agents remain. The form reports successes
and failures and opens the Team so the owner can recover there. On full success it clears
the draft and opens the Team. The form does not roll successful births back after a later
failure, and it does not promise a cross-request transaction.

The Team record owns identity and defaults; live session tags own membership and leads.
See [Team workspace](team-workspace.md) and the [state inventory](../state-inventory.md).
No retired Team-role catalog is required to create or staff a Team.

Shared form controls use [Workspace Kit](workspace-kit.md) and `ask()`.
`public/css/launch-forms.css` owns feature styling; it does not override Kit geometry.
