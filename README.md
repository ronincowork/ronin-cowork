# Ronin

Ronin is not another IDE for your Agents. It is a lightweight, locally run coworkspace
around the Agents, accounts, tools, and documents you already use.

Claude and Codex can run side by side, each in its own worktree. Ronin gives their live
terminal sessions one browser surface on a machine you control; you choose how independently
or closely they work through the Routines you opt into.

If Ronin looks cool to you, [give us a star](https://github.com/ronincowork/ronin-cowork)—it
helps other people find it.

## Work side by side

<a href="https://ronincowork.com/explainers/workbench/">
  <picture>
    <source media="(max-width: 600px)" srcset="docs/assets/readme/workbench/workbench-narrow.webp">
    <img src="docs/assets/readme/workbench/workbench-desktop.webp" alt="Ronin Workbench with Claude and Codex side by side in separate workspaces, each showing a task in its own disposable paper-garden worktree.">
  </picture>
</a>

[See how two independent Agent providers work side by side in the Workbench.](https://ronincowork.com/explainers/workbench/)

## Coordination without control. A coworkspace without lock-in.

**Your Agents. Your tools. Your working method.**

Ronin is a lightweight coworkspace, not an Agent harness or prompt engine. It does not
sit between you and your model providers, store your work in a proprietary format, or
prescribe how an Agent should behave. It adds optional coordination around the tools and
files you already use.

| Promise | What it means |
|---|---|
| **[Your work stays yours](https://ronincowork.com/explainers/no-platform-lock-in/)** | Your code and documents stay on your machine, in ordinary repositories and files. Ronin does not become a data intermediary or proprietary home for them—so there is no platform lock-in. |
| **[No behavioral takeover](https://ronincowork.com/explainers/no-behavioral-takeover/)** | Ronin gives Agents convenient tools at the edges of cooperation. It does not become their prompt engine or prescribe how they reason, code, or complete their work. |
| **[Editable coordination](https://ronincowork.com/explainers/editable-coordination/)** | Select and customize the reading, SOPs, Macros, Actions, tools, and connections offered to new Agents. Owner versions live outside the repositories Ronin updates. |

Ronin does not relay your Agent traffic or upload your code and conversations to a Ronin
cloud. Your provider CLI still communicates directly with its model provider, whose data
terms and zero-data-retention options remain the ones that govern that traffic. If you
separately opt into Ronin Services, you may share anonymous operating measurements—never
your code or conversations. Declining sends nothing.

## Coordinate when useful

Agents can remain independent or use optional Team coordination. Direct messages, the team
wipeboard, shared documents, and selected Routines support closer work without turning a
working convention into an access-control boundary.

```text
independent Agent ── choose what helps ── Team coordination
                         │
                 messages · wipeboard · shared work
```

[See how optional Agent coordination works.](https://ronincowork.com/explainers/agent-coordination/)

## Choose how much coordination you want

| Choice | What it adds |
|---|---|
| **Bare Agent** | Claude, Codex, or another provider CLI in an always-on tmux terminal. No Ronin reading list, Library material, work record, or Routines. |
| **Cowork floor** *(optional first layer)* | Add the minimal Cowork launch, session identity, and machinery needed to use any Routines you choose. |
| **Ronin Base** *(optional Routine)* | Add ordinary Macros, documents, work records, messaging, and session coordination. |
| **Ronin Worktrees** *(optional Routine)* | Add separate worktrees, hand-in, lead integration, receipts, and Git safeguards that help parallel Agents avoid file collisions. Works when both the repository and the Agent have Worktrees on; work then follows the managed hand-in and Team-lead merge path ([how it decides](docs/worktrees.md)). |
| **Services** *(separate axis)* | Additional installed capabilities; availability remains separate from which coordination choices are enabled. |

[See how the four coordination choices and additional Services fit together.](https://ronincowork.com/explainers/cowork-and-services/)

## Start with your question

| I want to… | Start here |
|---|---|
| understand the shell, network, and data boundaries | [How Ronin protects your machine and work](docs/how-ronin-protects-you.md) |
| decide whether I need another machine | [Choose or rent a machine](docs/rent-a-machine.md) |
| have an Agent install Ronin | [Agent-led installation](docs/install.md) |
| finish `cowork_setup` and start one working Agent | [Get started](docs/get-started.md) |
| sign in an Agent provider safely | [Provider sign-in](docs/provider-sign-in.md) |
| find use, troubleshooting, or contributor guidance | [Documentation by question](docs/README.md) |

## The two repos

| Repo | What it is | Ships as |
|---|---|---|
| **ronin-cowork** (this one) | the open package — sessions, tiles, Workbench, rosters, notes, wipeboards, Macros, the commons, launch, and **all frontend** | open repo; versioned releases |
| **ronin-services** | the optional paid layer — incremental capabilities installed beside the open `ronin-cowork` package | hosted, versioned archive |

**The open package runs completely alone.** It compiles, boots, and serves a machine's tmux
sessions with no Services present—that is not a degraded mode. A Service adds its
capability when installed; its absence is never an error.

## How they work together: the connector

Core code never imports Service code. Instead it exposes **sockets**—fixed connection
points that no-op when empty — and each service ships one `register(sockets)` entry
that plugs in at boot:

- **boot** — a service runs its own timers and janitors, stopped at shutdown
- **launch** — services hear "a session was born" and act (seed a ladder, arm a tape)
- **row** — services contribute fields to the session roster
- **routes** — services mount their own HTTP surface; absent means those paths 404
  and the matching UI panels sit inert

The contract crossing the repo boundary is two files, versioned together: the typed
shape (`src/sockets-contract.ts` here, a copy in ronin-services) and the written
meaning (`connector-contract.md` in ronin-services) — the second is the one humans
edit, and it wins any argument the type names start. A breaking change bumps
`CONTRACT_V` and lands in both repos in the same breath.

The one place cowork names a service is a single assembler block in `src/index.ts` —
empty in this repo. Installing services fills it; a gate (`scripts/check-kyokai.mjs`)
enforces that no other core file ever reaches across the line.

**Every door into Ronin is drawn on one page:** `docs/api-surface.html` — cowork's own
routes and its two websockets, the endpoints each service mounts through the ROUTES
socket, the eight sockets themselves, and the bash shelf agents actually type at.

## Installing it

On a machine you control — your laptop, a home server, or a VM you rent. **No machine
yet?** [`docs/rent-a-machine.md`](docs/rent-a-machine.md) walks an agent through renting
one: what capacity Ronin needs, and why you want it physically near you. **Want to check
this before you run it?** [How Ronin protects your machine and work](docs/how-ronin-protects-you.md)
is written for the Agent you ask to assess it—it names evidence rather than asking for trust.

Two doors, same Ronin; pick one:

**Door 1 — the one command.** For a person with a terminal and nothing else: the
release bundles its own Node, tmux, and node_modules, so this works on a box with
nothing installed and never asks you for anything
(`docs/DEPENDENCY_BUNDLE_INSTALL.md`):

```bash
curl -fsSL https://raw.githubusercontent.com/ronincowork/ronin-cowork/master/scripts/get-ronin | sh
```

On Windows: run `wsl --install` once in PowerShell, then run that same command
inside the WSL shell.

**Door 2 — the git path.** For an agent, or anyone who wants to read what they run.
Hand your agent this repository's URL; `docs/install.md` is its walk. From a
checkout it can install the bundled release, or a plain one and bring its own tmux
and Node:

```bash
git clone https://github.com/ronincowork/ronin-cowork.git
cd ronin-cowork
bin/ronin-update --home ~/ronin      # fetches the release, verifies, unpacks
cd ~/ronin/current && ./setup.sh     # sets everything up on this machine
```

Either door reaches the same installed state: `setup.sh` **prints the URL it is serving
on** and, on a local Linux desktop, opens it. A fresh install enters `cowork_setup`.
[Get started](docs/get-started.md) continues through the visible form, one provider, and
one harmless successful Agent exchange. An installed Agent CLI is not proof that its
provider is authenticated.

If the box is remote, reach the URL over the private route you already use — an SSH
tunnel is enough. The box-side end of the forward is the address Ronin bound, which
`setup.sh` printed: the tailnet IP unless `.env` sets `BIND`. With that address,
`ssh -L 3006:<it>:3006 you@yourbox` puts Ronin on `http://127.0.0.1:3006` on your own
machine. Never expose the port publicly.

Already have an Agent on that machine (Claude Code or Codex)? Hand it `docs/install.md`;
the Agent stays through first-use proof. Using an Agent is optional, not a requirement.

## Finding work in the coworkspace

Campaign, Cowork, and Team use one Workbench format. [`docs/workbench.md`](docs/workbench.md)
is the third-party Agent's guide to its discovery column, workspaces, surfaces, placement,
and recall. It explains how to find and arrange work without requiring frontend or design
system knowledge.

## Running it (contributors, from a checkout)

```bash
./setup.sh     # installs deps, the tmux server unit, the cowork unit; the service
               # checks its own rendered page on every start
```

Requires a Unix-like host (Linux, macOS, WSL) with tmux; the browser client is any OS.
Ronin joins the default tmux server, beside whatever sessions already live there; when no
server exists, Ronin starts one in its own unit. Restarting or replacing Ronin never touches
running work. `npm run byoin` runs the user-customization check and gives one
verdict; `bin/ronin-uninstall` reverses the install and leaves your own files behind.

## License

The open `ronin-cowork` package is **Apache-2.0** (see `LICENSE` and `NOTICE`)—use it,
fork it, ship it, commercially or not, with Apache's patent grant behind it. **Services are
licensed differently**: source-available, free to download and use, but not to
redistribute or commercialize—each Services archive carries its own LICENSE, and
those terms are the archive's, not this repo's.
