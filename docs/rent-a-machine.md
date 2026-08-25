# Rent a machine for Ronin

> Give this page to Claude Code, Codex, or another agent running on the computer you will
> use to reach Ronin. The agent may inspect and prepare, but the owner confirms the
> purchase, account sign-ins, credentials, and any privileged action.

**Read this only if you do not already have a machine.** Ronin runs on a laptop, a home
server, a spare desktop, or a rented VM — anything Unix-like you control. If you have one,
skip straight to [`docs/install.md`](install.md).

This page ends with an ordinary user account and an agent running on a new machine. That
agent then follows the install guide.

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
guide says "show the owner," present the actual values you observed and wait for their
answer; silence is not approval.

## What Ronin needs

Two requirements, in this order. Both are about the owner, not about any provider.

### 1. Capacity

| | |
|---|---|
| **RAM** | **16 GB.** This is the number that matters. |
| **vCPU** | 8, or whatever comes with 16 GB on the plan you choose. |
| **Disk** | 60 GB is workable; 160 GB is comfortable. |
| **OS** | Current Ubuntu LTS, or any mainstream Linux the owner is happy to run. |
| **Architecture** | **x86-64.** Arm64 may work and has not been walked. |

**RAM is the constraint because agents are the workload.** Inference happens outside this
machine; what the box holds is live agent processes, and each one wants roughly 700 MB. A
16 GB machine is a roughly-twenty-agent machine once Ubuntu, Ronin, Node, tmux and the
services layer have their share. Set Ronin's session maximum below the point where Linux's
OOM killer would start choosing an existing session to end.

**RAM buys sessions that are live at once — not sessions you can have.** This is the
distinction that decides how much an owner needs to spend, and it is worth explaining
rather than letting them assume the worst.

Ronin **archives** a session: it identifies the provider's conversation, writes a small
manifest, and genuinely stops the tmux session and its agent processes — so the RAM comes
back. Rehydrating creates a new process and lets the provider CLI resume its own
conversation (`claude --resume <uuid>`, `codex resume <uuid>`), then restores the session's
teams, leads, wipeboards, note, project root and dials. It is a resumable stop, not a
suspended process and not a delete. [`docs/archived-sessions.md`](archived-sessions.md) is
the full account.

So a smaller machine holds fewer agents **at the same moment**, and the work an owner puts
down does not have to disappear to make room. That changes the calculation: 8 GB with
archiving in normal use is a real way to run Ronin, not a crippled one.

**4 GB installs and proves Ronin** and runs a small number of sessions. If the owner wants
to start there, say plainly what they are buying — a working Ronin with the session cap
held low — and that RAM is the one dimension most providers let you rescale later.

**Bigger is rarely the answer.** Dedicated or CPU-optimized tiers buy predictable sustained
CPU that Ronin's workload does not need. Spend the money on RAM.

### 2. Distance

**Choose a location near the owner, and measure it before buying.** This choice is usually
unrecoverable — most providers cannot move a running server between regions, so changing
your mind means building a new machine and migrating.

It matters because of what Ronin is: a live tmux session rendered in a browser tab. In a
**locked** tile each character travels to the machine, the shell decides what the screen
should look like, and the redraw travels back. Nothing renders the keystroke until the
server confirms it, so the round trip is the delay on **every character typed**.

| Round-trip time | What the owner experiences |
|---|---|
| under 30 ms | Indistinguishable from a local terminal. |
| 30–60 ms | A fast typist notices, especially editing a long line or in `vim`. |
| 60–100 ms | Perceptible to most people; the end of a word arrives after the word. |
| over 100 ms | Typing outruns the screen. Owners report Ronin as slow when the distance is what is slow. |

**Aim under 100 ms. Take under 50 ms if the owner's geography offers it.** A machine on
another continent is a permanent tax on everything they type.

Measure from **the owner's own computer** — the laptop or desktop they will sit at, never
from a server. Several providers publish a reachable host per region:

