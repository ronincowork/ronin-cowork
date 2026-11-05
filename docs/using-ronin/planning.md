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
- **Epics:** usually one per Team. Each has **what done looks like**: something a person can see
  or try, clear enough that the Team knows when to stop. This text is the epic's objective,
  word for word.
- **Not started yet:** later parts stay paragraphs, not epics.

## Size

| The work | Plan | Epics | Teams |
|---|---|---|---|
| Small | short | one | one |
| Large | the same template | several | roughly one per epic |
| Larger still | the same template | several | several, plus an epic_lead to keep them on the objective |

## Status

| Status | Means | Set by |
|---|---|---|
| **Draft** | being written with the user; rewrite it as often as you like | `plan write` |
| **Ordered** | the user said yes; not rewritten; the epics are made from it | `plan order` |

The status is the line under the title, `Status: Ordered · 2026-11-05 · pm_lead`. The tool
writes it; anything you put there is replaced.

## The plan tool

```text
plan ls [--status Draft|Ordered]          the Workspace's plans: name, status, date, by
plan read <name>                          one plan, whole; <workspace>/<name> reads another Workspace's
plan read --template                      the blank to fill in
plan write <name> [--file <path>]         create a plan, or replace one; it keeps its status (stdin without --file)
plan order <name>                         Draft → Ordered: not rewritten from here
```

- The Workspace is your Team's. On several Teams, or none, add `--workspace <name>`; the tool
  names the ones to choose from.
- A name is lowercase letters, digits and `-`.
- The tool doesn't stop a write to an Ordered plan; don't make one. The work runs on the epics:
  change the epics instead.
- Where the plans folder is in Git, each write and order is one commit of that file, pushed
  when the branch has an upstream.
- The Docs pane's **Plans** shelf lists the Workspaces' plans by status.

## From plan to epics

1. `plan order <name>` once the user agrees it.
2. Each Team's lead gets its row of the plan.
3. The lead makes its epic: the title, and what done looks like as the objective. It attaches the
   plan: `item attach <epic> plan:<name>`. The epic's record and Docs open it from there.
4. The work runs on the epics. A change of scope changes an epic; the plan stays as ordered.

## Don'ts

- Don't keep it current. It is the plan as agreed, not the state.
- Don't list items. Items are made with the work, under the epics.
- Don't copy the epics' progress into it.

## The template

```markdown
# <Project name>

Asked by <who>. The plan is not updated: what is live is on the epics.

## Objective

What this piece of work is, and why. Two or three paragraphs: the outcome someone will see
when it is finished, and what it is not.

## Teams

The recommended structure to start with. The leads may change their Teams as the work shows.

| Team | Lead | Agents to start | Skills |
|---|---|---|---|
| <team> | <lead> | <how many> | <what they need to be good at> |

Epic lead: <name, or "none": only when several Teams must stay on one objective>.

## Epics

One per Team, usually. Each row becomes an epic, made by the Team's lead with this text.

| Epic | Team | What done looks like |
|---|---|---|
| <title> | <team> | <what someone can see or try when it is finished; clear enough to stop at> |

Not started yet: <paragraphs for the parts that come later, or "none">.
```
