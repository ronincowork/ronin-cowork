# session identity — what a session list is actually showing

> **State of fact.** How a Ronin session is named, why one tmux pane answers to several
> names at once, and how to read a session list without being misled. Written because
> `tmux ls` shows roughly twice as many names as there are sessions doing work, and
> nothing on that list says which is which.
>
> Numbers are deliberately absent: facts about a box are measured, never written down.
> Every claim here carries the command that proves it on your own machine.

## The short answer

**Most of the names on `tmux ls` are not sessions. They are browser windows.**

A session doing work — one agent, one job, one name — is what Ronin calls a session and
what you see on the roster. Beside each one, tmux may also be holding one or more
**viewers**: throwaway sessions whose names start `grid_`, each one belonging to a browser
tile that is looking at the real session. They run nothing. They exist so that two people
(or two tiles, or a phone and a laptop) can look at the same session without fighting over
it.

Ronin filters them out of every surface it draws. Bare `tmux ls` does not filter anything,
which is why the raw list disagrees with the roster.

## The five names one session wears

| The name | What it is | Lives as long as |
|---|---|---|
| `view_mgr` | the real session — the one on your roster, the one with the agent in it | the work |
| `grid_view_mgr_<tag>_<n>` | a **viewer**: one browser tile's private view of it | that browser socket |
| `%1100` | tmux's **pane** — the actual terminal both are looking at | the real session |
| `view_mgr-<digits>` | the durable Ronin key (`@ronin-key`), which survives a restart | the session directory |
| a provider UUID | the agent vendor's conversation id, used to resume a thread | the provider's records |

Only the first is a thing you ever need to name. The rest are plumbing, and three of them
are not tmux addresses at all.

The house word for what you look at is the **tile**. *Pane* is tmux's word for tmux's own
object, and this page uses it only where that object is literally the subject — which here
it often is, because the whole confusion is that one pane is wearing several names.

## What a viewer is, and why one exists

Think of the real session as a television in a back room, permanently on, with the agent
working on the screen.

When you open a tile, Ronin does not walk in and take over that television. If it did, two
tiles would fight: one of them changing the channel would change it for the other. Instead
Ronin wires up **a second set to the same aerial** — tmux's grouped-session feature, which
gives a new session its own screen size, its own scroll position and its own options while
sharing the original's windows.

