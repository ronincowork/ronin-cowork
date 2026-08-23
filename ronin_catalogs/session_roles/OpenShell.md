# OpenShell

**`agent: none`** — opens a session and launches nothing, leaving the tile at a shell
prompt with nothing typed into it.

Every field that describes an agent is **absent** rather than filled with a polite blank:
no `model` (no session_launch_spec is resolved), no `posture`, no `opening`, no `ack`,
no `permissions` (that is a CLI's permission mode, and there is no CLI). What it carries
is the mechanical constants that still mean something for a terminal.

`dial: user` 👤 is the other constant it exists to fix — the dial says who OTHER than the
owner may touch a session, and a terminal the owner opened for their own hands is the one
session no outside agent should type into or even read.

Loose by design: it launches with a blank `role_family`.

- **icon:** ❯
- **label:** open shell
- **order:** 100
- **blurb:** a terminal and nothing else — no agent is launched
- **ask:** name it and say where it opens
- **remit:** A plain terminal for the owner's own hands — no agent, no brief
- **agent:** none
- **match:** —
- **dial:** user
- **lifecycle:** none
