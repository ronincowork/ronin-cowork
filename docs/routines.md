# Routines — what a new Agent is equipped with

A **Routine** is a named, switchable bundle of behaviours that work together: startup
reading, discoverable SOPs, macros, actions, command-line tools and MCP connections. A
Routine changes what a newly launched Agent is offered. Changing a switch never mutates
an Agent already running.

## The four levels

| Level | Meaning | Switchable |
|---|---|---|
| Routine floor | The launch machinery that resolves, delivers and records every Routine. | No |
| Ronin Base | Ronin's ordinary macros, documents, work records and session coordination. | Yes |
| Ronin Control | Managed repository desks, hand-in, team promotion, receipts and Git guards. | Yes |
| Specialized Routine | One optional capability or methodology: Machine, gbrain, Koshi, Ronin Koe, or a future third-party method. | Yes |

The **Routine floor** is not a Routine. It is the minimum needed to make any Routine
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

**Ronin Base** and **Ronin Control** are separate. A Team can use Ronin's normal macros
without acquiring repository worktrees. Repository arrangement states whether Ronin
Control's desk behaviour applies to a repository; it is not another Routine switch.

**Ronin Koe** is one specialized Routine containing Voice and Hotwords. Hotwords have no
independent use when Voice is unavailable, so there is no separate Hotwords Routine.

## Campaign defaults and Team overrides

The effective set for a birth is resolved in one direction:

```text
Campaign Routine defaults
            ↓
Team's explicit on/off overrides
            ↓
effective Routines for this Agent birth
```

An absent Team value inherits. An explicit `on` adds or preserves a Routine; an explicit
`off` removes it. A Team stores only its differences, never a copied Campaign list.
A Teamless Agent receives the Campaign answer.

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
to a connection; it is only one case and is not the general Routine switch.

## Four different facts

| Fact | Answers |
|---|---|
| enabled | Did Campaign/Team configuration select the Routine? |
| installed | Are its local/service parts present on this machine? |
| connected | Was an MCP or other live connection delivered? |
| applicable | Does the present repository/situation use this behaviour? |

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
