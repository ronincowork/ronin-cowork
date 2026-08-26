# Set up a Hetzner VM for Ronin

> Give this page to Claude Code, Codex, or another agent running on the computer you
> will use to reach Ronin. The agent may inspect and prepare, but the owner confirms the
> Hetzner purchase, account sign-ins, credentials, and any privileged action.

This guide ends with an ordinary user account and an agent running on a new VM. That
remote agent then follows [`docs/install.md`](install.md) to install Ronin. If you already
have a suitable laptop, home server, or VM, skip this page and use the install guide
directly.

## How to relay this setup

You are the guide and operator, not the owner. Work in short, visible turns:

1. Inspect the current state and explain the next choice in ordinary language.
2. Tell the owner exactly what they need to do in their browser or terminal.
3. Stop while they sign in, enter payment details, approve a purchase, choose a password,
   or authorize a device.
4. Ask for the resulting non-secret fact, or inspect it with their permission.
5. Verify that result before moving to the next step.

Never ask the owner to paste a password, private key, API token, recovery code, or payment
detail into chat. Never claim to have clicked, selected, purchased, authenticated, or
verified something you cannot observe. If you can use the browser on the owner's behalf,
keep the owner in control of every credential and consequential confirmation. When this
guide says “show the owner,” present the actual values you observed and wait for their
answer; silence is not approval.

## The standard Ronin VM

In **Hetzner Cloud Console**, use this selection:

| Console choice | Select |
|---|---|
| Product | **Hetzner Cloud** (not Robot, Web Hosting, or DNS) |
| Type | Leftmost **Shared · Cost-Optimized** column, then **x86 · CX43** |
| Capacity | **8 vCPU · 16 GB RAM · 160 GB local disk** |
| Location | An EU location with CX43 availability; choose the nearest inexpensive one |
| Image | Current **Ubuntu LTS** |
| Networking | Public IPv4 and IPv6 for first contact; **no Floating IP** |
| Volume | None |
| Private network | None; Tailscale supplies the private network later |
| SSH key | The owner's public key, **selected during server creation** |
| Cloud config | Empty |
| Placement group | None |
| Backups | Owner's choice; explain and show the live added cost |

CX43 is the supported selection, not merely a minimum. Agent inference normally happens
outside this VM; RAM is the useful constraint. Budget roughly 700 MB per live agent. A
16 GB box is a roughly-20-agent machine after leaving room for Ubuntu, Ronin, Node, tmux,
and services. Set Ronin's session maximum below the point where Linux's OOM killer would
choose an existing session to end.

Do not choose **Shared · Regular Performance** or **Dedicated · General Purpose**. Ronin
does not need dedicated CPU for its normal workload, and those are different, more
expensive product families even when a nearby row looks similar. Choose **x86**, not
Arm64: x86 is the path walked by Ronin's first third-party install and the conventional
compatibility choice for agent CLIs and bundled dependencies. Arm64 may work, but it is
not a silent substitute for the proved path.

Hetzner marks Cost-Optimized capacity as limited, and a location can temporarily show it
as unavailable. If CX43 is unavailable, check another suitable EU location or tell the
owner that capacity often reappears and try again later (an hour is a reasonable first
retry). Reload the server-creation page when checking again; Hetzner does not refresh plan
availability automatically on a page that is already open.

If the owner does not want to wait, the supported temporary bridge is **Shared · Regular
Performance · x86 · CPX22** (AMD, 2 vCPU, 4 GB RAM, 80 GB disk). Show its live price and
limits and get explicit approval. It is enough to establish the VM and a small Ronin
installation, but it is not the standard multi-agent capacity: keep the session maximum
low until the move.

When Cost-Optimized capacity returns, stop the VM as Hetzner requests and use **Rescale**
to move from CPX22 to **x86 CX43**. In the rescale dialog, choose to **keep the existing
80 GB disk**. The resulting CX43 has its normal 8 vCPU and 16 GB RAM but retains the 80 GB
disk; this preserves the ability to move back to a plan with an 80 GB disk. If the disk is
expanded to CX43's 160 GB, Hetzner cannot shrink it later, so plans with smaller disks stop
being available as downgrade targets.

The current target is **CX43**. `CX42` was the prior, now-deprecated generation and should
not be used as the instruction. Hetzner allows the CPX-to-CX rescale because both plans are
x86; an Arm64 CAX server cannot be rescaled into an x86 CX or CPX plan. Do not substitute
General Purpose, Arm64, or another size without showing the owner the live tradeoff first.

Hetzner changes availability and prices. Before purchase, show the owner the live CX43
row, region, hourly/monthly total, VAT treatment, IPv4 charge, and backup charge. If the
row no longer says 8 vCPU, 16 GB, and 160 GB, stop; do not silently substitute another
plan.

Tell the owner why this is the recommended box and ask whether they want this standard
selection before opening the purchase flow. Do not infer “yes” merely because they asked
for a VM.

## 1. Establish the local facts

Confirm that this is the owner's computer and identify its OS, user, and SSH public keys:

```bash
whoami
uname -a
find "$HOME/.ssh" -maxdepth 1 -type f -name '*.pub' -print 2>/dev/null
```

Never read, print, upload, or paste a private key. If the owner has no key, propose an
Ed25519 key and obtain approval before creating it:

