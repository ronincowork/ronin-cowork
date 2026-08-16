# 01 · CHOOSE A KICKOFF

> These are the three ways someone starts. Network tools are steps inside a
> workflow, never scenarios of their own.

## 1. Need a VM

The_owner has a personal computer but no destination box. Local Claude or Codex walks
them through creating a VM, installing an SSH public key, connecting to it, and opening
Claude or Codex there.

Follow [`02A_NEED_VM.md`](02A_NEED_VM.md).

## 2. Already have a VM or server

The_owner already has the box where Ronin should run. It may be a rented VM, home server,
Mac mini, NAS or another always-on Unix-like machine. They reach it through whatever
administrative access already exists—SSH, Tailscale, another VPN, a provider console or a
local terminal—and open Claude or Codex there.

Follow [`02B_HAVE_SERVER_OR_VM.md`](02B_HAVE_SERVER_OR_VM.md).

## 3. Run it on the laptop

The_owner has no remote box and chooses to run Ronin directly on their personal computer.
This is supported, but it is the last option: Ronin is available only while that laptop is
on and connected.

Follow [`02C_LAPTOP.md`](02C_LAPTOP.md).

## Shared exit

All three workflows first reach the same fact:

> Claude or Codex is running on the machine that will become the `ronin_machine`.

The Need VM process receives `05_CHRISTMAS_MORNING_2.md`, because it must join the new VM to
the prepared tailnet before installing Ronin. The existing-box and laptop processes
receive `06_ROGUE_AGENT.md`. Both routes converge again at the Rogue → Ronin handoff.
