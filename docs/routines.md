# Routines — what a new Agent is equipped with

A **Routine** is a named, switchable bundle of behaviours that work together: startup
reading, discoverable SOPs, macros, actions, command-line tools and MCP connections. A
Routine changes what a newly launched Agent is offered. Changing a switch never mutates
an Agent already running.

## Four ways to work

| Choice | Meaning | How it is chosen |
|---|---|---|
| Bare-metal Agent | A provider CLI in an always-on tmux terminal, with no Ronin reading, Library material, work record or Routines. | Choose the bare-metal launch. |
| Cowork floor | The minimum Cowork launch, identity and Routine-delivery machinery. | Choose a Cowork Agent rather than bare metal. |
| Ronin Base | Ronin's ordinary macros, documents, work records, messaging and session coordination. | Selectable Routine. |
| Managed file coordination | Managed worktrees, hand-in, lead integration, receipts and Git safeguards. | Selectable Routine. |

The **Cowork floor** is not a Routine. It is the minimum needed to make any Routine
choice real: unified Agent launch, Campaign and Team resolution, the universal vocabulary
and shelf map, Routine resolution, minimum command delivery, Control initialization and
the birth receipt. Ordinary working behaviours such as fork, tell and wipeboard belong to
Ronin Base rather than being made permanently available through the floor.

The floor is mandatory only for a **Cowork Agent**. Ronin offers three distinct launch
kinds:

| Kind | What starts | Ronin birth |
|---|---|---|
| Terminal | A shell, with no Agent CLI. | None |
| Bare-metal Agent | The selected CLI directly in the tmux session. | None |
| Cowork Agent | The selected CLI through the unified Agent birth transaction. | Routine floor, then resolved Routines |

A bare-metal Agent has a session name, working directory and inherited environment. It
does not receive Campaign or Team resolution, project root or role, a Ronin brief or shelf
reading, Routine resolution, Ronin-added MCP, a work record, a managed desk, or a managed-
birth receipt. Host-level tmux safety and the session maximum still apply because they
govern the machine rather than equip the Agent.

Bare metal is not “all Routines off.” A Cowork Agent with every switch off still receives
the Routine floor. Bare metal explicitly bypasses the Cowork birth transaction.

**Ronin Base** and **Managed file coordination** are separate switches, but delivery is
additive: selecting Managed file coordination also selects Ronin Base. A Team can use
Ronin Base without acquiring repository worktrees. Control does not require optional
Ronin Services. Repository arrangement states where managed worktree behaviour applies;
it is not another Routine switch.

**Specialized Routines** remain separately selected optional packages for one capability
or methodology: Machine, gbrain, Ronin Services, or a future third-party method. They add
to Ronin Base rather than creating partial replacements for it.

**Ronin Services** is one specialized Routine containing the durable session record,
Koshi, Voice and Hotwords. None is a standalone Routine or switch in this rollout.
Hotwords have no independent use when Voice is unavailable. Installing Services or seeing
one of its registered services proves availability only; it never selects the Routine.
Selecting Ronin Services additively includes Ronin Base.

## Campaign defaults and Team answers

The effective set for a birth is resolved in one direction:

```text
Campaign Routine defaults
            ↓
New Team form receives those values
            ↓ Save
Team's complete on/off map
            ↓
effective Routines for this Agent birth
```

A Team stores a complete map at Save. Its births read that map and never follow later
Campaign edits. An absent key in the selected complete map is off; an enabled Routine's
declared dependency may still add it as part of the additive progression. A Teamless
Agent receives the Campaign answer at birth.

The resolver keeps provenance, so a surface and birth receipt can say whether the answer
came from the Campaign or Team. It resolves once before the Agent process exists; the
same result feeds every delivery mechanism.

## One birth, several deliveries

For each enabled Routine, the unified birth transaction projects the manifest into the
places where its behaviours actually work:

- `routine/<name>/` startup reading is handed to the Agent;
- its macros and actions are offered and compile;
- its command tools are findable by bare name;
- its requested MCP connections are included when available;
- the receipt records what was enabled, why, and what was delivered.

The session boot shelf remains the reading mechanism, not the owner of Routine selection.
`<service>_connected/` remains the compatibility level for service-authored reading tied
to a connection; it is only one case and is not the general Routine switch. The first
cut explicitly retains the `gbrain_connected` level: gbrain's service authors and seeds that
connection reading, while the `gbrain` Routine selects its macros, tools and MCP request.

## Four different facts

| Fact | Answers |
|---|---|
| enabled | Did Campaign/Team configuration select the Routine? |
| installed | Are its local/service parts present on this machine? |
| connected | Was an MCP or other live connection delivered? |
| applicable | Does the present repository/situation use this behaviour? |

**And a fifth, which is not a Routine fact at all: whether the Agent holds a worktree.**
*Carrying `ronin_control` does not mean a worktree was mounted for you.* The Routine is a
reading list and a toolset — the desk contract, hand-in, team promotion, receipts and
`tejun-desk` — so that every Agent carrying it knows how worktrees are handled here. An
Agent under Ronin Control may hold none, and check one out when it needs one. An Agent
without the Routine may still be started in a worktree: that is isolation, which any agent
can arrange off a branch, and it needs nothing declared in `RONIN_REPO`. What it does not
get is the contract — no hand-in, nobody to hand to — so it reports to the owner instead.
All four combinations are legitimate, and a launch names them separately: the **Routine**
comes from the resolved Campaign/Team map, the **worktree** from the launch's own
`desk` choice.

These facts never stand in for one another. In particular, an enabled but unavailable
Routine **never blocks Agent birth**. The Agent opens normally; the unavailable behaviour
does not work, and the receipt and surfaces say it was not delivered.

## Catalog authority

Routine manifests live in `ronin_catalogs/routines/`, one Markdown definition per token.
The owner's catalog store shadows a stock definition whole. A manifest names existing
reading, SOPs, macros, actions, tools and MCP connections; Campaign and Team records hold
only on/off choices. Nothing about Routine membership is copied into those records.

The manifest is enablement rather than a security boundary. Off means Ronin does not
teach, offer or place a tool in the Agent's normal command lookup. It does not claim that
a determined process cannot reach an installed executable by an absolute path.
