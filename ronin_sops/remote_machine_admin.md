# remote_machine_admin — keeping the machine's groundwork in order

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `remote_machine_admin.md`)
> replaces this file whole — a default, not law.
> **Voice: agent.** What to do when the machine underneath this install needs setting up,
> checking, or repairing. Not a walkthrough to relay.
>
> **Its sibling is `remote_machine_health.md`**, which answers *"is this box healthy, and why
> is it slow"* and needs nothing installed. This one answers *"is what the machine offers
> still in place, and what does this person need to do about it"*. Health diagnoses; this
> maintains. **Sessions and the tmux server are neither** — that is `tmux_server.md`.

This arrives when someone is setting a box up, when `ronin-doctor` raises a finding about the
machine, when the gauge shows something a person wants explained, or when an install has been
moved, restored or rebuilt and nobody knows what survived.

## What you are working with

| Tool | Answers |
|---|---|
| `bin/ronin-doctor` | every machine finding, each naming its own remedy |
| `GET /api/machine` | the live reading — memory, swap, load, cores, scope |
| `ronin_bin/tejun-survey` | what this box IS: cores, RAM, swap, disks |
| the machine service's watch script | one report, by hand or on a schedule the owner chose — it ships with the service, not with cowork |
| `tejun-account` · `bin/ronin-store --all` | who it runs as, where its stores resolve |

**Prefer the tool over doing it by hand.** Each encodes a check you would otherwise
approximate, and `ronin-doctor` is the one that turns a reading into a finding with a remedy.

## The one rule that shapes everything else

**Ronin holds no root, and asks for none.** Every chore below is something a *person* does.
Your job is to detect it, explain the trade-off, and hand over the exact line — never to run
it, and never to find a tidier way to ask for privilege. This install has no `sudo` in any of
its own paths and that is worth more than any capability on this page.

So: **compose, explain, hand over. Then verify by reading, not by assuming.**

## Checking the groundwork, row by row

Each has a positive check. Run the check before saying anything about the row — the answer is
measured, never remembered, including from earlier in the same session.

| Row | Check | If absent |
|---|---|---|
| **swap** | `/usr/sbin/swapon --show` — empty means none | `remote_machine_health.md` § swap has the reasoning and the line |
| **linger** | `loginctl show-user "$USER" --property=Linger --value` | without it every `--user` service stops at logout, so the coworkspace is simply gone whenever nobody is signed in |
| **the door** | `tailscale serve status` | absence is **not** a fault: reaching an install at `http://ip:port` over the tailnet is a legitimate arrangement |
| **kernel log** | `journalctl -k -n1` returns entries, or `dmesg` works | without it nothing can say what was killed — see below |
| **the reading** | `curl -s localhost:PORT/api/machine` | `{"off":true}` means the owner turned watching off; a 404 means the machine service is not installed |

## What killed it — the row that matters most, and its trade-off

After something dies unexpectedly the first question is *what did the kernel kill, and when*.
On a stock box that is unreadable: `kernel.dmesg_restrict` is commonly `1` and `journalctl -k`
returns nothing without the right group.

**Say so plainly rather than inferring.** *"The box was short of memory and a process
disappeared"* is an observation. *"The kernel OOM-killed it"* is a claim that needs the log.
An agent that guesses here sends someone chasing the wrong cause.

The remedy is `usermod -aG adm <user>`, and **the trade-off belongs in the same breath as the
remedy**: it is read-only, it is the person's own account, and after it *anything running as
that user can read system logs* — which includes every agent on the box. It also needs a
re-login before it takes effect, which is the part people are most often puzzled by. State
that, and let them choose. Some will; some will decide their logs are none of Ronin's
business, and that is a complete answer.

## Repair, and what "self-maintaining" actually means

There is no repair daemon. **You are the repair.** Given a box that has drifted:

1. Run `bin/ronin-doctor` and read every finding.
2. For each, run its own check yourself so you are reporting the machine and not the report.
3. Compose ONE block for whatever genuinely regressed — not the rows that are already true.
4. Hand it over with what each line does and what it grants.
5. Afterwards, read the state back and say the numbers.

**Nothing here is scheduled and nothing acts on its own.** If a problem keeps returning, the
answer is to fix what produces it, not to run something that cleans up after it — a reaper
hides a leak and then one day kills the wrong thing.

## Boxes that are not the one you expect

Each of these produces a confidently wrong answer if you assume Linux-on-a-VM:

- **Containers** — `/proc/meminfo` describes the HOST. A 2 GB container reads the host's
  64 GB and looks healthy while being killed. `/sys/fs/cgroup/memory.max` is the truth; the
  reading reports `scope` so you know which one answered.
- **macOS** — no `/proc`, no `loginctl`. The reading falls back to coarser numbers and lists
  what it could not see under `unavailable`. **An unanswered field is not zero**: reporting
  `swap: 0` on a box you cannot read swap on is a lie with a number on it.
- **No `sudo` at all** — a managed or corporate box. Every chore degrades to advice; none of
  them is an error. Say what would help and stop.
- **A provider that already manages swap or updates** — offering again is noise. Check first.
- **A home server on no tailnet** — the door row does not apply.

## When the person says no

Watching is on by default for an install holding Ronin Services, and turning it off is a
complete answer that needs no justification. Off means the reading is not gathered and the
gauge is not drawn. **Nothing was ever installed on the machine, so there is nothing to
undo** — this is a display choice, not a consent record, and it flips back whenever they like.
