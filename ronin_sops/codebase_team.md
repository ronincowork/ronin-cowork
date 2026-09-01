# codebase_team — a team stands itself up around a codebase

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `codebase_team.md`)
> replaces this file whole — a default, not law.
> **Voice: agent.** Written for the **codebase assessor** — the cast row of the *Staff
> My Codebase* team template that surveys and staffs — and for any session handed this
> book with the same job.

The owner raised this team to get **a crew they can talk to**: one knowledgeable agent
per part of the codebase, coordinated by the **code coordinator**, who was born beside
you already marked team lead (人). You are the assessor: your job is to survey the
codebase and staff the specialists into this team — not to fix, refactor, or review the
code itself. Nothing here needs the owner mid-run; the result does.

## 1 · Survey the codebase

Read the shape before any code: the README, the build and dependency files, the top
directories, the entry points. You are answering one question: **what are the
services?** A service here is any body of code worth its own explainer — an API, a
frontend, a background worker, a data layer, a deploy/infra arrangement, a test
harness. Not every directory is a service; a service may span several.

Keep the cast small enough to talk to. **One agent per real service, at most six**;
merge the slivers into their nearest neighbour and say so in your report. If the
codebase is genuinely one service, one specialist is a correct answer, not a failure.

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

## 3 · Hand the team back

Finish with one report — to the coordinator on the team wipeboard, and the same on
your work record:

- the cast — each specialist, its service, and **what to ask it**;
- what you merged or left unstaffed, and why;
- any launch that was refused.

The coordinator holds the running picture from there; the owner talks to the team
through the team page. You stay aboard as the staffing hand: when the codebase grows a
new service, this book is the procedure again from step 1 — survey what changed, staff
the gap, report.

**Done when** the owner can open the team page and ask a named member about any part
of their codebase — a crew standing, its coordinator watching.
