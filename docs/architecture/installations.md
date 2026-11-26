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

The owner, 2026-11-26 (KAN-857, KAN-914): Cowork and Ronin Services ship together, as hosted
does now; self-hosted becomes the same bundle later (not a priority: hosted comes first). Cowork
still works without Services, but where Services is present **every part runs**: there is no
Services switch and no per-feature switch (Project management, Terminal transcript, Voice, Usage
stats, Machine status, Jira). A part that is present loads at start unless it parks itself
(`PARKED.md`) or fails to load. Retired with no replacement: the Installations card and Setup's
Installations step, the Ronin Services on/off and the six feature switches (`config.installations`,
`config.services.parts`), `ronin_stock/services/`, `services-off`, and the whole Services install
flow (the Services key from Ronin HQ, the download, the Services card and header badge). Jira acts
once it is connected in Settings › Integrations. A paid option such as voice may later be turned
on or off from the Business Lounge, never here. Hotwords is dropped.

A behaviour or tool with `when: service:<part>` is still in play while that part runs, so a part
that fails to load is not taught.

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
