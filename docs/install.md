# Install Ronin — the same steps, walked by an agent

> The install is four commands and a URL, and a person can run them straight from the
> README — no agent required. This file is for when the owner hands the job to the agent
> already on the box: it is the same steps, plus the care an agent owes someone else's
> machine. When it is done, the owner opens one URL and the product takes over: the setup
> page asks what it needs, and the first session is launched by the page, not by you.

The machine is one the owner already has and controls: a laptop, a home server, a VM they
rent. If they do not have a machine yet, this is not the document — a provisioned path is
a separate product and is not written here.

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

## 3. Set up and serve

`setup.sh` requires tmux and Node. If either is absent, say exactly which one and propose
the ordinary installation for this OS; install with the owner's approval only. Then:

```bash
cd <install-home>/current && ./setup.sh
```

It installs the units and starts the operator, and prints the URL it is serving on.
Record the complete result; do not turn a warning or SKIP into a pass.

Never expose Ronin's port publicly. Loopback is enough on a laptop; on a remote box use
the private route the owner already reaches it by (an SSH tunnel is enough:
`ssh -L 3006:127.0.0.1:3006 <account>@<box>`), or Tailscale if the owner wants HTTPS and
reach from their other devices.

## 4. Hand over the URL

Help the owner open the printed URL on their own device. A fresh install lands on the
setup page. That is your finish line: from here the product asks its own questions, and
the owner's first session is born from the page.

Stay available as a plain terminal in case something needs fixing. Do not continue setup
in parallel, and do not answer the setup page for the owner.
