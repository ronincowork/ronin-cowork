# machine_health — the box is slow, or something died

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `machine_health.md`)
> replaces this file whole — a default, not law.
> **Voice: agent.** How a session works out what is wrong with the box it is running on,
> and what it may and may not do about it. Not a walkthrough to relay.

This arrives as *"everything is slow"*, *"my session died"*, *"the browser cannot reach
Ronin"*, or an agent noticing its own work being killed mid-step. Ronin runs several agent
sessions at once and each one runs real work — test suites, builds, browsers. On a small VM
that adds up faster than anyone expects, and **a machine with no swap has no graceful
response to running out of memory: the kernel picks a process and kills it.** The thing that
dies is rarely the thing at fault.

## First: measure. Never remember.

Nothing written down about a machine stays true, including anything written earlier in the
same session. Run the tools before advising.

```sh
free -h                  # `available` is the number that matters, not `free`
uptime                   # load, against the core count from tejun-survey
ps -eo pid,ppid,etime,rss,args --sort=-rss | head -30
/usr/sbin/swapon --show  # empty output means no swap at all
ss -lntp                 # what is holding ports
```

`tejun-survey` for what this box is and what space it has. `tejun-account` for who the
install runs as. `bin/ronin-store --all` for where every store resolves — **never spell a
store path by hand.** If those tools are not on PATH, Ronin Services is not installed here:
say so and stop rather than improvising.

**A login banner is not a measurement.** The message of the day is generated at login and can
be days stale; it has reported a healthy box during an outage.

## What you may never kill

**`claude`, `codex`, `tmux`, and the Ronin services themselves.** Not as a candidate, not as
collateral, not because one looks idle. An agent process with no output for an hour is
usually thinking or waiting on a person. The cost of a wrong kill is somebody's unsaved work;
the cost of a missed orphan is a few megabytes.

**Closing a session is the owner's decision, never a session's.** You may compile the list
and present it. You may not act on it.

## The rules for anything you do kill

1. **Re-verify at kill time** — command line, parent, age, and environment, checked in the
   moment. Never act on a process ID from a document, a message, or an earlier command; PIDs
   are reused.
2. **Every candidate needs a discriminator** — a positive test that separates a dead process
   from a live one without guessing. If you cannot state the test, you do not have a
   candidate, you have a hunch.
3. **Ambiguous means leave it.** List it, say why you are unsure, ask.
4. **SIGTERM, then report.** Do not escalate to SIGKILL unasked, and say what survived.

## The orphan classes worth knowing

**Leftovers from sessions that have ended.** Servers and helper scripts started by an agent
inside its own scratch directory, still running after the session is gone. They are
reparented to the user's `systemd --user` or to init when their parent dies.
*Discriminator:* the scratch path names a session that no longer has a running process, AND
the parent is the service manager rather than a live agent. A live session's helper looks
identical apart from its parent — check the parent, not the age.

**Test fixtures that outlive their test run.** A suite that starts a real server as a fixture
can leak it if the teardown signals a wrapper rather than the server. These are easy to
mistake for a real service. *Discriminator:* a fixture's temporary data directory is deleted
by the teardown even when the kill misses, so **a live run still has its directory and an
orphan does not.** A tidy-looking temp directory is never evidence the process is gone; only
the process table is.

**Finished agent sessions.** Not an orphan class, and not yours. Reading another session
needs at least 👁 on its `@ronin-control` dial, through `tejun-rireki`. **Never flip a dial**
— that is the owner's hand, and a refusal is their standing word: report it, do not work
around it.

## swap

**Check first.** One line, and it answers with a fact rather than an impression:

```sh
/usr/sbin/swapon --show     # no output at all means there is none
```

`ronin-doctor` asks the same question every run and raises a finding when the answer is
none; `tejun-survey` reports it beside the RAM. If you were sent here by either, this is
the section they meant.

**What "none" means.** Swap is disk the kernel uses as overflow for memory. When RAM
fills it writes pages nothing has touched recently out to disk and hands the memory back;
if those pages are wanted again it reads them in, slower, but nothing is lost. **With no
swap there is no overflow**, and the kernel's only remaining move is to choose a process
and kill it. It chooses, not you, and it favours large ones — which on a box running
agent sessions means one of them dies with somebody's work in it.

Swap does not create memory and it does not fix a leak; something allocating without
bound just reaches the wall later, with the box crawling on the way there. What it buys
is the difference between losing an hour of work and noticing the machine is sluggish.

**It is also what makes an idle session cheap.** A session nobody has typed into for
hours is almost entirely cold pages. With swap those move to disk and the memory comes
back, and the session is still alive and still addressable when its person returns.
This is unrelated to archiving a session, which is a **person's decision** to finish with
one; swap needs no decision from anyone and applies to the sessions you have not
finished with.

**Before offering it, check all four.** A wrong recommendation here is worse than none:

| Condition | Why |
|---|---|
| swap is genuinely absent | never stack a second one on a box that has some |
| not a container | swap is the host's business, and `/etc/fstab` is not the container's to write |
| the root filesystem takes a swapfile plainly | `fallocate` is right on ext4 and xfs; other filesystems want their own method |
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

## Watch, do not reap

If a leak keeps coming back, the answer is to fix what produces it, not to run something that
kills it. **Do not build a reaper, a kill-daemon, or a scheduled job that acts.** A periodic
check that *reports* memory, load, and a count of whatever is leaking is welcome, costs
nothing, and leaves the decision where it belongs. A leak fixed at its source stays fixed; a
reaper hides the leak and then one day kills the wrong thing.
