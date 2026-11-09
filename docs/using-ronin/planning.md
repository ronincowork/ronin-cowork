# Writing a plan

A **plan** starts the work: someone asks for a piece of work, and the plan turns the ask into
Teams and epics. It is written once, at the start, from the template at the end of this page.
After that the work runs on the epics, and nobody updates the plan. Plans are kept on the
Workspace and reached only through the `plan` tool: you never need their folder.

## Who writes it

The **planner**: usually the lead the user asks, once the user says yes to a plan; or the
owner, or any Agent the owner asks. Fill it in with the user: their words for the objective,
your proposal for the Teams and epics, their yes on what done looks like. Then the epics are
made from it, and the planner is done with it.

## What goes in it

- **Objective:** what the work is and why, as the person who asked would say it. What it is
  not, if that saves an argument later.
- **Teams:** the structure to start with. Three or four Agents and a lead works well. It's a
  recommendation; leads shape their own Teams.
- **Epics:** usually one per Team. Each is a title and a short list of topics.
- **Topics:** the parts of an epic, one bullet each: `Topic: what done looks like`. One line a
  person can see or try, clear enough to stop at. The list is the epic's objective, word for word.
- **Needs:** on a topic only when it waits on someone outside the Team: the owner, an
  account, another Team.
- **Not started yet:** later parts, one bullet each, not epics.

## Size

| The work | Plan | Epics | Teams |
|---|---|---|---|
| Small | short | one | one |
| Large | the same template | several | roughly one per epic |
| Larger still | the same template | several | several, plus an epic_lead to keep them on the objective |

## One epic or several

- **One epic:** one Team can do every topic, and they finish together.
- **Several epics:** a topic needs other skills or another Team, or it ships and is judged on its own.
- **Topics are not items:** no keys, holders or statuses. The Team makes items from a topic
  when it starts it.

## Status

| Status | Means | Set by |
|---|---|---|
| **Draft** | being written with the user; rewrite it as often as you like | `plan write` |
| **Ordered** | the user said yes; not rewritten; the epics are made from it | `plan order` |

The status is the line under the title, `Status: Ordered · 2026-11-05 · pm_lead · Team web-page`.
The tool writes it; anything you put there is replaced. The Team is the one the plan is for: a new
plan takes the writer's Team in that Workspace, a rewrite and an order keep it, and `plan team`
changes it. A plan whose line names no Team is no Team's. A Team's work record shows every plan
of its Workspace with its Team, but only the epics under its own plans.

## The plan tool

```text
plan ls [--status Draft|Ordered]          the Workspace's plans: name, status, date, by, Team
plan read <name>                          one plan, whole; <workspace>/<name> reads another Workspace's
plan read --template                      the blank to fill in
plan write <name> [--file <path>] [--team <team>]
                                          create a plan, or replace one; it keeps its status and Team (stdin without --file)
plan order <name>                         Draft → Ordered: not rewritten from here
plan team <name> <team>|none              the Team the plan is for
```

- The Workspace is your Team's. On several Teams, or none, add `--workspace <name>`; the tool
  names the ones to choose from. On several Teams in that Workspace, a new plan needs `--team <name>`.
- A name is lowercase letters, digits and `-`.
- The tool doesn't stop a write to an Ordered plan; don't make one. The work runs on the epics:
  change the epics instead.
- Where the plans folder is in Git, each write and order is one commit of that file, pushed
  when the branch has an upstream.
- The Docs pane's **Plans** shelf lists the Workspaces' plans by status.

## From plan to epics

1. `plan order <name>` once the user agrees it.
2. Each Team's lead gets its row of the plan.
3. The lead makes its epic: the title, and its topics as the objective. It attaches the
   plan: `item attach <epic> plan:<name>`. The epic's record and Docs open it from there.
4. The work runs on the epics. A change of scope changes an epic; the plan stays as ordered.

## Don'ts

- Don't keep it current. It is the plan as agreed, not the state.
- Don't list items. Topics are the parts; items are made with the work, under the epics.
- Don't write a paragraph where a bullet will do.
- Don't copy the epics' progress into it.

## The template

```markdown
# <Project name>

Asked by <who>. The plan is not updated: what is live is on the epics.

## Objective

- **What:** <the outcome someone will see when it is finished, one or two lines>.
- **Why:** <the reason, in the asker's words>.
- **Not:** <what it is not, if that saves an argument later>.

## Teams

The recommended structure to start with. The leads may change their Teams as the work shows.

| Team | Lead | Agents to start | Skills |
|---|---|---|---|
| <team> | <lead> | <how many> | <what they need to be good at> |

Epic lead: <name, or "none": only when several Teams must stay on one objective>.

## Epics

One per Team, usually. Each becomes an epic, made by the Team's lead; its topics are the
objective, word for word.

### <Epic title> · <team>

- <Topic>: <what someone can see or try when it is done>.
- <Topic>: <…>. *Needs: <who or what, only if outside the Team>.*

## Not started yet

- <a later part, one line>, or "none".
```
