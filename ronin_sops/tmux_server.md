# tmux_server — the session engine, and how this house keeps it healthy

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `tmux_server.md`)
> replaces this file whole — a default, not law.
> **Voice: agent.** How a session establishes whether the tmux server is set up the way
> Ronin needs it, what it may do about what it finds, and what it must never touch. Not a
> walkthrough to relay.
>
> **Tool:** none yet. The walk below is the specification for one — a single health check
> over the server, **[planned]**. Until it exists, run the walk by hand.
>
> **Scope: THE SESSIONS AND THE SERVER THAT HOLDS THEM.** Its sibling is
> `ronin_sops/remote_machine_health.md`, which owns the box — memory, swap, disk, the
> kernel. Split on the owner's ruling, 2026-08-25: a session asking *is the box healthy* is
> not asking the same question as one asking *is the session engine sane*, and one file
> answering both made every answer longer than the question.

This arrives as *"`tmux ls` shows far more than I have"*, *"my sessions all vanished at
once"*, *"Ronin restarted and took everything with it"*, or an agent about to type a tmux
command it has not thought through.

**The tmux server is the most valuable process on the box.** Everything anyone is working
on lives inside it, none of it is on disk until someone commits, and one careless command
ends all of it simultaneously. Ronin itself can be restarted freely; this cannot.

## The one thing that must be true

**The tmux server must not live in Ronin's cgroup.** A tmux server belongs to whichever
process first asked for one, daemonising does not escape a cgroup, and systemd's default
kill mode SIGTERMs everything in a unit's cgroup when it stops. So a server Ronin started
is a server that dies every time Ronin restarts — taking every session on the box with it,
with nothing in any log that looks like a kill.

This is fixed structurally: `deploy/tmux-server.service` owns the server,
`src/host-guard.ts` warns when the running server shares Ronin's cgroup and asks systemd
rather than forking one itself. **The why, the failure, and the cutover for a box already
in the broken state are in `docs/tmux-server-cgroup.md`** — go there before changing
anything about the units. Do not re-derive it here.

## What you may not do

- **Never kill an agent process.** Not `claude`, not `codex`, not any CLI in a session, not
  Ronin's own service. If something must end, it ends as a session, through Ronin.
- **Never `tmux kill-server`.** On any socket that has live sessions, and most especially
  not from inside a pane — `$TMUX` outranks `TMUX_TMPDIR`, so a scratch-rig teardown that
  forgets `env -u TMUX` lands on the live server. That has happened here.
- **Never `systemctl --user restart tmux-server` while sessions exist.** That unit owns
  them; stopping it is not a way to refresh anything.
- **Never `pkill -f`.** The pattern matches your own shell, because your command line
  contains the word, and it matches any process whose path contains it. It has produced a
  wrong census three times in one session and once made a cleanup guard protect the very
  orphans it was written to find.
- **Never end a session with bare `tmux kill-session`.** It orphans that session's viewers,
  and a bare tmux name can prefix-match a neighbour after the intended target dies. Ending
  a session is Ronin's job — the delete button, harakiri, or `DELETE /api/sessions/:name`,
  all of which run `killSessionTree()` and sweep the group.
- **Do not tidy `grid_*` sessions by hand.** Each one may be somebody's open tile.

Two of these are enforced where `bin/shim` precedes `/usr/bin` on `PATH`, and only there:
the shimmed `systemctl` refuses to stop the server unit while sessions live, and the
shimmed `tmux` refuses an ambiguous scratch-socket kill. `which systemctl` says whether the
guard is in force on this box. Where it is not, the rule is written down and nothing else.

## Reading the session list

**Most names on a raw list are not sessions.** They are `grid_*` viewers: one throwaway per
browser tile, holding no agent and doing no work. Ronin filters them from every surface it
draws; `tmux ls` filters nothing, which is why the two disagree — usually by about half.

`docs/session-identity.md` is the full explanation, including why one pane answers to
several names at once. Do not diagnose a session count without reading it; the raw number
is not the number.

## The walk

Each step is one question, its command, and what a bad answer means. Report the answers;
act only where this file says you may.

**1 — Is there a server, and whose cgroup is it in?**

```sh
pgrep -x tmux | while read -r p; do grep -o '[^/]*\.service' "/proc/$p/cgroup" | tail -1; done
```

Anything naming Ronin's own unit is the failure above: the next Ronin restart ends every
session. **Do not fix it silently** — the repair replaces the server and therefore ends the
sessions it holds. Report it, name `docs/tmux-server-cgroup.md`, and let the owner pick the
moment.

**2 — Are the guards in force?**

```sh
which systemctl tmux      # bin/shim/... = guarded, /usr/bin/... = not
```

Not guarded is not a fault; it is a fact worth stating before anyone relies on being
stopped. The remedy is a `PATH` line in the login shell's rc file, which is the owner's to
add.

**3 — Does the server survive an empty house?**

```sh
tmux show -s exit-empty
```

`off` is what this house wants. `on` means the last session ending kills the server, and
whoever asks for the next one becomes its owner — which puts step 1 back in play by
accident. Set by `deploy/tmux-server.conf` for a server that unit started.

**4 — What is actually running?**

```sh
tmux ls -F '#{session_name}' | grep -v '^grid_'        # real sessions
tmux ls -F '#{session_name}' | grep -c '^grid_'        # viewers
```

Compare the viewer count against the number of tiles genuinely open. A viewer per open tile
is correct and expected. Several times that is accumulation — see step 5.

**5 — Are viewers accumulating?**

```sh
tmux ls -F '#{session_name} #{session_attached}' | awk '$1 ~ /^grid_/ && $2 == 0'
```

A viewer exists only to be attached, so **an unattached viewer is leftover by definition**.
Since the tile socket gained a heartbeat (2026-08-25) a browser that goes away rudely — a
closed lid, a backgrounded phone, a dropped connection — is detected within about half a
minute and its viewer reaped, so a handful is normal churn and **a steady pile is now worth
reporting**: it means something orphaned them another way, usually Ronin killed mid-session
or a session ended outside Ronin. They are inert either way: they run nothing and cost a
session structure each.

**The remedy is to restart Ronin, not to kill them.** Ronin sweeps every viewer at boot and
at shutdown, and restarting Ronin does not touch the tmux server or any real session once
step 1 is satisfied. Killing them by hand risks closing a live tile and gains nothing.

**6 — Any session whose agent has already exited?**

```sh
tmux ls -F '#{session_name}' | grep -v '^grid_' | while read -r s; do
  tmux display-message -p -t "=$s:" '#{session_name} #{pane_dead}'
done
```

`1` means the CLI died and the pane is frozen at its last screen — deliberate, so the
failure stays readable under the session's own name instead of a live shell wearing it.
It is a finished session awaiting a person's decision, **not garbage to collect.** Report
it; the owner ends it or reads it.

**7 — How much headroom is left?**

Ronin's session max counts real sessions only — viewers were never counted and cannot
refuse a launch. If launches are being refused, the ceiling is real and the answer is to
end sessions through Ronin, never to raise the number reflexively.

## Watch, do not reap

Same rule as the sibling SOP, and for the same reason. **Do not build a reaper, a
kill-daemon, or a scheduled job that acts on this server.** A periodic check that *reports*
is welcome; one that kills is one bad pattern away from ending everyone's work. Where a
leak keeps returning, fix what produces it — the current one has a cause and a named
remedy in `docs/session-identity.md`, and neither is a cleanup script.
