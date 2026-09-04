# Install Ronin — the same steps, walked by an agent

> A person can run the install command without an Agent. This file is for when the owner
> hands the journey to an Agent already on the box: preserve the machine, establish the
> private URL, help through `cowork_setup`, establish one provider, and prove one harmless
> Agent exchange. The owner keeps every consequential and credential-bearing choice.

The machine is one the owner already has and controls: a laptop, a home server, a VM they
rent. If they do not have a machine yet, start at [`docs/rent-a-machine.md`](rent-a-machine.md)
and come back here.

## The short version, so you can stop worrying about the obvious things

Scan this before you read anything else. **These are all handled** — you do not need to
solve them, work around them, or warn the owner about them.

| The thing you are about to wonder about | The answer |
|---|---|
| **Ronin runs a tmux server** | Yes — its own, in its own `systemd --user` unit. Tmux work already on this box lives in a different server and is never touched. |
| **`systemd --user` dies at logout on a headless box** | Known. Step 3 enables linger before it can bite. |
| **Tailscale ordering matters** | Yes — setup reads `tailscale ip -4` to pick its bind. Step 3 puts Tailscale first. |
| **Is the download what it claims to be?** | Checksums are published and verified; the installer aborts on mismatch. Step 2. |
| **Does any of this need root?** | The app, no. Only `enable-linger` and optional `tailscale serve`, both printed for the owner rather than run for them. |
| **Is the port exposed?** | It binds to the tailnet or loopback, and **refuses to boot** on a public address with auth off. |
| **Is it password-protected?** | Not by default, deliberately — inside the tailnet there is no login to get past. Many owners want exactly that. If this one would rather have a login, `bin/ronin-passwd`. See step 5. |
| **Can this be removed?** | `bin/ronin-uninstall` reverses it and leaves the owner's own files behind. |
| **Node, tmux, dependencies** | A bundled release carries its own. Nothing to install, nothing to ask the owner for. |

**Owner asked you to assess Ronin before installing it?** Start with
[How Ronin protects your machine and work](how-ronin-protects-you.md). It provides a
read-only evidence report and an optional assessment scaffold. Report what you observe,
including `unknown`, then return here if the owner chooses to proceed.

## What you are installing

**Ronin is a browser front end for real tmux sessions on this machine.** Tiles are live
terminals attached to its tmux server — xterm.js in the browser, a websocket, node-pty and
tmux on the host. **Anyone who can open that page has a shell on this machine as this
account.** That is the product working correctly, and it is why the network and password
steps below are not optional decoration.

## What you are, and where you stop

You are the owner's own Agent, outside Ronin. Installation is complete when the operator
and its separate tmux server survive, the owner can reach the private URL with a known
login posture, `cowork_setup` is saved, one provider is usable, and one new Agent answers
a harmless prompt. You explain and verify; the owner answers setup choices and performs
login, billing, privilege, and credential-bearing actions.

Preserve the box. Never end an existing tmux session or restart an existing tmux server.
Ask the owner before any privileged, destructive or credential-bearing act.

## 1. Confirm the box

```bash
whoami
pwd
uname -a
tmux list-sessions 2>&1 || true
```

Confirm with the owner that this is the machine and account Ronin should live under, and
note whether tmux work already exists — it must survive everything below.

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

## 3. Make the machine ready

Two conditions that are cheap to satisfy now and confusing to diagnose later. Check both
even if the owner says the machine is ready.

**Linger — or Ronin dies when the owner logs out.** Ronin's units are `systemd --user`
units. On a headless machine (a rented VM, a home server nobody sits at) the user's
service manager stops when their last session ends, so Ronin stops when the SSH connection
closes. On a desktop the owner is logged in anyway and it rarely bites.

```bash
loginctl show-user "$USER" --property=Linger --value    # yes, or it needs enabling
sudo loginctl enable-linger "$USER"                     # owner approves — this is sudo
```

