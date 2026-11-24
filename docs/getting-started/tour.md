# Ronin Tour

How your Agents begin, how the work runs, and the questions people ask first. Nothing here needs
configuring to start; skip it and come back whenever you like. Anything else: **Ask Ronin**.

## How your Agents begin

### Two kinds of Agent

- **Cowork Agent** (the default). It starts with Ronin's instructions, its brief: who is on its
  Team, how to message the others, how to hand in work and keep its items true. Best for Teams.
  What the brief holds: [the tile](../using-ronin/tile.md) shows it on the Agent's work record.
- **Bare-metal Agent.** The harness exactly as it comes, with nothing from Ronin. It knows nothing
  about the Team or its tools unless you tell it. Best when you want the tool untouched; start one
  any time from a Team's page.

Not sure? Leave Cowork on.

### The Ronin toolkit

Cowork Agents already know it.

1. **They talk to each other.** An Agent can message another directly, post a note to its Team's
   wipeboard, or share a document for the others to read. For every Team.
   [Team lead and edges](../using-ronin/team-lead-and-edges.md).
2. **They hand in work for review.** Each Agent codes in its own worktree. Finished work is
   handed in, the Team lead reviews it, and only then is it promoted to the shared branch. Mostly
   for coding Teams. [Workspaces](../using-ronin/workspaces.md#bring-in-a-repository).
3. **They track the work.** Epics hold the larger pieces; work items track who is doing what, as
   in Jira. Keep them in Ronin, or connect your Jira. [Work items](../using-ronin/work-items.md),
   [Jira](../using-ronin/jira.md).

## How the work runs

Teams do the work. Epics and items keep track of it.

- **Teams.** A group of Agents on one piece of work, in one Workspace, usually with a lead who
  coordinates the others. Find them behind **Teams** on Ronin Home. [New Team](../using-ronin/new-team.md).
- **Agents.** One harness session each, shown as a tile. Watch it as a terminal, or talk to it in
  Chat. On each Team's page. [The tile](../using-ronin/tile.md).
- **Epics.** One part of the plan, with what done looks like, given to one Team. Find them behind
  **Epics** on Ronin Home. [Work items](../using-ronin/work-items.md).
- **Items.** One task someone is doing now: in progress, in review, waiting on you, or done. On
  the epic, and on each Agent's work record. [Work records](../using-ronin/work-record.md).

### Giving your Team work

Open your Team, press its lead's tile, and say what you want in its Chat or terminal. A Cowork
lead splits it into items and shares them out.

### When you come back

Agents keep working while you are away: closing the browser does not stop them. When an Agent
needs your answer, it raises a ⚑ on its item, and its Team and tile show it is waiting on you.
To stop one safely, see [Terminal controls](../using-ronin/terminal-controls.md).

## Questions

**What is the difference between a harness and a model?** A model is the AI itself, like Claude
or GPT. A harness is the tool that runs it as an agent, like Claude Code or Codex: it reads files,
runs commands and keeps a conversation. In Ronin you connect harnesses, and each uses the models
its provider offers. [Provider sign-in](provider-sign-in.md).

**Do I pay Ronin for model use?** No. Your Agents run on your own subscription or API key, signed
in directly with the provider. Ronin never resells model access or sits in between. The Helpful
Assistant runs on your own key or harness when you have one, else on Ronin models.

**Can I add another harness later?** Yes, any time, on **Harnesses** on Ronin Home. A second one
keeps Agents working when one hits a limit or an outage.

**What is a Workspace?** One project: what it is, then the folders and repositories its Agents
work in. Every Team works in one. [Workspaces](../using-ronin/workspaces.md).

**Do I need GitHub?** Only for your private GitHub repositories. A public repository from any
Git host clones with no sign-in.

**What is a worktree?** Each Agent's own copy of a repository and its own branch, so Agents never
collide; finished work is handed in for review.

**Can Agents push to my main branch?** Not in a Reviewed repository: work is handed in to the
Team lead, who promotes it to the working branch. A Direct repository is worked on in place.

**Cowork or bare-metal: which should I choose?** Cowork, unless you want the harness untouched.
[How your Agents begin](#how-your-agents-begin).

**What happens when an Agent hands in work?** It goes to its Team lead for review; the lead
promotes it or sends it back. [Work items](../using-ronin/work-items.md).

**How do I answer an Agent that is waiting on me?** Its item and tile show a ⚑. Open its tile and
answer in Chat, or in the terminal when Chat says so.

**Terminal or Chat: which should I use?** Chat for talking; Terminal for anything Chat cannot
answer, like a menu in the harness. [The tile](../using-ronin/tile.md).

**How do I connect Jira?** Open **Settings** and press **Jira**; it needs Services › Jira on. [Jira](../using-ronin/jira.md).

The words Ronin uses, and every guide: [Ronin's documentation](../README.md).
