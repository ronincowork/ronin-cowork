# 02A · NEED A VM — Rogue 1, Rogue 2, Ronin

> First and preferred kickoff when the owner has no suitable always-on box. Exit when
> Claude or Codex is running on the new VM.

## Start

The_owner has a browser, terminal and Claude or Codex on their personal computer. That
process is `rogue_1`. Give it `04_CHRISTMAS_MORNING_1.md`.

## Workflow

1. Start `rogue_1` on the personal computer and point it to Christmas Morning 1.
2. `rogue_1` walks through installing and joining Tailscale on the personal computer.
3. `rogue_1` reads `03_VM_OPTIONS.md`, selects Hetzner Cost-Optimized · x86 · CX43 with
   16 GB RAM, shows the live price, and walks through the owner's confirmation and
   purchase.
4. `rogue_1` walks through SSH to the new VM.
5. Install and authenticate Claude or Codex on the VM.
6. Start that remote CLI as `rogue_2` and point it to `05_CHRISTMAS_MORNING_2.md`.
7. `rogue_2` joins the VM to the same tailnet.
8. `rogue_2` installs ronin-cowork.
9. `rogue_2` installs the compatible ronin-services release.
10. `rogue_2` starts Ronin, reads the live URL and has the owner open it.
11. `rogue_2` hands off to the first `ronin_agent`.

Provider console/public SSH is first contact. Tailscale becomes the durable path once
both devices have joined the same tailnet.

## Exit

- the owner can reconnect to the VM from the personal computer;
- both devices are on the same tailnet;
- ronin-cowork and compatible ronin-services are installed;
- the owner has opened the live Ronin URL;
- the first `ronin_agent` has accepted the handoff.
