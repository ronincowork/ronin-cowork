# Installations and behaviours — what a new Agent is equipped with

Ronin settles what is installed on the machine before it asks how one Agent should
behave. Machine facts stay off Team and Agent forms; behaviours are the one kind of
addition chosen there.

## Three session types

| Session type | What starts | What Ronin adds |
|---|---|---|
| Terminal | A shell, no Agent CLI. | Nothing. |
| Bare-metal Agent | The provider CLI directly in the tmux session. | Nothing: no reading, work record, desk, or receipt. |
| Cowork Agent | The provider CLI through the unified birth transaction. | Everything Ronin is on this box: identity, work record, base reading, commands, the birth receipt, and every enabled system installation. |

A Cowork Agent is one thing. There is no floor or base switch; bare metal is the way to
have none of Ronin.

## System settings: installations and defaults

| Card | Holds | Reaches |
|---|---|---|
| **Installations** | each installed component, on or off | the whole machine; never a Team or Agent question |
| **Defaults** | the behaviours a new Team starts from | the next New Team form and a teamless Agent form; existing Teams are untouched |

An installation definition (`ronin_stock/services/<name>.md`: Ronin Services, Ronin's
own) names the server parts it runs. What an Agent is told about it comes from the brief's
files: a behaviour or tool with `when: service:<part>` is in play while that part runs, and
`services-off` (`when: !service:ronin_services`) while Services is off. The installation itself
adds nothing to a brief.

An installation may require another. Unmet requirements grey it out and name the
requirement. Turning one off changes the next brief; server parts follow at Ronin restart.

## Integrations

Outside services a user brings (hosting, a tracker, research, memory) are not installations.
An integration is turned on for a Campaign, Workspace, Team or Agent and cascades below; on for
an Agent, its bridge behaviour and that behaviour's tools are in play. Keys are saved with
`secret` (Jira keeps its panel's `jira-<campaign>.json`). Settings › Integrations shows them in
one panel (`src/integrations.ts`): the bridges (behaviours with `when: integration:<name>`),
every MCP server record, and any name a Workspace uses that has neither, each with the
Workspaces using it, whether a Services part of its name runs, and the secrets saved for it
(names only). MCP servers are added, keyed, signed in, offered and removed there
([integrations.md](integrations.md#settings--integrations)). Jira shows its own panel inside it. How an Agent uses them: the Integrations behaviour and the bridges
([the brief](brief.md#integrations-and-bridges)).

## What an Agent is told

Everything else here, what Agents are told and how it is chosen, is the brief: facts,
behaviours and tools at a depth, from the work record, with brief settings on each layer.
See [the brief](brief.md). Every installed tool is on every Cowork Agent's PATH; the brief
decides only what the Agent is told.
