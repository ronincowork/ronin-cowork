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

## Ronin Services always runs

The owner, 2026-11-26 (KAN-857): Cowork and Ronin Services are one product, hosted or
self-hosted, and both always run. The Installations card and the Ronin Services on/off retire,
with `services-off` and every `when: !service:ronin_services` file. A behaviour or tool with
`when: service:<part>` is still in play while that part runs, so a part that fails to load is
not taught.

## Defaults

| Card | Holds | Reaches |
|---|---|---|
| **Agent defaults** | the models, mandate, launch mode and behaviours a new Team or Agent starts from | the next New Team form and a teamless Agent form; existing Teams are untouched |

## Integrations

Outside services a user brings (Jira, hosting, research, memory, any MCP server or web API).
Each is one record in this machine's Settings, set up, keyed and removed in Settings ›
Integrations; a Workspace only uses it. On is a cascading default that teaches, never a gate.
All of it: [integrations.md](integrations.md).

## What an Agent is told

Everything else here, what Agents are told and how it is chosen, is the brief: facts,
behaviours and tools at a depth, from the work record, with brief settings on each layer.
See [the brief](brief.md). Every installed tool is on every Cowork Agent's PATH; the brief
decides only what the Agent is told.
