# Install Ronin — the same steps, walked by an agent

> The install is four commands and a URL, and a person can run them straight from the
> README — no agent required. This file is for when the owner hands the job to the agent
> already on the box: it is the same steps, plus the care an agent owes someone else's
> machine. When it is done, the owner opens one URL and the product takes over: the setup
> page asks what it needs, and the first session is launched by the page, not by you.

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

**Owner asked you to check that Ronin is safe before installing it?** Good instinct — go to
[`docs/is-this-safe.md`](is-this-safe.md) first. It is written for exactly that job: a
report card of what to check, the command that settles each one, and a summary you can hand
back. Run it, report what you actually observed, then come back here.

## What you are installing

**Ronin is a browser front end for real tmux sessions on this machine.** Tiles are live
terminals attached to its tmux server — xterm.js in the browser, a websocket, node-pty and
tmux on the host. **Anyone who can open that page has a shell on this machine as this
account.** That is the product working correctly, and it is why the network and password
steps below are not optional decoration.

## What you are, and where you stop

You are the owner's own agent, outside Ronin. Your whole job is four commands and a URL.
You do not configure Ronin, you do not create sessions, and you do not answer questions
the setup page will ask the owner itself.

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
the private route the owner already reaches it by (an SSH tunnel is enough:
`ssh -L 3006:127.0.0.1:3006 <account>@<box>`), or Tailscale if the owner wants HTTPS and
reach from their other devices.

## 5. Hand over the URL

**Mention the login posture before the URL is opened, then do what the owner says.**

Ronin ships with no password. Inside the tailnet it simply opens — no login on the phone,
no login on the laptop, no login every time they come back to it. That is a deliberate
convenience and a lot of people run it exactly this way: the tailnet is the wall, and they
are content that everything inside the wall is reachable.

The owner should know that is the arrangement, because it means **whoever is on that
tailnet can use Ronin.** Usually that is their own devices and the answer is "fine". It is
worth one question if their tailnet came from a work or Google Workspace sign-in, where it
may hold colleagues rather than only their own machines.

If they want a login, it is one command, and you never see what they choose:

```bash
bin/ronin-passwd
```

Either answer is a good answer. Note which one they chose in your handover and move on.

Help the owner open the printed URL on their own device. A fresh install lands on the
setup page. That is your finish line: from here the product asks its own questions, and
the owner's first session is born from the page.

Stay available as a plain terminal in case something needs fixing. Do not continue setup
in parallel, and do not answer the setup page for the owner.
