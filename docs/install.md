# Install Ronin — the front door, for an agent

> Hand this file's URL to Claude or Codex on the machine in front of you and say go.
> It determines the starting scenario, then follows the linked stage instructions in
> `docs/install/` until you are looking at your own coworkspace in a browser.

## If you were pointed here, begin here

First determine where Ronin will run:

1. There is no destination machine yet: follow **Need a new VM**.
2. A server or VM already exists: follow **Already have a server or VM**.
3. Ronin must run on this laptop: follow **Laptop**, the fallback path.

Do not invent another scenario for SSH, Tailscale, a provider console or another VPN.
Those are ways to open a terminal on a machine. After choosing, continue through
[`install/01_CHOOSE_KICKOFF.md`](install/01_CHOOSE_KICKOFF.md), which links the exact
workflow.

## The whole route

The Need VM case begins on the owner's personal computer, where they already have a
browser, terminal and Claude or Codex. There are two Rogue seats before Ronin can help:

1. `rogue_1` on the personal computer provisions access and the VM.
2. `rogue_2` on the VM joins it to the tailnet and installs Ronin.

The box can be the owner's laptop, server or VM. Local Terminal, SSH, a VM provider
console and a private remote-access tool are all entrances to the same place: a shell on
the box under the account that will own Ronin. The Need VM sequence is split between
[`install/04_CHRISTMAS_MORNING_1.md`](install/04_CHRISTMAS_MORNING_1.md) and
[`install/05_CHRISTMAS_MORNING_2.md`](install/05_CHRISTMAS_MORNING_2.md).

Claude or Codex running directly in that shell is the `rogue_agent`: it is
outside Ronin. Its job is narrow. It installs the released cowork, adds the services
layer, creates the minimum viable Ronin seat, and hands control to the `ronin_agent`
inside Ronin. The `ronin_agent` performs the substantial setup work.

```text
person
  -> rogue_1 on personal computer
  -> 04_CHRISTMAS_MORNING_1.md
  -> Tailscale on personal computer
  -> VM subscription + SSH
  -> Claude or Codex installed on VM
  -> rogue_2 on VM
  -> 05_CHRISTMAS_MORNING_2.md
  -> VM joins the tailnet
  -> ronin-cowork + ronin-services
  -> Ronin URL
  -> 07_HANDOFF.md
  -> ronin/00_RONIN_AGENT.md
  -> working Ronin returned to the owner
```

## What a GitHub visitor does

### 1. Start on the home computer

Open Claude or Codex on the computer in front of the owner. Give it the
`install/04_CHRISTMAS_MORNING_1.md` procedure when the destination is a fresh VM. It
helps the owner create or locate an SSH key, add the **public** key during VM creation,
verify the VM's address and form the SSH command.

The local agent may run ordinary read-only checks and propose commands. The_owner handles
provider login, billing, credential prompts, host-key approval and any destructive choice.

### 2. Open a terminal on the intended box

- Laptop: open its terminal application.
- Server: connect with SSH or its existing private access method.
- VM: use the provider console or the SSH key installed during VM creation. Tailscale
  cannot be the first connection when it is not installed yet.

Stop here unless `whoami`, `pwd` and `uname -a` run on the intended box.

### 3. Open Claude or Codex on that box

```bash
command -v claude || command -v codex
```

If Claude is found, run `claude`. If Codex is found, run `codex`. Complete its ordinary
interactive authentication if asked.

If neither exists, install one from its maintained first-party instructions:

- Claude Code: <https://docs.anthropic.com/en/docs/claude-code/getting-started>
- Codex CLI: <https://github.com/openai/codex#quickstart>

Then open it. The milestone is not “installed”; it is a CLI that accepts a prompt and can
work in this terminal.

### 4. Give the agent its scenario's instruction

- Need VM: `rogue_1` gives the VM's `rogue_2` `install/05_CHRISTMAS_MORNING_2.md`.
- Have a VM/server: the agent on that box receives `install/06_ROGUE_AGENT.md`.
- Laptop: the local agent receives `install/06_ROGUE_AGENT.md`.

## The boundary

The Rogue seat on the destination box does the irreducible bridge work:

- obtain the released cowork and install it (a small bootstrap checkout supplies the
  updater; the install itself is a versioned release, never the checkout as operator);
- add the compatible services layer with the same updater;
- establish tailnet reach for the Need VM path;
- start Ronin and return the live URL;
- record exactly what it did;
- launch the receiving agent and deliver the receipt plus `ronin/00_RONIN_AGENT.md`.

The `ronin_agent` owns the post-launch complexity:

- inspect and preserve what was already on the box;
- verify and repair the installed system;
- run BYOIN and resolve findings;
- prove the ronin_operator and tmux restart survival;
- establish session_launch_specs and the inclusion_list;
- hand the owner the URL and recovery path.

The handoff is not “continue setup.” It is a receipt separating completed acts, observed
facts and unverified work. [`install/07_HANDOFF.md`](install/07_HANDOFF.md) defines it.

## Choose one kickoff

There are three, in this order:

1. **Need a VM** to be created and managed from the owner's personal computer.
2. **Already have a VM or server** and want to run Ronin there.
3. **Run Ronin on the laptop** as the fallback when there is no remote box.

SSH, a provider console, Tailscale and another VPN are access methods inside the first
two workflows. They are not kickoff scenarios.

See [`install/01_CHOOSE_KICKOFF.md`](install/01_CHOOSE_KICKOFF.md), then choose one `02`
scenario file.

## The files

| File | Reader | Purpose |
|---|---|---|
| `docs/install.md` | the owner and anyone reviewing the system | the complete route and public front door |
| `install/01_CHOOSE_KICKOFF.md` | the owner and the local agent | choose exactly one kickoff workflow |
| `install/02A_NEED_VM.md`, `install/02B_HAVE_SERVER_OR_VM.md`, `install/02C_LAPTOP.md` | the local agent | the three kickoff workflows |
| `install/03_VM_OPTIONS.md` | `rogue_1` and the owner | the Hetzner choice; live price and size confirmed before purchase |
| `install/04_CHRISTMAS_MORNING_1.md` | `rogue_1` on the personal computer | Tailscale, VM subscription, SSH and remote CLI |
| `install/05_CHRISTMAS_MORNING_2.md` | `rogue_2` on the VM | join tailnet, install both Ronin layers and return the URL |
| `install/06_ROGUE_AGENT.md` | Claude or Codex outside Ronin | existing-box/laptop route across the boundary |
| `install/07_HANDOFF.md` | both agents | the receipt between them |
| `install/ronin/00_RONIN_AGENT.md` | the first agent inside Ronin | complete the setup and return Ronin to the owner |