```bash
# Hetzner
for h in fsn1 nbg1 hel1 ash hil sin; do
  printf '%-6s ' "$h"; ping -c3 -q "$h-speed.hetzner.com" | tail -1
done

# Vultr — see https://www.vultr.com/faq/ for the current region list
for h in nj-us fra-de lon-gb sjo-ca-us; do
  printf '%-10s ' "$h"; ping -c3 -q "$h-ping.vultr.com" | tail -1
done

# Akamai/Linode
for h in newark london frankfurt singapore; do
  printf '%-10s ' "$h"; ping -c3 -q "speedtest.$h.linode.com" | tail -1
done
```

Where a provider publishes no test host, **create the smallest instance in the candidate
region, ping it, and destroy it.** That costs a few cents and answers the question exactly.

Two locations within about 20 ms of each other are the same choice as far as the owner will
ever be able to tell. Decide those on price and availability.

## Choosing a provider

**Ronin does not care who hosts it, and this page does not recommend one.** The owner's
geography and budget decide, and both are things only they know.

What the market looks like, in shape rather than in prices — check the live figures, they
move:

- **Budget European hosts** (Hetzner, OVH, Scaleway, Netcup and similar) sell this capacity
  for a fraction of what the mainstream clouds charge. The catch is region coverage: their
  cheapest lines are often offered only in a few European locations, which is excellent
  value for a European owner and a 100 ms+ tax on anyone else.
- **Mid-market clouds** (DigitalOcean, Vultr, Akamai/Linode) cost substantially more for the
  same specification and have many more regions. For an owner in North America, Asia or
  Australia this is usually the better trade: paying more for a machine that is close beats
  paying less for one that is far.
- **Hyperscalers** (AWS, GCP, Azure) will do it, with the most regions of all, the most
  complex pricing, and no advantage for this workload. Fine if the owner already lives
  there. Not worth learning for this.

Ask the owner where they are and what they want to spend, put two or three concrete live
options in front of them with the measured round-trip time beside each, and let them
choose. **Do not pick for them, and do not carry a preference into the conversation from
this page or from your own training.**