That second set is the viewer. `createViewer()` in `src/tmux.ts` builds it with
`tmux new-session -t`, then dresses it for a browser: no status bar (tmux's bar would show
the throwaway's name, which means nothing to you), mouse scrolling on, and a fixed size
policy so a phone tile cannot resize what a laptop tile is watching.

The name is four parts: the `grid_` prefix, the real session's name, a random tag, and a
counter — so `_86` means *the 86th viewer this Ronin process has made since it started*.
The counter resets when Ronin restarts; the tag does not repeat.

**A viewer holds no agent and does no work.** Nothing runs inside it. Killing one closes a
browser view and touches the session not at all.

## Where a viewer comes from, and where it goes

One place in the whole tree makes one, and it is the only place:

1. A tile opens its socket — `public/js/tilewire.js`, one socket per tile.
2. The server answers by making **one fresh viewer for that socket** — `src/ws/pty.ts`,
   through `createViewer()`. The unlocked (tape) view returns before this and makes none.
3. That socket closing kills that viewer — the `close` and `error` handlers at the foot of
   `handlePty()`.
4. Ending the session sweeps every viewer with it. `killSessionTree()` matches on tmux's
   `session_group` rather than on the name prefix, so it finds them exactly. Every way
   Ronin ends a session — the delete button, harakiri, an install teardown — goes through
   that one function.
5. `cleanupViewers()` sweeps whatever is left, at boot and at shutdown.

## Why one pane ends up wearing several names

Because **each socket makes its own viewer, and only that socket's own closing reaps it.**

When a tile's socket drops, the browser waits two seconds and reconnects
(`public/js/tilewire.js`). That reconnect is a new socket, so it gets a brand-new viewer.
For that to be clean, the server must notice the old socket dying — and **until 2026-08-25
it could not**, because nothing on this socket ever asked the peer whether it was still
there.

That gap mattered because of how connections actually fail. A closed laptop lid, a
backgrounded phone, a walk out of wifi range, a router quietly dropping an idle
connection — the browser notices every one of those and reconnects. The server noticed
none of them. It was left holding a socket to nobody: half-open, no error, no close event.
So the old viewer was never reaped, and the reconnect added a second one beside it. A day
of that is several names on one pane, and on a phone — mid-reconnect all the time — it was
the normal case rather than the exception.

The tell is in the counters. Three viewers on one pane numbered `_26`, `_28`, `_31` are
**not consecutive** — other viewers were made in between, so those three were born at
different times and none of the earlier ones was cleaned up. Three tiles genuinely open
together would be three live sockets, which is ordinary and correct; a non-consecutive
spread is accumulation.

**The heartbeat closes that hole.** `handlePty()` now pings the tile socket every thirty
seconds and terminates it on a missed pong, which fires the same close path a polite
disconnect takes. **Measured end to end on 2026-08-25** with a client that held the socket
open and refused to answer: ping at 30s, terminated at 60s, viewer gone. So a browser that
vanishes takes up to about a minute to clear, and the worst case is two intervals rather
than one. Terminating a connection that was merely slow costs nothing: the client reconnects
on its own, which is the case the tile is already written around.

What that does **not** cover is a viewer orphaned another way — Ronin killed mid-session,
or a real session ended outside Ronin. Those wait for `cleanupViewers()`, which runs at
boot and at shutdown and never in between, so a Ronin restart is still the sweep.

**A viewer left over from a rude disconnect is inert, not dangerous.** It runs nothing,
costs a tmux session structure, and misreports nothing except the raw list.

## Reading a session list correctly

```sh
tmux ls                                              # everything, viewers included
tmux ls -F '#{session_name}' | grep -v '^grid_'      # your real sessions
tmux ls -F '#{session_name}' | grep -c '^grid_'      # how many viewers are open
tmux ls -F '#{session_name} #{session_group} #{session_attached}'   # who is grouped with whom
```

To see which sessions are actually running an agent, ask tmux — it knows each pane's
foreground process, and the answer needs no process hunting at all:

```sh
tmux ls -F '#{session_name}' | grep -v '^grid_' | while read -r s; do
  printf '%s\t%s\n' "$s" "$(tmux display-message -p -t "=$s:" '#{pane_current_command}')"
done
```

**Never `pgrep -f`.** It matches your own shell, because the command line contains the
word, and it matches any process whose *path* contains it — an agent scratch directory is
enough. That has produced a wrong census three times in one session.

Two things the output does not say on its own. A session showing `node` may be an agent
CLI that runs under node — some run three processes per session, so **process count is
never session count**. And the tmux server itself is named `tmux: server`, not `tmux`, so
`pgrep -x tmux` finds nothing; where you need its pid, `tmux display-message -p '#{pid}'`
is the authoritative answer and does not depend on a process name at all.

## What counts sessions, and what each one filters

Every Ronin surface excludes viewers. The rule is applied in several places, each written
out separately:

| Surface | Where | Filters viewers by |
|---|---|---|
| the session max (launch guard) | `liveCount()`, `src/machine-settings.ts` | name prefix |
| the roster, the tile picker, `/events` | `listSessions()`, `src/tmux.ts` | name prefix |
| project-root lookup | `src/tmux.ts` | name prefix |
| the session record | `src/services/rireki/rireki.ts` (three places) | name prefix |
| usage counting | `src/services/counting/rollup.ts` | name prefix |
| pane → session | `src/wipeboard-cli.ts` | name prefix |
| ending a session | `killSessionTree()`, `src/tmux.ts` | tmux `session_group` |
| bare `tmux ls` | — | **nothing** |

**The session max never counted viewers.** The guard sits inside `createSession()`, viewers
are made by `createViewer()`, and the count that feeds the guard filters the prefix out. A
crowd of viewers cannot refuse you a launch.

## Is there one session-identity resolver?

**A resolver exists, is not named as one, and is not reused.**

`sessionOfPane()` in `src/tmux.ts` is the real thing: hand it a pane and it returns the
session that is not a viewer, which is exactly the question. Harakiri already depends on
it — an agent asking to die offers only the pane it is sitting in, and Ronin decides what
that means, which is how the request stays blind to how dying works.

But the same rule is open-coded in six other places (the table above), each starting from
`tmux list-sessions` and filtering the prefix itself, and the one job that most needs a
canonical answer — delivering a message to a named session — does not go through any of
them.

So this is a smaller problem than "Ronin has no resolver": the resolver is written, tested
by use, and merely unpromoted. What it lacks is a name, a home, and the two other
directions — name → durable key, and pane → durable key — that a delivery contract would
need before it could verify a target is still the session it was addressed to.

## What is not controlled today

- **There is still no hard cap.** In practice a session now holds about one viewer per
  live tile, because a dead socket is detected within one heartbeat interval — but nothing
  refuses the hundredth viewer if something goes wrong upstream of that.
- **A session ended outside Ronin leaves its viewers behind.** `killSessionTree()` is the
  one safe kill; a bare `tmux kill-session` on the real name orphans the group, and no
  heartbeat helps because the browser is still happily attached.
- **The prefix rule is written seven times.** Not a defect today. It is the reason a new
  surface can silently forget to filter.

One further change would make the count self-correcting, and it is not written:

- **Sweep unattached viewers on a timer.** A viewer exists only to be attached, so a viewer
  with no attached client for more than a grace period is garbage by definition — a rule
  that needs no bookkeeping and cannot misfire on a real session, since real sessions are
  legitimately unattached all the time. It would catch every orphan route at once, not just
  the disconnect the heartbeat covers.

The health checklist for the tmux server itself is `ronin_sops/tmux_server.md`.
