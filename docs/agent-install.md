# Agent install — how Ronin puts an agent CLI on the box

code is `src/agent-install.ts`, the commands are `src/agents.ts`, and the PATH half is
`setup.sh`.

**It is an operation**, not a service and not a surface: one dispatcher the setup page
calls at Save and ⚙ calls any day after. There is no third path, and a second one would
be a defect.

## The one source

`src/agents.ts` carries every agent's install line as `get`. The operation, the setup page
and ⚙ all read that one field, so changing a command is one line and every surface
follows.

An **empty `get` means Ronin cannot install it**, and `parked` is the sentence saying why,
written for the person reading the row. The row then has no tick, the operation refuses
the item with that same sentence, and the choke calls it `owner` rather than `mechanical`
— so nothing can announce an install the operation would refuse. Hermes is parked today:
its vendor script needs system packages it has to ask for, and does not finish without
them.

## Where an installed agent lands

**`~/.local`** — the standard user-level npm prefix. Not the release's bundled Node:
`bin/ronin-update` unpacks each release beside the last and swaps a symlink, so anything
under a release directory would vanish at the next update with nothing on screen to say
why. `~/.local` also needs no root, and is already where some agents' own installers put
themselves.

It is deliberately **not a store** — the table and its one rule are `src/resources.ts`. A
store is Ronin's own working state and an uninstall deletes it; an agent Ronin installed
is the owner's tool, and an uninstall leaves it alone.

**Visibility is the other half, and without it an install never happened.** The agent probe
asks a login shell, because a login shell's PATH is the PATH a tile gets — so `setup.sh`
appends that bin directory to PATH in the rc files it already writes, and creates it.
Appended, never prepended: the owner's own copy of an agent wins over one Ronin fetched. A
bundled box also gets the vendored Node's bin directory, or every npm-installed agent dies
on its own `#!/usr/bin/env node`.

## The door

    POST /api/install     { items: [{ kind, name }] }

`kind` is the registry's own verb (`docs/wanted-needed.md`), so the day a second kind
becomes mechanical it is one branch in the operation and no change at any caller. Today
only `agent` is; anything else is refused out loud rather than quietly dropped.

It answers with what it **started**, never with what it achieved — a session per item, and
a per-item outcome. 200 even when every item is refused: a refusal is an answer, it is per
item, and the caller reads the list either way.

## One session per item, and the tile is the window

Each install runs in its own tmux session named for the agent, created through the same
`createSession()` and `runCommand()` that `POST /api/launch` uses — no process management
is invented here. So the work shows in a real tile like all work in Ronin:

- **the exact command is on screen**, because the screen is the terminal it runs in. A
  vendor installer is somebody else's code, and being able to read the line first is the
  mitigation;
- **on success the same session starts the agent**, so its first-run sign-in appears in the
  tile the person was already watching. Install then sign-in, one seat, and no progress UI
  to build or maintain;
- **`&&`, not `;`** — a failure stops at the shell prompt under the vendor's own message,
  with nothing else blocked;
- concurrency is free, because sessions are parallel by nature.

## Done is measured, never claimed

Nothing here reports success. `listAgentAvailability()` does, later, when someone next
reads the record — the runner's exit code is not the finish line. A failed item simply
stays on the needed list, because met items do not exist, so **asking again is the retry**;
the stale session from the last attempt is killed rather than left to collide with its own
name.

## The surfaces

- **cowork_setup** (`public/js/cowork-setup.js`) — an absent agent's tick is live and the row
  says what pressing it does, command included. A present agent's tick is fixed: a fact,
  not a control. At Save the want is written first, so a failed install stays on the needed
  list, and the dispatch follows.
- **The landing** — Save exits through the `?tiles=` directive naming the install sessions,
  so the person lands watching them (`docs/tile-control.md`).
- **⚙ Configuration** — the same rows any day, the same operation, the same session.

## Proving a command still works

    npm run check:agent-installs

Runs each `get` line against a throwaway npm prefix and asks whether the agent's command
exists **inside that prefix**, with the throwaway bin directory as the only thing on PATH —
so a copy already on this machine can never answer for a line that does not work. It
uninstalls nothing and writes nothing outside the temporary directory it removes.

Deliberately **not in `npm run verify`**: it reaches the network and costs tens of seconds
per agent, and a gate that needs the internet turns a broken wire into a broken build. Run
it when a `get` line changes, and before cutting a release that carries one.
