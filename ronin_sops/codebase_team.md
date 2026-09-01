# codebase_team — one agent lands, a team stands up

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `codebase_team.md`)
> replaces this file whole — a default, not law.
> **Voice: agent.** Written for the one session that lands on a codebase to build the
> team around it — the *Staff My Codebase* launch, or any session handed this book.

The owner has pointed you at a codebase and wants **a team they can talk to**: one
knowledgeable agent per part of the system, and a lead who watches the whole. You are
the first member. Your job is to survey, staff, and hand the team back — not to fix,
refactor, or review the code itself. Nothing here needs the owner mid-run; the result
does.

## 1 · Survey the codebase

Read the shape before any code: the README, the build and dependency files, the top
directories, the entry points. You are answering one question: **what are the
services?** A service here is any body of code worth its own explainer — an API, a
frontend, a background worker, a data layer, a deploy/infra arrangement, a test
harness. Not every directory is a service; a service may span several.

Keep the cast small enough to talk to. **One agent per real service, at most six**;
merge the slivers into their nearest neighbour and say so in your report. If the
codebase is genuinely one service, a team of one specialist plus the monitor is a
correct answer, not a failure.

## 2 · Staff one agent per service

Record the plan on your work record first, then raise the sessions one at a time:

```bash
tejun-session-set <service_name> --prompt "<its brief>"
```

Name no team — each newborn joins YOUR team. Every brief carries the same three
things, filled in for its service: **what it owns** (the service and its paths), **what
it is for** (know this service well enough to answer the owner's questions about it,
trace faults into it, and propose changes), and **how it reports** (findings on the
team wipeboard only when they collide with another service; progress on its own work
record). A `REFUSED: <why>` verdict is an answer — report it in your hand-back rather
than retrying with a different shape.

## 3 · Raise the monitor

Raise one more session, after the specialists so it has a team to watch. Its brief:
**monitor, never build** — read the team's work records and wipeboard, keep a current
picture of who is doing what, flag collisions and stalls, and report the team's state
to the owner when asked. Give it the `ways:quarter_back` book.

Then ask the owner, in your hand-back, to mark the monitor as team lead — the 人 is
the owner's hand by rule, one click on the team page, and it should sit on the session
whose whole job is the watching.

## 4 · Hand the team back

Finish with one report to the owner, and the same on your work record:

- the team's name and the cast — each member, its service, and **what to ask it**;
- what you merged or left unstaffed, and why;
- any launch that was refused;
- the ask: designate the monitor as 人.

You stay on the team as its builder: when the codebase grows a new service, the owner
tells you, and this book is the procedure again from step 1 — survey what changed,
staff the gap, report.

**Done when** the owner can open the team page and ask a named member about any part
of their codebase — a team to talk to, standing, with its watcher named.