```bash
ssh-keygen -t ed25519 -C "ronin-hetzner"
```

Show the owner the public-key filename and fingerprint:

```bash
ssh-keygen -lf "$HOME/.ssh/id_ed25519.pub"
```

The owner decides which existing key to use and may inspect its `.pub` file before adding
it to Hetzner.

## 2. Create the Hetzner project and server

1. Open [Hetzner Cloud Console](https://console.hetzner.cloud/), sign in, enable two-factor
   authentication, and create or choose a project.
2. Choose **Add server**, use the leftmost **Cost-Optimized** column, select **x86**, and
   fill in the rest of the standard selection above.
3. Add the chosen SSH **public** key and visibly select it for this server.
4. Choose an RFC-1123 hostname: letters, digits, and hyphens; no underscores or spaces.
5. Show the complete paid selection to the owner. The owner presses **Create & Buy Now**
   or explicitly authorizes that action.
6. Record the server name and assigned address. Do not copy a name, address, or server ID
   from an example.

The owner handles the Hetzner account, 2FA, billing profile, and final purchase control.
Relay the screen one decision at a time; do not ask them to hand you account credentials.
Immediately before creation, summarize the exact configuration and total price in one
message and ask for explicit confirmation.

The SSH-key step is not recoverable from the project screen after creation. Adding a key
to the Hetzner project later does **not** install it on an existing server.

## 3. Make first contact

Hetzner's stock image initially grants access as `root`. Verify the host fingerprint from
the provider console before accepting it, then connect with the chosen key:

```bash
ssh -i <private-key-path> root@<server-ip>
```

On the VM, prove the destination before changing it:

```bash
whoami
hostname
uname -a
```

If SSH asks for an unknown root password, stop trying passwords. The SSH key was probably
not selected at creation. `ssh-copy-id` cannot fix this without an already-working login,
and adding the key to the project does not retrofit the server.

Use one of these recovery paths with the owner's approval:

- For a brand-new empty server, delete and recreate it with the public key selected. Show
  the owner that billing for the old server stops only when it is deleted.
- In Hetzner Console, open the server's browser VNC console. Under **Rescue**, use **Reset
  Root Password**, log in as root through the console, and add the public key manually.
- If access was lost on a server with data, use Hetzner's Rescue System rather than
  rebuilding it. Rebuild erases the server.

## 4. Create the ordinary Ronin account

Root is bootstrap and recovery only. Ask the owner for the Unix account name, update the
base system, create that account, grant sudo, and copy root's authorized keys to it:

```bash
apt update
apt upgrade -y
adduser <account>
usermod -aG sudo <account>
install -d -m 700 -o <account> -g <account> /home/<account>/.ssh
install -m 600 -o <account> -g <account> /root/.ssh/authorized_keys /home/<account>/.ssh/authorized_keys
```

`adduser` asks the owner to set a password. Do not invent, retain, or repeat it. Keep the
first root connection open while testing a new terminal:

```bash
ssh -i <private-key-path> <account>@<server-ip>
whoami
sudo -v
```

Continue only after direct key login and sudo both work. All agent authentication, tmux
sessions, and Ronin files belong to this ordinary account—not root.

## 5. Establish private access

Install Tailscale on the owner's computer and the VM using the current
[official instructions](https://tailscale.com/kb/1347/installation). The owner signs both
devices into the same tailnet. Prove the route from the owner's computer before relying on
it:

```bash
tailscale status
tailscale ping <vm-tailnet-name-or-ip>
```

Do not open Ronin's application port to the public internet. Keep provider-console and
public-SSH recovery working until the owner has accepted the Tailscale path. Firewall
hardening comes after that proof, never before it.

## 6. Put an agent on the VM

While logged in as the ordinary account, install one agent CLI from its maintained
first-party instructions. The owner completes its authentication; credentials are not
copied from the local computer or installed under root. Prove that the CLI starts and can
act on this VM.

Give that remote agent this instruction:

> Open https://github.com/ronincowork/ronin-cowork/blob/master/docs/install.md and follow
> it on this machine. Install Ronin under this ordinary account, never expose its port
> publicly, and return the complete URL printed by setup.

The local provisioning agent stops changing the VM once the remote agent accepts. It stays
available only for Hetzner-console, SSH, or Tailscale recovery.

## Handoff checklist

Before handing the VM to the Ronin installer, report:

- Hetzner project and server name (never credentials);
- selected CX43 capacity and whether backups are enabled;
- Ubuntu version and hostname;
- ordinary account name;
- successful direct SSH and sudo checks;
- successful Tailscale reachability check;
- provider-console recovery location;
- agent CLI available on the VM.

Do not include private keys, passwords, authentication tokens, or copied `.env` files in
the handoff.

## Sources and field notes

This runbook incorporates Ronin's first third-party CX43 install and its SSH failure. The
provider details are backed by Hetzner's current documentation for
[creating a server](https://docs.hetzner.com/cloud/servers/getting-started/creating-a-server/),
[connecting over SSH](https://docs.hetzner.com/cloud/servers/getting-started/connecting-to-the-server/),
[console recovery](https://docs.hetzner.com/cloud/servers/getting-started/vnc-console/), and
[architecture and rescale constraints](https://docs.hetzner.com/cloud/servers/faq/).
