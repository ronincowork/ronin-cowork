# gbrain — working the brain, when this machine has one

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `gbrain.md`) replaces
> this file whole — a default, not law.
> **Ruled onto the stock shelf by the owner, 2026-08-16.** gbrain itself is third-party —
> Garry Tan's, MIT, github.com/garrytan/gbrain — and optional: an install without it loses
> nothing here but the subject. `docs/gbrain.md` says what it is; this SOP says how the
> house works with one.

## The shape on this machine

| piece | where | owner |
|---|---|---|
| the knowledge | a git repo of markdown — the system of record | the_owner |
| the database + config | gbrain's own directory (PGLite unless migrated) | the gbrain service |
| the server | `gbrain serve --http` on localhost — the ONLY door to the database; while it runs, gbrain CLI commands against the same brain are refused (lockfile, by design) | the gbrain service |
| the reach | each agent CLI's own MCP config, registered once at user scope | the gbrain service |

**Work through the MCP tools, never the CLI, whenever the server is up.** A lockfile
refusal is the single-writer design holding, not a fault to work around — the hunt for the
CLI has already cost one session a turn, and its debrief says so.

## The toggle (＋ New: gbrain on / off)

Per session, chosen at launch, mechanical like the dial. **On** (default): the CLI launches
with its own config — the brain and any other MCP connectors are reachable. **Off**: the
session launches with **no MCP servers at all** — not just the brain. It cannot be flipped
mid-session; that is a relaunch. An agent never proposes off on its own initiative — only
when the owner's words asked for it.

## What you may do with the brain

- **Query freely** (`search`, `think`). Retrieval is what it is for. Keyless installs are
  keyword-only — exact tokens land, concept questions under-return, and gbrain marks its
  own responses degraded; say so rather than presenting thin results as the whole truth.
- **Capture judiciously.** What you write is readable by **every session with the brain
  on** — there is no per-session partition (a per-page `visibility` knob exists; use it
  for local-only facts). Never capture a secret, a credential, or another session's
  unpublished work. When in doubt, don't; TEGAMI is the place for your own working state.
- **The brain is not OBOERU.** A lesson about how to work in this house goes through
  `tejun-remember` (axis-matched, guaranteed recall at birth). The brain is world
  knowledge — people, projects, meetings, facts. Different stores, different jobs.

## Getting content in — integrations (email, calendar, voice, …)

**The knowledge is gbrain's; the execution is an agent's; the authorization is the
owner's.** gbrain ships recipes in its own repo (`gbrain integrations` lists them and
their status). A recipe is markdown an agent reads and performs: it asks the owner for
keys, validates them, configures, smoke-tests. The house rules over that procedure:

1. **Name the doors before opening one.** Before running a recipe, tell the owner every
   external hostname it will make this machine talk to. The owner approves doors, not
   bundles.
2. **Secrets follow `secrets.md`.** Keys live in gbrain's own config or the environment —
   never in a repo, a catalog, a launch command, or the brain itself.
3. **One integration per confirmation.** Propose, show what will change, wait for the yes,
   run, report the smoke-test result. A refusal is an answer.
4. **ngrok is special: it is an inbound door** — a public URL into this machine. It is
   never part of "setting up email"; it is its own proposal with its own yes.
5. **A hosted embedding provider is a door too** — it receives every page at index time
   and every query at search time. Local embeddings (Ollama / llama.cpp) add no egress
   and are the house default when semantic search is wanted.

## When the brain is down

Tools vanish or error; the session keeps working. Say "the brain is unreachable" and carry
on without it — an outage is an "I don't know", never a stop. Do not restart the server
yourself; report it (the service owns the unit).

## Not covered here, deliberately

Installing gbrain and its auth (the gbrain service's installer and doctor), migrating
PGLite → Postgres, and the recipes' own contents — gbrain's repo, read live, never copied.
