# 03 · VM OPTIONS — the supported Christmas Morning choice

> The supported Hetzner choice for a new Ronin VM.

## Standard path

Use **Hetzner Cloud → Cost-Optimized → x86 → CX43**.

This is the selection, not merely a minimum:

| Choice | Standard |
|---|---|
| Product | Hetzner Cloud — not Robot, web hosting or DNS |
| Category | **Cost-Optimized** |
| Architecture | **x86** |
| Server type | **CX43** |
| vCPU | **8** |
| RAM | **16 GB** |
| Disk | **160 GB local**, no extra volume |
| Traffic | **20 TB included** as shown in the console |
| Floating IP | **Off** — do not add one |
| Observed price | **€19.67/month**; show and confirm the live price before purchase |
| Region | choose for availability/cost; latency is not important for Ronin's CLI workload |
| Image | current supported Ubuntu LTS |
| Network | public IPv4 for Christmas-morning SSH; IPv6 may remain enabled |
| SSH | the owner's existing public key installed at creation |
| Hetzner private network | none required; Tailscale supplies the private overlay |
| Cloud-init | empty for the first proved path |
| Placement group | none for one VM |
| Labels | none required |

**Why this choice:** latency is not the constraint; agent inference happens outside the
box. Cost-Optimized buys the useful RAM cheaply. x86 is the conventional compatibility
path and makes a later move to a regular/general-purpose x86 class straightforward.

**The 16 GB is a session-capacity choice.** Budget roughly **700 MB per live agent**. At
that rate, 20 agents consume about 14 GB before the OS, Node, tmux, Ronin and services get
their share. Treat CX43 as a roughly-20-agent box with a safety boundary, not a 30-agent
box and never an unlimited one. When memory is exhausted, tmux does not queue the excess:
the kernel OOM killer ends a process, often taking out the largest, longest-lived agent
session. The failure is lost live work, not a slow launch.

Ronin has an owner-set `sessions.max` precisely to refuse a new agent before the kernel
chooses an existing one to kill. ATARASHI explains this budget and asks the owner to set
the cap; it never derives or silently writes the number from RAM.

Hetzner product names, capacities and prices can change. `rogue_1` begins with CX43, then
shows the live console row. If CX43 no longer exists or no longer carries 8 vCPU / 16 GB /
160 GB, stop and ask rather than silently choosing a different class.

A newly created CX43 receives the full 160 GB local disk. An older VM rescaled into CX43
may still show its earlier 80 GB disk because Hetzner permits keeping the old disk size so
the rescale remains downgradeable. If the virtual disk was enlarged but its partition was
not, Linux may also show only the old usable size until the partition and filesystem are
expanded. Measure `lsblk` and `df -h /` before deciding which case applies; never resize a
live filesystem from an assumption.

## Do not copy the existing machine's identity

The Hetzner screen also shows the existing server's ID, hostname, IPv4 and IPv6
allocation. Those identify that one VM; they are not purchase options. A new subscription
receives its own name, server ID and addresses from Hetzner. Never copy identity values
from the source setup log into a new VM workflow.

## Decisions the owner makes

Before purchase, `rogue_1` shows:

- current monthly/hourly price from the live console;
- **Cost-Optimized**, **x86**, **CX43** and the displayed 8 vCPU / 16 GB / 160 GB;
- Floating IP **Off** and no extra volume;
- selected region (latency is not a deciding constraint);
- current Ubuntu LTS image;
- confirmation that the selected live row still matches the exact choice above;
- whether backups are enabled;
- the exact SSH public key being installed;
- the VM name.

The_owner confirms the paid selection. The agent never completes the purchase silently.

## Account and login shape

The provider may initially grant root SSH. Root is bootstrap only.

Before installing Claude, Codex or Ronin:

1. create an ordinary Unix account chosen by the owner;
2. grant it sudo;
3. install the same SSH public key for that account;
4. verify a fresh SSH login directly as that account;
5. perform all remaining agent and Ronin work there.

Each account has its own home directory, PATH, CLI authentication, tmux server and Ronin
sessions. Installing a CLI as root does not install or authenticate it for the ordinary
account, and running Ronin as root would create the wrong machine boundary.

## Initial security posture

- SSH public-key authentication is the first-contact route.
- The provider console remains the break-glass route.
- Tailscale is installed on the VM after `rogue_2` starts and becomes the ordinary private
  route.
- Ronin's port is never opened publicly.
- Firewall restriction of public SSH happens only after tailnet access and provider-console
  recovery are both proved; do not lock out the owner mid-bootstrap.

## Deliberately not part of the standard choice

The source setup log also covers Syncthing, migration of the unified repo, personal naming,
specific addresses/device IDs and a temporary workbench. None belongs in first-run VM
selection. Backups are a real owner choice: they were disabled for that disposable
migration VM, which does not establish a permanent Ronin default.
