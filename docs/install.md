# Install Ronin — the same steps, walked by an agent

> A person can run the install command without an Agent. This file is for when the owner
> hands the journey to an Agent already on the box: preserve the machine, establish the
> private URL, help through Ronin Setup, establish one provider, and prove one harmless
> Agent exchange. The owner keeps every consequential and credential-bearing choice.

The machine is one the owner already has and controls: a laptop, a home server, a VM they
rent. If they do not have a machine yet, start at [`docs/rent-a-machine.md`](rent-a-machine.md)
and come back here.

## The short version, so you can stop worrying about the obvious things

Scan this before you read anything else. **These are all handled** — you do not need to
solve them, work around them, or warn the owner about them.

| The thing you are about to wonder about | The answer |
|---|---|
| **Ronin runs a tmux server** | Ronin joins the default tmux server already on the box. Existing sessions stay running. If none exists, a separate `systemd --user` unit starts it outside the operator's cgroup. Setup leases the server-wide `exit-empty` option to `off` and uninstall restores the value it found. |
| **Why is `tmux-server.service` `active (exited)`?** | Handled: setup adopted the existing server, so the unit correctly did not start another. `bin/ronin-doctor` reports the adopted server as a note. |
| **`systemd --user` dies at logout on a headless box** | Handled in step 3. `bin/ronin-doctor` confirms `ok — linger is on — the coworkspace survives logout`. |
| **Tailscale ordering matters** | Handled in step 3: setup records the address from `tailscale ip -4`. Doctor confirms `ok — auth is off, but the bind is this machine's tailnet address` when that is the chosen posture. |
| **Is the download what it claims to be?** | Handled: `SHA256SUMS` proves the downloaded bytes match the release manifest and mismatches stop installation. It is not a signature and cannot prove who published both files; release signing is planned. |
| **Does any of this need root?** | The app, no. Only `enable-linger` and optional `tailscale serve`, both printed for the owner rather than run for them. |
| **Is the port exposed?** | It binds to the tailnet or loopback, and **refuses to boot** on a public address with auth off. |
| **Is it password-protected?** | Not by default, deliberately; the closing setup frame states the posture. `bin/ronin-passwd` adds a login if the owner wants one; see step 5. |
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
account.** That is the product working correctly, and it is why the network and password
steps below are not optional decoration.

## What you are, and where you stop

You are the owner's own Agent, outside Ronin. Installation is complete when the operator
and the tmux server's cgroup boundary survive, the owner can reach the private URL with a known
login posture, Ronin Setup is reachable, one provider is usable, and one new Agent answers
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

**What you should see:** linger is `yes` on a headless Linux box, and either
`tailscale ip -4` prints the agreed private address or the owner has deliberately chosen
loopback. On macOS, linger does not apply.

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
Record the complete result; do not turn a warning or SKIP into a pass, and do not turn a
SKIP into a failure. A SKIP names what could not run, why, and what evidence stands in.

**What you should see:** setup names whether it started or adopted the default tmux
server, reports every outside-the-home change or refusal, starts the operator, and prints
the agreed private URL. With no headless browser, the journal says the render check was
skipped because boot and version are the proof; it does not call the UI broken.

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
port=$(sed -n 's/^PORT=//p' .env | tail -1); port=${port:-3006}
listener_pid=$(ss -ltnp | sed -n "s/.*:$port .*pid=\([0-9]*\),.*/\1/p" | head -1)
cat "/proc/$listener_pid/cgroup"
```

`MainPID` is the npm wrapper, not the listener. The socket holder's cgroup must end in
`ronin.service`; that proves the process answering on port 3006 belongs to the unit without
depending on its process-tree shape. If process details are hidden, no PID is found, the
cgroup is unreadable, or more than one interpretation remains, report the listener as
**unknown** rather than assigning another Node process to Ronin. Record warnings and skips
as such. Confirm existing ordinary tmux sessions still exist, the reported URL answers from
the owner's device, and the listening address matches the agreed loopback or tailnet route.
Do not turn configuration intent into evidence about the running process.

**Expected first-install state:**

- an existing default tmux server is adopted outside any Ronin unit;
- `tmux-server.service` may read `active (exited)` after adoption because it did not start
  or take ownership of that server;
- the pane that ran setup predates the service and its current PATH may therefore be old;
- `current/.env` is a symlink, while its target is owner-only mode `600`;
- `bin/ronin-doctor` exits non-zero only when it prints a `FIND`; notes and skips do not
  make a healthy install fail.

**What you should see:** doctor reports the `.env` target as mode `600`, adoption as a
note, and exits 0 when there are no real findings. Both units are healthy, the prior tmux
sessions remain, the private URL answers, and the socket holder's cgroup ends in
`ronin.service` or is explicitly recorded as `unknown`.

## 6. Continue through first use

Help the owner open the printed URL on their own device. A fresh install opens Ronin Home;
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
Checks passed: <doctor, units, listener/private route, existing tmux sessions, first Agent>
Matched expected first-install state: <items from the list above>
Deviated from expected: <exact observation and safe next action, or none>
Not tested: <checks not actually exercised>
Login posture: <tailnet-only or password enabled>
```
