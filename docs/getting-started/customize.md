# Customize Ronin

Change how Ronin looks, the words it uses, and what your Agents are told, without editing
the files Ronin updates. What you change is yours and survives updates.

## What an Agent is told

Every Agent is told three kinds of thing:

- **Facts**: what is true about you and its situation: who you are, its Workspace, its Team,
  its mandate, its task.
- **Behaviors**: how to work. Some reach every Agent; some come with its situation (a Team
  lead, a desk, an integration on); others you add.
- **Tools**: the commands it can run, each told under the behavior it serves.

Each behavior or tool is told at a depth: **Seed** (one line, and where to read more) or
**Full** (the whole text, from the start). Nothing is ever taken away from an Agent: these
choices decide only what it is told.

Its **mandate** is three orders: how far to go (Reach), who to bring in (Recruit) and what to
return (Output), chosen from the Mandate menus. Each value is a file too.

## Choose what Agents are told

The Campaign, Workspace and Team pages each have a **Behaviors** panel, and the New Agent
form has a **Behaviors** step. Each works the same way, for every Agent below it:

- **Integrations**: turn an outside service on; its behavior and tools come with it. Jira is
  turned on or off only for a Campaign or a Workspace; Team and Agent forms don't show it.
- **Project management**: work items, and the guidance for each role. Its own switch, apart from
  Jira: on for the Campaign unless you turn it off, and any Workspace, Team or Agent below can
  turn it on or off for itself.
- **Add**: bring a behavior, fact or tool in, at Seed or Full.
- **Block**: never tell it to any Agent below.
- **Only**: when set, nothing else is told below; a behavior brings its tools.

Each page also shows **An Agent here is told**: what a new Agent there is told, and why.
Agents already working are not changed: each level copies its parent's settings when it is made.

## Write your own

**Customize › Behaviors** lists every behavior, mandate value, fact and tool. Open one to read it.

- **Make my version** on a Ronin file: your copy, in `~/ronin/custom/`, replaces Ronin's by
  name, for every Agent you start, and stays yours through updates. Ronin's later changes to
  that file no longer reach you. That is the one rule of the
  [three places](../../ronin_stock/stock_readme.md#three-places-each-with-one-meaning).
- **New Behavior**, **New tool** or **New bridge**: write your own. A tool is a command you
  already have, on the PATH or in `~/ronin/custom/tools`; Ronin writes what Agents are told about
  it. A bridge is a behavior for one integration, with its tools, told while that
  integration is on.

**◆** marks your own; **◈** marks your version of a Ronin file.

## Appearance and words

- Choose a skin or desk profile in appearance settings. See [skins and words](../operating/skins.md).
- Where there is no editor, ask an Agent to help: it follows
  [shadowing](../architecture/shadowing.md), and `bin/ronin-doctor` finds files Ronin cannot read.

Contributors: [the brief](../architecture/brief.md) and [Customize construction](../architecture/customize.md).
