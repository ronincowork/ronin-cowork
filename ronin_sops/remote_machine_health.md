# remote_machine_health — the box is slow, or something died

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `remote_machine_health.md`)
> replaces this file whole — a default, not law.
> **Voice: agent.** How a session works out what is wrong with the machine it is running on,
> and what it may and may not do about it. Not a walkthrough to relay.
>
> **Scope: THE MACHINE, not the sessions on it.** Memory, swap, disk, the kernel, the
> hardware. Agent processes, tmux sessions and their cleanup are a **separate concern with
> its own book**, `ronin_sops/tmux_server.md`, and deliberately are not here: a session
> hunting a stray process is not asking the same question as one asking whether the box is
> healthy.
> **Nothing in this file authorises killing anything.**

This arrives as *"everything is slow"*, *"my session died"*, *"the browser cannot reach
Ronin"*, or an agent noticing its own work being killed mid-step. Ronin runs several agent
sessions at once and each one runs real work — test suites, builds, browsers. On a small
machine that adds up faster than anyone expects, and **a machine with no swap has no graceful
response to running out of memory: the kernel picks a process and kills it.** The thing that
dies is rarely the thing at fault.

The machine may be a rented VM, a home server, or a box down the hall. **VM is a subset, not
the category** — nothing here assumes a cloud.

## First: measure. Never remember.

Nothing written down about a machine stays true, including anything written earlier in the
same session, and including the numbers a person quotes you from yesterday.

```sh
free -h                  # `available` is the number that matters, not `free`
uptime                   # load, against the core count from tejun-survey
/usr/sbin/swapon --show  # empty output means no swap at all
df -h /                  # room to work in
ls /var/run/reboot-required   # exists = the package manager wants a reboot
ps -eo pid,etime,rss,args --sort=-rss | head -20
```

`tejun-survey` for what this box is and what space it has. `tejun-account` for who the
install runs as. `bin/ronin-store --all` for where every store resolves — **never spell a
store path by hand**. `bin/ronin-doctor` turns several of these into findings that name
their own remedy. If those tools are not on PATH, Ronin Services is not installed here:
say so and stop rather than improvising.

**A login banner is not a measurement.** The message of the day is generated at login and
can be days stale; it has reported a healthy box during an outage.

**`free` is not the number.** On a healthy machine `free` is always small, because the
kernel spends every spare page on cache it hands back the instant anything asks. Reporting
it shows a comfortable box as nearly dead. **`available`** is the kernel's own estimate of
what a new allocation could actually get, and it is what predicts a kill.

**Inside a container, `/proc/meminfo` describes the HOST.** A 2 GB container reads the
host's 64 GB and looks healthy while it is being killed. Check `/sys/fs/cgroup/memory.max`
first: a real ceiling there is the truth about this process's world.

## What you may not do

- **Do not kill anything on the strength of this file.** Process cleanup belongs to the
  sessions concern, not here: the rules that make it safe live in
  `ronin_sops/tmux_server.md`, and the tmux server is the one process on the box that
  takes everyone's work with it.
- **No `sudo` from a session.** Everything below that needs root is written out and handed
  to the person. A session composes the line; a person runs it.
- **Nothing that acts on its own.** No reaper, no kill-daemon, no scheduled job that
  changes the machine. A periodic check that *reports* is welcome; one that acts is not.
- **Rebooting is the owner's timing.** It ends every session on the box.

## swap

**Check first.** One line, and it answers with a fact rather than an impression:

```sh
/usr/sbin/swapon --show     # no output at all means there is none
```

`ronin-doctor` asks the same question every run and raises a finding when the answer is
none; `tejun-survey` reports it beside the RAM. If you were sent here by either, this is
the section they meant.

**What "none" means.** Swap is disk the kernel uses as overflow for memory. When RAM fills
it writes pages nothing has touched recently out to disk and hands the memory back; if
those pages are wanted again it reads them in, slower, but nothing is lost. **With no swap
there is no overflow**, and the kernel's only remaining move is to choose a process and
kill it. It chooses, not you, and it favours large ones — which on a box running agent
sessions means one of them dies with somebody's work in it.

Swap does not create memory and **it does not fix a leak**; something allocating without
bound just reaches the wall later, with the box crawling on the way. What it buys is the
difference between losing an hour of work and noticing the machine is sluggish.

**It is also what makes an idle session cheap.** A session nobody has typed into for hours
is almost entirely cold pages. With swap those move to disk and the memory comes back, and
the session is still alive and still addressable when its person returns. This is unrelated
to archiving a session, which is a **person's decision** to finish with one; swap needs no
decision from anyone and applies to the sessions you have not finished with.

**Before offering it, check all four.** A wrong recommendation here is worse than none:

| Condition | Why |
|---|---|
| swap is genuinely absent | never stack a second one on a box that has some |
| not a container | swap is the host's business, and `/etc/fstab` is not the container's to write |
| the root filesystem takes a swapfile plainly | `fallocate` suits ext4 and xfs; others want their own method |
| several GB free, with headroom left over | filling the disk to add swap trades one outage for another |

**The steps.** A session does not hold root and does not run these — write them out and
hand them over. One block, one password:

```sh
sudo bash -c '
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
'
```

`chmod 600` is not optional — a readable swapfile hands out the contents of memory. The
`/etc/fstab` line is what makes it permanent: **the whole thing is done once, ever**, and
the kernel brings it back by itself on every reboot. Nothing recurring, nothing scheduled.

Confirm with `swapon --show` and `free -h`, and say the numbers back rather than assuming
the commands worked.

## What killed it

After something dies unexpectedly, the first question is *what did the kernel kill, and
when*. The answer is in the kernel log — and **on a stock box you cannot read it**:
`kernel.dmesg_restrict` is commonly `1`, and `journalctl -k` returns nothing without the
right group. Check before promising an answer:

```sh
cat /proc/sys/kernel/dmesg_restrict   # 1 = dmesg needs privilege
journalctl -k -n 5 --no-pager         # "-- No entries --" = no access, not no events
id -nG                                # adm / systemd-journal grant it
```

If you cannot read it, **say so plainly** rather than inferring a cause from timing. "The
box was short of memory and a process disappeared" is an observation; "the kernel OOM-killed
it" is a claim that needs the log. Making that access available is part of the machine
administrator groundwork.

## Reboots and updates

`/var/run/reboot-required` existing means the package manager wants one — a fact, free to
read, no privilege needed. A newer kernel in `/boot` than `uname -r` says the same thing.
Either way a reboot **ends every session on the box**, so it is scheduled with the owner and
never seized. Swap, once configured through `/etc/fstab`, comes back on its own.

## Watch, do not reap

If a problem keeps coming back, the answer is to fix what produces it, not to run something
that cleans up after it. **Do not build a reaper, a kill-daemon, or a scheduled job that
acts.** A periodic check that *reports* memory, load and whatever is growing is welcome,
costs nothing, and leaves the decision where it belongs.
