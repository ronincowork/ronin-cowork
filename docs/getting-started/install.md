# Install Ronin — the same steps, walked by an agent

> A person can run the install command without an Agent. This file is for when the owner
> hands the journey to an Agent already on the box: preserve the machine, establish the
> browser address, help through Ronin Setup, establish one provider, and prove one harmless
> Agent exchange. The owner keeps every consequential and credential-bearing choice.

The machine is one the owner already has and controls: a laptop, a home server, a VM they
rent. If they do not have a machine yet, start at [`docs/getting-started/rent-a-machine.md`](rent-a-machine.md)
and come back here.

## The short version, so you can stop worrying about the obvious things

Scan this before you read anything else. **These are all handled** — you do not need to
solve them, work around them, or warn the owner about them.

| The thing you are about to wonder about | The answer |
|---|---|
| **Ronin runs a tmux server** | Ronin joins the default tmux server already on the box. Existing sessions stay running. On Linux, if none exists, a separate `systemd --user` unit starts it outside the operator's cgroup. Setup leases the server-wide `exit-empty` option to `off` and uninstall restores the value it found. |
| **Do I start tmux before `setup.sh`?** | No. Setup measures whether a server is on the default socket and never asks: it joins one that exists, and otherwise starts Ronin's own. On Linux, `tmux-server.service` gives it its own cgroup. A server started by hand first is only adopted as somebody else's, outside the unit. |
| **Why is `tmux-server.service` `active (exited)`?** | Handled: setup adopted the existing server, so the unit correctly did not start another. `bin/ronin-doctor` reports the adopted server as a note. |
| **`systemd --user` dies at logout on a headless box** | Handled in step 3. `bin/ronin-doctor` confirms `ok — linger is on — the coworkspace survives logout`. |
| **No swap on a cloud VM** | Handled in step 3. On a first install, setup explains the outstanding machine changes, asks once, and creates an offerable swapfile through one sudo authorization. `bin/ronin-doctor` reports `NO SWAP` until it exists. |
| **Do I need Tailscale?** | Only for access from other devices. Bring it installed and signed in; setup can then add a verified private HTTPS address. Local use works without it. |
| **Is the download what it claims to be?** | Handled: `SHA256SUMS` proves the downloaded bytes match the release manifest and mismatches stop installation. It is not a signature and cannot prove who published both files; release signing is planned. |
| **Does any of this need root?** | The app, no. A first install asks once before using sudo for outstanding Linux linger, optional Tailscale HTTPS, and an offerable swapfile. Root never runs the Ronin application. |
| **Is the port exposed?** | A standard install binds to loopback. When configured, Tailscale owns the additional private HTTPS listener and its access policy. |
| **Which address do I use?** | Local HTTP works on the computer running Ronin. When printed, Tailscale HTTPS also works from other authorized tailnet devices. |
| **Why does `current/.env` look mode 777?** | Handled: `current/.env` is a symlink; its target is owner-only. `stat -L -c %a current/.env` (Linux) or `stat -L -f %Lp current/.env` (Mac) reads `600`. |
| **Does setup edit Claude Code settings?** | Handled: it adds `statusLine` for the context gauge and changes only an unset/default `dark`/`light` theme to `dark-ansi` so the pane follows Ronin; other choices stay untouched. Uninstall removes its own unchanged `statusLine`, preserves all other keys, and leaves the theme choice in place. |
| **Why is `bin/shim` first on PATH?** | Handled: new shells use a short script you can read in one screen with `ls bin/shim && cat bin/shim/tmux`. It passes every command to the real tmux and refuses only `kill-server`, which would end every session. |
| **Why does the journal say `fatal: not a git repository`?** | Known cosmetic output: an installed release directory is not a checkout. Confirm the serving release with `/api/version`; do not treat this line alone as a failed install. |
| **Can old journal entries coexist with a clean filesystem?** | Yes: uninstall removes Ronin's files and units, while the user journal retains history. `FIRST install on this home` describes the selected install home, not the lifetime of the box. |
| **Can this be removed?** | `bin/ronin-uninstall` reverses it and leaves the owner's own files behind. |
| **Node, tmux, dependencies** | A bundled release carries its own. Nothing to install, nothing to ask the owner for. |

**Owner asked you to assess Ronin before installing it?** Start with
[How Ronin protects your machine and work](how-ronin-protects-you.md). It provides a
read-only evidence report and an optional assessment scaffold. Report what you observe,
including `unknown`, then return here if the owner chooses to proceed.

## What you are installing

**Ronin is a browser front end for real tmux sessions on this machine.** Tiles are live
terminals attached to the default tmux server — xterm.js in the browser, a websocket, node-pty and
tmux on the host. **Anyone who can open that page has a shell on this machine as this
account.** A standard install keeps the backend on loopback. Tailscale HTTPS, when
available, supplies access from other authorized devices.