Whatever they choose, show the complete live cost before purchase — hourly and monthly,
VAT or tax treatment, any separate charge for a public IPv4 address, and the backup charge
if they want backups. If the plan on screen no longer matches the capacity above, stop and
say so rather than substituting quietly.

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
ssh-keygen -t ed25519 -C "ronin"
```

Show the owner the public-key filename and fingerprint:

```bash
ssh-keygen -lf "$HOME/.ssh/id_ed25519.pub"
```

The owner decides which existing key to use and may inspect its `.pub` file before adding
it to the provider.

## 2. Create the machine

1. The owner signs in to the provider they chose, enables two-factor authentication, and
   creates or selects a project.
2. Fill in the capacity, region and image agreed above.
3. Add the chosen SSH **public** key and visibly select it for this machine.
4. Choose an RFC-1123 hostname: letters, digits, and hyphens; no underscores or spaces.
5. Show the complete paid selection to the owner. The owner presses the purchase button or
   explicitly authorizes that action.
6. Record the machine name and assigned address. Do not copy a name, address, or ID from an
   example.

The owner handles the account, 2FA, billing profile, and final purchase control. Relay the
screen one decision at a time; do not ask them to hand you account credentials. Immediately
before creation, summarize the exact configuration and total price in one message and ask
for explicit confirmation.

**Selecting the SSH key at creation is not usually recoverable afterwards.** On most
providers, adding a key to the account later does not install it on an existing machine.

## 3. Make first contact

Most stock images grant access as `root`. Verify the host fingerprint from the provider's
console before accepting it, then connect with the chosen key:

```bash
ssh -i <private-key-path> root@<server-ip>
```

On the machine, prove the destination before changing it:

```bash
whoami
hostname
uname -a
```

If SSH asks for an unknown root password, stop trying passwords. The SSH key was probably
not selected at creation. `ssh-copy-id` cannot fix this without an already-working login.

Recovery paths, with the owner's approval:

- For a brand-new empty machine, delete and recreate it with the public key selected. Show
  the owner that billing stops only when it is deleted, not when it is powered off.
- Use the provider's browser/VNC console to reset the root password, log in there, and add
  the public key by hand.
- If access was lost on a machine that already holds data, use the provider's rescue mode
  rather than rebuilding. Rebuild erases the machine.

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
sessions, and Ronin files belong to this ordinary account — not root.

## 5. Let Ronin survive logout

**Do this before installing Ronin, and do not skip it on a rented machine.**

Ronin runs as `systemd --user` units. By default, a user's services are stopped when that
user's last session ends — which on a headless machine means **the moment the owner closes
their SSH connection.** They would install Ronin, disconnect, and find it gone.

`loginctl enable-linger` tells systemd to keep that user's service manager running whether
or not anyone is logged in:

```bash
sudo loginctl enable-linger <account>
loginctl show-user <account> --property=Linger --value    # expect: yes
```

This is the one step on this page that needs `sudo`, and it is the owner's to approve.
`setup.sh` detects a missing linger and prints this command, and `bin/ronin-doctor` reports
it as a fault — but by then the owner has already met the symptom. Do it here.

## 6. Establish private access

Install Tailscale on the owner's computer and the machine using the current
[official instructions](https://tailscale.com/kb/1347/installation). The owner signs both
devices into the same tailnet.

**Install and sign in to Tailscale before running Ronin's `setup.sh`, not after.** Setup
reads `tailscale ip -4` to decide what address to bind to. If Tailscale is absent at that
moment Ronin binds to loopback, and reaching it means an SSH tunnel until someone
reconfigures and restarts it. The ordering is not cosmetic.

Prove the route from the owner's computer before relying on it:

```bash
tailscale status
tailscale ping <machine-tailnet-name-or-ip>
```

Read two things out of that. **The connection should say `direct`** — if `tailscale status`
shows it reached via a DERP relay, traffic is detouring through a Tailscale server and
everything interactive feels worse than it needs to. **The reported time should match what
the region measurement predicted**; if it is far higher, something other than distance is
wrong, and it is worth finding now.

**The tailnet becomes Ronin's security boundary**, so it is worth knowing what is in it
while it is being created. By default Ronin has no login — inside the tailnet it simply
opens, which is the convenience most owners want — and the trade is that whatever is on
that tailnet can use it. If it holds the owner's own devices, that is the arrangement
working. If it came from a work or Google Workspace sign-in it may hold colleagues, which
is worth one question now rather than later. The install guide covers the choice.

Do not open Ronin's port to the public internet. Keep provider-console and public-SSH
recovery working until the owner has accepted the Tailscale path. Firewall hardening comes
after that proof, never before it.

## 7. Put an agent on the machine

While logged in as the ordinary account, install one agent CLI from its maintained
first-party instructions. The owner completes its authentication; credentials are not
copied from the local computer or installed under root. Prove that the CLI starts and can
act on this machine.

Give that remote agent this instruction:

> Open https://github.com/ronincowork/ronin-cowork/blob/master/docs/install.md and follow
> it on this machine. Install Ronin under this ordinary account, never expose its port
> publicly, and return the complete URL printed by setup.

The local provisioning agent stops changing the machine once the remote agent accepts. It
stays available only for provider-console, SSH, or Tailscale recovery.

## Handoff checklist

Before handing the machine to the Ronin installer, report:

- provider, region, and machine name (never credentials);
- purchased capacity, and whether backups are enabled;
- the measured round-trip time from the owner's own computer;
- OS version and hostname;
- ordinary account name;
- successful direct SSH and sudo checks;
- **linger confirmed on** for that account;
- **Tailscale up and signed in**, with a successful reachability check;
- provider-console recovery location;
- agent CLI available on the machine.

Do not include private keys, passwords, authentication tokens, or copied `.env` files in
the handoff.

## Field notes

This runbook comes out of Ronin's own installs, including a third-party install whose SSH
key was not selected at creation, and a third-party agent-led install that identified
linger and the Tailscale ordering as the two traps a first-timer meets on a rented
headless machine.

Provider consoles, prices, plan names and region lists all change. Nothing on this page is
a substitute for reading the live screen with the owner.
