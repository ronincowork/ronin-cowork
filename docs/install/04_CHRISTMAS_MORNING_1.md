# 04 · CHRISTMAS MORNING 1 — personal computer to a Rogue on the VM

> SOP for `rogue_1`: Claude or Codex already running on the owner's personal
> computer. Finish when `rogue_2` is running on the new VM and has received
> `05_CHRISTMAS_MORNING_2.md`.

## Objective

Walk the owner through the parts that must begin on their personal computer:

```text
install/login to Tailscale locally
  -> subscribe to a VM
  -> connect over SSH
  -> install/open Claude or Codex on the VM
  -> start rogue_2
  -> deliver 05_CHRISTMAS_MORNING_2.md
```

The_owner performs account creation, billing, authentication, credential approval and
provider choices. You explain, propose, check and continue from the resulting evidence.

## 1. Establish the local facts

Confirm you are running on the owner's personal computer. Identify its OS, account and
existing SSH public keys. Never read, print, upload or paste a private key.

## 2. Install and connect Tailscale on the personal computer

Use Tailscale's maintained first-party installation instructions for this OS. Walk
the owner through signing in and joining the tailnet they want Ronin to use.

Prove the local device appears connected before continuing. Do not invent a tailnet name
or create a second account silently.

Tailscale on the personal computer does not make the future VM reachable yet. It prepares
one end of the durable connection; first contact with the VM still uses its provider
console or public SSH address.

## 3. Subscribe to the VM

Read `03_VM_OPTIONS.md`, present its standard Hetzner path and let the owner choose.

The purchase screen must visibly read:

```text
Cost-Optimized · x86 · CX43
8 vCPU · 16 GB RAM · 160 GB local disk
Floating IP off · 20 TB traffic
```

The observed price is €19.67/month. Read the current price from the live console and ask
the owner to confirm it before purchase. Latency is not the deciding constraint; choose
the cost-optimized x86 option. Do not downgrade to the older CPX22/4 GB configuration in
the source setup log.

Walk the owner through:

- provider account and billing;
- supported Unix-like image;
- approved machine size and region;
- VM name;
- adding the personal computer's SSH **public** key;
- recording the provider console as recovery.

Do not choose a paid plan or create the VM without explicit confirmation.

## 4. SSH to the new VM

Use the address and ordinary account returned by the provider:

```bash
ssh <account>@<vm-address>
```

Verify the host fingerprint through the provider console before accepting it. Then prove
the destination:

```bash
whoami
hostname
uname -a
```

If the provider's first login is root, use it only to update the base OS and create the
ordinary sudo account named by the owner. Install the same SSH public key for that account,
disconnect, and prove a fresh direct login as it. All Claude, Codex, tmux and Ronin work
continues under the ordinary account, never root. `03_VM_OPTIONS.md` carries the account
shape.

## 5. Install Claude or Codex on the VM

From the ordinary account, check first:

```bash
command -v claude || command -v codex
```

If neither is present, use one maintained first-party installer. The_owner completes the
provider authentication. A URL printed on the VM may be opened in the personal computer's
browser; the browser does not need to run on the VM.

The milestone is a CLI on the VM that accepts a prompt and can act there.

## 6. Start rogue_2 and hand over

The Claude or Codex process now running on the VM is `rogue_2`. Give it this instruction:

> Open https://github.com/ronincowork/ronin-cowork and follow
> `docs/install/05_CHRISTMAS_MORNING_2.md`. Return the working Ronin URL and then hand
> off to the first Ronin agent.


Stop doing setup from the personal-computer agent. Remain available only to help recover
Tailscale, provider-console or SSH access.

## Exit

- Tailscale is connected on the personal computer;
- the VM subscription exists with the owner's confirmed choices;
- SSH to the VM works;
- provider-console recovery is recorded;
- Claude or Codex is running on the VM as `rogue_2`;
- `rogue_2` has accepted Christmas Morning 2.
