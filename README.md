# Ronin — the two-repo setup

> **2026-08-13.** The first master README for the split. The full documentation set
> (user guide, architecture docs, vocabulary) migrates here from the original tree in
> a coming pass; until then, this page is the map of how the pieces fit.

Ronin is a browser grid for live tmux sessions: view and operate every agent session
on a machine from one tab — desktop or phone — instead of SSHing and attaching by
hand. xterm.js in the browser, a websocket bridge, node-pty and tmux on the host.

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
| **ronin-cowork** (this one) | the free build — sessions, tiles, Workbench, rosters, notes, wipeboards, Macros, the commons, launch, and **all frontend** | open repo; versioned releases |
| **ronin-services** | the optional paid layer — incremental capabilities installed beside Cowork | hosted, versioned archive |

**Cowork runs completely alone.** It compiles, boots, and serves a machine's tmux
sessions with no services present — that is not a degraded mode, it is the free
product. A service adds its capability when installed; its absence is never an error.

## How they work together: the connector

Cowork never imports service code. Instead it exposes **sockets** — fixed connection
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
tunnel is enough (`ssh -L 3006:127.0.0.1:3006 you@yourbox`, then open
`http://127.0.0.1:3006`). Never expose the port publicly.

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
The tmux server runs in its own unit and owns the sessions — restarting or replacing
Ronin never touches running work. `bin/ronin-byoin` runs every check and gives one
verdict; `bin/ronin-uninstall` reverses the install and leaves your own files behind.

## License

Ronin Cowork is **Apache-2.0** (see `LICENSE` and `NOTICE`) — use it, fork it, ship
it, commercially or not, with Apache's patent grant behind it. **Ronin services are
licensed differently**: source-available, free to download and use, but not to
redistribute or commercialise — each services archive carries its own LICENSE, and
those terms are the archive's, not this repo's.
