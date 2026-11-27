# New Team construction

For contributors. See [Start a Team](../using-ronin/new-team.md) for the owner journey.

`public/js/new-team-form.js` owns the form and draft. `new-team-draft.js` owns name
normalization; `new-team-check.js` checks proposed names against live sessions and each
other. `team-agents.js` converts the form's Agent rows to launch inputs;
`team-loader.js` launches them through the existing launch API.

The form (owner, 25 Nov) asks only what launching a Team needs, in four steps: 1 name, title,
objective and instructions; 2 the Workspace; 3 the Agents; 4 the Epic. It sets no defaults, no kind
and no behaviours: a Team inherits those from its Workspace and Campaign, and its Configuration on
the Team page changes one Team afterwards. The same form is Setup's Team step and every New Team.

- **Objective** is what the lead picks up and starts executing: it is said to the lead at birth,
  with its epic. **Instructions** are standing directions to every Agent in the Team: each member's
  brief carries them under its Team line (`ronin_stock/facts/team.md`, `agent.team_instructions`).
- **Workspace** is required: a Team is always dedicated to one. With one Workspace it is chosen.
- **Agents:** the draft starts with one row marked `team_lead`, named `<first word of the team
  name>_lead` (the first word ends at the first `-` or `_`); the name follows the Team name while it
  still reads as the previous name's lead, so an edited name stays, and the row is removed like any
  other. A row's harness, model and mandate stay blank unless picked ("The Team's"): blank is left
  out of the launch, so the Agent takes the Team's own, copied from its Workspace (`team-agents.js`
  `agentPicks`).
- **Epic:** one of the Workspace's open epics (held by `workspace:<name>`, not Done, not its Icebox),
  handed to the Team; or a new epic the Team holds, titled as written or by the Team's title.

On Launch it reserves a browser tab and validates Agent names before the first write. It creates
the Team through `POST /api/team-rosters`; only a successful create reaches the epic and the Agent
loader. That prevents a rejected duplicate Team create from launching another cast. Agent births
are awaited in order.

If some births fail, the Team and successful Agents remain. The form reports successes
and failures and opens the Team so the owner can recover there. On full success it clears
the draft and opens the Team. The form does not roll successful births back after a later
failure, and it does not promise a cross-request transaction.

The Team record owns identity, objective, instructions and Workspace; live session tags own membership and leads.
See [Team workspace](team-workspace.md) and the [state inventory](../state-inventory.md).
No retired Team-role catalog is required to create or staff a Team.

Shared form controls use [Workspace Kit](workspace-kit.md) and `ask()`.
`public/css/launch-forms.css` owns feature styling; it does not override Kit geometry.
