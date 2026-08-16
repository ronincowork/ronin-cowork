# Ronin — the two-repo setup

> **2026-08-13.** The first master README for the split. The full documentation set
> (user guide, architecture docs, vocabulary) migrates here from the original tree in
> a coming pass; until then, this page is the map of how the pieces fit.

Ronin is a browser grid for live tmux sessions: view and operate every agent session
on a machine from one tab — desktop or phone — instead of SSHing and attaching by
hand. xterm.js in the browser, a websocket bridge, node-pty and tmux on the host.

## The two repos

| Repo | What it is | Ships as |
|---|---|---|
| **ronin-cowork** (this one) | the free build — the whole co-working space: sessions, tiles, the grid, dials, groups, notes, wipeboards, macros, the commons, the launcher, and **all frontend** | open repo; versioned releases |
| **ronin-services** | the paid layer — one folder per service: **michi** (the session ladder), **rireki** (the session record and the unlocked tape view), **counting** (usage stats), **koshi** (the house agent), **koe** (dictation vocabulary; voice) | a hosted, versioned archive installed beside cowork |

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

## Installing it

**Hand `docs/install.md` to Claude or Codex on the target machine and say go** — it
walks every scenario (new VM, existing server, laptop) from nothing to a coworkspace
in the browser, installing the released cowork and the services layer on the way.

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