`setup.sh` detects this and prints the command, and `bin/ronin-doctor` reports it as a
fault. Doing it here means the owner never meets the symptom.

**Tailscale, if it is being used, must be up and signed in before `setup.sh` runs.** Setup
reads `tailscale ip -4` to decide what address to bind to. Tailscale absent at that moment
means Ronin binds to loopback, and reaching it needs an SSH tunnel until somebody
reconfigures and restarts it. Installing Tailscale afterwards does not retro-fit the bind.

```bash
tailscale ip -4        # an address here, before you run setup
```

If the owner is not using Tailscale, that is a fine answer — loopback plus an SSH tunnel
works. Establish which it is now, not after.

## 4. Set up and serve

A bundled release (it has a vendor directory — every release from the dependency bundle
on, see `docs/DEPENDENCY_BUNDLE_INSTALL.md`) carries its own tmux, Node, and node_modules:
nothing to check, nothing to install, and no dependency to name at the owner. Only an
UNBUNDLED tree (a git checkout, or a release predating the bundle) requires tmux and Node
from the box — there, if either is absent, say exactly which one and propose the ordinary
installation for this OS; install with the owner's approval only. Then:

```bash
cd <install-home>/current && ./setup.sh
```

It installs the units and starts the operator, and prints the URL it is serving on.
Record the complete result; do not turn a warning or SKIP into a pass.

Never expose Ronin's port publicly. Loopback is enough on a laptop; on a remote box use
the private route the owner already reaches it by, or Tailscale if the owner wants HTTPS
and reach from their other devices. An SSH tunnel is enough, and the box-side end of the
forward is the address Ronin bound — the tailnet IP that `setup.sh` printed, unless
`.env` sets `BIND`: `ssh -L 3006:<that address>:3006 <account>@<box>`.

## 5. Verify the running install

**Mention the login posture before the URL is opened, then do what the owner says.**

Ronin ships with no password. Inside the tailnet it simply opens — no login on the phone,
no login on the laptop, no login every time they come back to it. That is a deliberate
convenience and a lot of people run it exactly this way: the tailnet is the wall, and they
are content that everything inside the wall is reachable.

The owner should know that is the arrangement, because it means **whoever the tailnet and
its access rules permit to reach Ronin can use it.** Usually that is their own devices and
the answer is "fine". It is worth checking the tailnet identity and access rules when it
came from a work or Google Workspace sign-in, where permitted reach may include colleagues
rather than only the owner's machines.

If they want a login, it is one command, and you never see what they choose:

```bash
bin/ronin-passwd
```

Either answer is a good answer. Note which one they chose in your handover and move on.

Before opening the URL, preserve evidence that the installed copy is the one answering:

```bash
bin/ronin-doctor
systemctl --user --no-pager status tmux-server ronin
ronin_pid=$(systemctl --user show ronin.service --property MainPID --value)
ss -ltnp | grep "pid=$ronin_pid,"
```

The unit PID must be nonzero, and the socket row must identify that PID. If process details
are hidden, no row matches, or more than one interpretation remains, report the listener as
**unknown** rather than assigning another Node process to Ronin. Record warnings and skips
as such. Confirm existing ordinary tmux sessions still exist, the reported URL answers from
the owner's device, and the correlated listening address matches the agreed loopback or
tailnet route. Do not turn configuration intent into evidence about the running process.

## 6. Continue through first use

Help the owner open the printed URL on their own device. A fresh install enters
`cowork_setup`. Continue with [Get started](get-started.md): prepare the owner for the
visible choices, let them Save, establish one provider using
[Provider sign-in](provider-sign-in.md), and prove one harmless Agent exchange.

Stay available as a plain terminal for diagnosis. Do not fill the form in parallel, answer
provider dialogs, or infer success from an installed CLI or a launched process. Hand off
only after the Agent visibly responds, or report the exact blocking state and safe next
action.