## What you are, and where you stop

You are the owner's own Agent, outside Ronin. Installation is complete when the operator
is running, existing tmux work survives, the owner can reach the appropriate printed
address, Ronin Setup is reachable, one provider is usable, and one new Agent answers
a harmless prompt. You explain and verify; the owner makes their choices and performs
login, billing, privilege, and credential-bearing actions.

Preserve the box. Never end an existing tmux session or restart an existing tmux server.
Ask the owner before any privileged, destructive or credential-bearing act.

## 1. Confirm the box

```bash
whoami
pwd
uname -a
tmux list-sessions 2>&1 || true
# Linux only:
journalctl --user -u ronin.service --no-pager -n 20
```

Confirm with the owner that this is the machine and account Ronin should live under, and
note whether tmux work already exists — it must survive everything below.

**What you should see:** the intended account and machine, plus either the existing tmux
sessions or tmux's honest "no server running" answer. Old Ronin journal entries with no
remaining files mean a prior uninstall cleaned up; they do not turn this home into an update.

When it does exist, setup reports that Ronin is joining that server. Tmux copy mode is pane
state, so an owner attached to the same session can see copy mode while a tile is scrolled;
their own key bindings remain theirs. Ronin suppresses ordinary tile typing while the pane is
scrolled so it cannot trigger those bindings. The release's newer tmux client may talk to an
older distro server; setup reports the adopted version rather than pretending it started it.

## 2. Obtain the release

Ronin runs as an installed, versioned release — never as a checkout serving directly. A
small bootstrap checkout supplies the updater:

```bash
git clone https://github.com/ronincowork/ronin-cowork.git
cd ronin-cowork
```

If a checkout already exists, enter it; do not discard local changes or replace it.

Ask the owner to approve an install home (a directory the releases will live under — do
not guess a location in their home tree), then:

```bash
bin/ronin-update --home <install-home>
```

The updater fetches the latest release, verifies its checksum, unpacks it under
`<install-home>/releases/`, and points `<install-home>/current` at it.

**What you should see:** a verified release under `releases/`, with `current` pointing to
it. A first install says `FIRST install on this home`; an update names the old and new
release. A checksum refusal is a failure, not a warning.

## 3. Make the machine ready

Linux service persistence and swap are handled during setup. Tailscale is optional
for local use on either platform.

**Linux linger — or Ronin dies when the owner logs out.** Ronin's Linux units are `systemd --user`
units. On a headless machine (a rented VM, a home server nobody sits at) the user's
service manager stops when their last session ends, so Ronin stops when the SSH connection
closes. On a desktop the owner is logged in anyway and it rarely bites.

The one-line installer detects this before activating Ronin, explains it with the other
outstanding machine settings, and asks once before using sudo. `bin/ronin-doctor` reports
it as a fault until it is enabled. Once enabled it survives reboots.

**Tailscale provides access from other devices.** If the owner wants that access,
they install Tailscale and sign in before setup. Ronin keeps its backend on loopback,
configures Serve, and prints `https://<full-machine-name>:4810` when verified. Without
Tailscale or a working HTTPS route, setup still provides local HTTP access on the
computer running Ronin.

**Swap — or the kernel kills a session when memory fills.** Cloud images (Google Cloud,
AWS, DigitalOcean, Hetzner) ship with no swap. Ronin runs several agents at once, each
doing real work; with no swap the kernel has no overflow when RAM fills, so it picks a
process and kills it, and it chooses which — usually the agent session with the most in
it. Swap turns that sudden death into slowness. On Linux, when there is none:

The one-line installer detects whether swap is absent, offers a persistent 4 GB swapfile as
one of its explained machine changes, and performs it through the same single sudo
authorization. `bin/ronin-doctor` reports `NO SWAP` until swap exists. Inside a container,
swap is the host's business and the installer does not offer to create it.

**What you should see:** linger is `yes` on a headless Linux box and `swapon --show`
prints a line when swap was accepted. With Tailscale in use, `tailscale ip -4` prints
the machine's private address. On macOS, Linux linger and swap setup do not apply.

## 4. Set up and serve

A bundled release (it has a vendor directory — every release from the dependency bundle
on, see `docs/development/DEPENDENCY_BUNDLE_INSTALL.md`) carries its own tmux, Node, and node_modules:
nothing to check, nothing to install, and no dependency to name at the owner. Only an
UNBUNDLED tree (a git checkout, or a release predating the bundle) requires tmux and Node
from the box — there, if either is absent, say exactly which one and propose the ordinary
installation for this OS; install with the owner's approval only. Then:

```bash
cd <install-home>/current && ./setup.sh
```

It installs and starts the operator, then prints clearly labeled, copyable browser
addresses and the next browser step. Detailed machine changes and checks stay in the named install report
rather than filling the terminal result. It
measures whether a tmux server is already on the default socket and never asks: one that
exists is joined, and when there is none setup starts Ronin's own (through
`tmux-server.service` on Linux), so
there is no "start tmux first" step and adding one only hands setup a server to adopt.
On a fresh install it selects port `4810`; if another process already owns that address,
it selects and records `3776` instead. An existing `.env` is the owner's configuration:
setup never changes its `PORT`, and refuses a collision with instructions to edit it.
Record the complete result; do not turn a warning or SKIP into a pass, and do not turn a
SKIP into a failure. A SKIP names what could not run, why, and what evidence stands in.

**What you should see:** setup names whether it started or adopted the default tmux
server, reports every outside-the-home change or refusal, starts the operator, and prints
the verified Tailscale HTTPS URL when available. macOS also prints the local HTTP URL. With no headless browser, the journal says the render check was
skipped because boot and version are the proof; it does not call the UI broken.

On macOS, setup writes, loads, and starts the per-user LaunchAgent automatically.
It uses the GUI domain when available, otherwise the user domain for an SSH install.
There is no laptop/server question. A per-user agent does not promise service before
login after a reboot.

A standard macOS install also prints **Local HTTP — on this computer only**:
`http://127.0.0.1:<backend-port>`. If the backend port is `3776`, the local URL uses
`3776`. Opening this address on another computer reaches that other computer, not Ronin.

When available, setup also prints **Tailscale HTTPS — on this or another authorized
tailnet device**: `https://<full-machine-name>:4810`. Tailscale Serve proxies to the
selected backend port, so the HTTPS port stays `4810`. Either address can be used on
the computer running Ronin.

## 5. Verify the running install

Confirm the owner can open the appropriate printed address from their intended device,
then continue into Machine Settings.

Run `bin/ronin-doctor` on either platform. On Linux, preserve evidence that the
installed copy is the one answering:

```bash
bin/ronin-doctor
systemctl --user --no-pager status tmux-server ronin
port=$(sed -n 's/^PORT=//p' .env | tail -1); port=${port:-4810}
listener_pid=$(ss -ltnp | sed -n "s/.*:$port .*pid=\([0-9]*\),.*/\1/p" | head -1)
cat "/proc/$listener_pid/cgroup"
```

`MainPID` is the npm wrapper, not the listener. The socket holder's cgroup must end in
`ronin.service`; that proves the process answering on the selected port belongs to the unit without
depending on its process-tree shape. If process details are hidden, no PID is found, the
cgroup is unreadable, or more than one interpretation remains, report the listener as
**unknown** rather than assigning another Node process to Ronin. Record warnings and skips
as such. Confirm existing ordinary tmux sessions still exist, the reported URL answers from
the owner's device, and the backend listener remains on loopback.
Do not turn configuration intent into evidence about the running process.

**Expected first-install state:**

- an existing default tmux server is adopted outside any Ronin unit;
- on Linux, `tmux-server.service` may read `active (exited)` after adoption because it did not start
  or take ownership of that server;
- the pane that ran setup predates the service and its current PATH may therefore be old;
- `current/.env` is a symlink, while its target is owner-only mode `600`;
- `bin/ronin-doctor` exits non-zero only when it prints a `FIND`; notes and skips do not
  make a healthy install fail.

**What you should see:** doctor reports the `.env` target as mode `600`, adoption as a
note, and exits 0 when there are no real findings. The platform service is healthy, prior
tmux sessions remain, and the intended browser address answers. On Linux, the socket
holder's cgroup ends in `ronin.service` or is explicitly recorded as `unknown`.

## 6. Continue through first use

Help the owner open the appropriate printed URL on their own device. A fresh install opens Ronin Home;
Machine Settings opens Ronin Setup. Continue with [Get started](get-started.md): establish
one provider using
[Provider sign-in](provider-sign-in.md), and prove one harmless Agent exchange.

Stay available as a plain terminal for diagnosis. Do not answer
provider dialogs, or infer success from an installed CLI or a launched process. Hand off
only after the Agent visibly responds, or report the exact blocking state and safe next
action.

**What you should see:** Ronin Setup opens, one provider is usable, and a newly created
Agent visibly answers one harmless prompt. Anything not exercised stays "not tested."

Use this handover template:

```text
Installed: <release and install home>
Changed outside the install home: <each disclosed path/unit/lease, or none>
Checks passed: <doctor, platform service, loopback backend, any HTTPS route, existing tmux sessions, first Agent>
Matched expected first-install state: <items from the list above>
Deviated from expected: <exact observation and safe next action, or none>
Not tested: <checks not actually exercised>
Access: <local HTTP on this computer; verified Tailscale HTTPS if available>
```
