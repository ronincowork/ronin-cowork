# Workbench — finding and arranging your work

A **workbench** is one fixed page format: two or four tilespaces and one discovery column.
Ronin has Campaign (Settings), Setup, New Project, Desk, Cowork, Team and Agent workbenches,
plus the Models, Workspaces, Teams and Help workbenches Ronin Home's doors open. Help seats the
guides in tilespace 1, *Start here: 4 things you need to know* first, then *Getting started* and
*Using Ronin*, each opening to its pages; drag any page into a tilespace to read it there. Mika is
in tilespace 2, opened on her Chat reading so you talk to her as a conversation. Help opens before
any model provider is set up; Mika needs one and says so until then. The Workspaces
workbench seats the Workspaces in tilespace 1 and [Explorer](explorer.md) in tilespace 2, or GitHub CLI
there where Explorer is off. Setup seats its
Garden in tilespace 1 and opens its ordered selector surfaces in tilespace 2; the other
workbenches retain their ordinary two/four arrangement.

This is the guide for an Agent using Ronin. It explains where things are and how to find
them. The implemented builder contract lives in Ronin Cowork's
[Workbench construction document](../architecture/workbench.md); you do not need its
frontend, data-loading, or state details to use a Workbench.

The vocabulary comes from `ronin_stock/lexicons/professional_en.md`. In particular:

- the **coworkspace** is the whole Ronin interface;
- the **workbench** is this page format inside it;
- the **discovery column** (`selector_column`) offers surfaces available here;
- a **tilespace** is a numbered place that holds one surface;
- a **surface** (`workspace_surface`) is the thing opened in that place;
- the **surface head** is the permanent top row of that surface.

If this guide and [KOTOBA](../../KOTOBA.md) disagree, flag the difference. Do not invent a replacement word.

## Surfaces, profile, tenant

Every destination reuses one Workbench implementation; they are profiles and tenants,
not separate layout systems.

- `Workbench.surfaces` is the one reusable registry of surface types.
- `Workbench.profile(name)` lists which surface types the selector may expose.
- The tenant says what is being screened: a Campaign, Teams collection, Team, Agent or Session.
- Tenant data filters or parameterizes a surface type; it never changes the frame.

| Tenant context | What a profile may expose from the surfaces |
|---|---|
| Campaign | Campaign settings and Campaign-level resources |
| Teams collection | Teams, Agents, shared resources, and creation surfaces available in the selected Campaign context |
| Team | that Team's Agents, Commons, Epics, New Agent, New Item (the Epics workbench's New form, started on Task) and Agent composition |
| Agent | Self, Documents, Team membership, and Work Items: the work items the Agent holds across its Teams |
| All Hands | its roster, New Agent, New Team, Archived Agents, Teams, Epics and Find item, each over no Team |
| Setup | Harness, Workspace, Team and Tour, with the Ask Ronin panel |

Adding another tenant or profile adds no layout implementation. Adding another surface
registers a per-tilespace factory in the shared surfaces registry; any profile may name that type.

The Campaign settings surface holds that Campaign's effective desk configuration. Choosing
a desk-profile template copies its complete settings into the Campaign; after that, the
Campaign's individual settings may be changed without changing the template or depending
on it as a live source.

## The page

A Workbench has one discovery column and two tilespace columns. It shows either two or
four numbered tilespaces. With four, tilespace 3 is below tilespace 1 and tilespace 4 is
below tilespace 2. The discovery column may appear on the left, in the center, or on the
right according to the saved arrangement.

The small surface map in the app bar is the Workbench in miniature. Its blocks show the
current column order and relative widths. Click a block to hide or restore that column,
drag a block to reorder the columns, and drag the divider between the full-size columns
to resize them. The map changes proportion as you resize, so it always shows the actual
arrangement rather than a fixed icon. Ronin remembers order, visibility, and widths
together.

One tilespace is selected at a time. Its visible selection mark answers: “Where will the
next surface open?” Selecting a tilespace does not change what it already holds.

An empty tilespace stays visible and says **Tilespace**. It does not fill itself with a
default surface.

## Opening a surface

You can place a surface in either of two ways:

1. Select a tilespace, then click a card in the discovery column.
2. Drag a card from the discovery column directly onto a tilespace.

The new surface replaces what that tilespace was showing. The replaced surface remains
available in the discovery column, so you can open it again.

Each tilespace owns its own rendered copy and local presentation state. You may open the
same kind of surface in two tilespaces: the second copy does not move, close, reset, or
change the first. Tabs, scrolling, and other local choices remain independent in each
tilespace even when both copies read the same underlying data.

## Epics on a Team

A card in a Team's discovery column, after Commons, shows that Team's work. "The Team's
work" is what the Team holds plus what its Agents hold: the same items `team member status`
reads.

**Epics** shows the Team's Epics: those the Team or its Agents hold, and the Epic above
each item they hold, except those Done (find a Done Epic with Find item or on the Epics
workbench). It is a stone per Epic across the top, and the pressed one below it (the Epics
workbench itself is a phalanx of open Epics, each opening on its own page: see
[Running work items](running-work-items.md)). Press another stone to switch to that Epic
on the same card; nothing opens elsewhere. With one Epic, that one is shown.

Under the stones, an Epic shows where it comes from (its Jira key, or Ronin only) and who
holds it, then asks two questions: **Assigned** (**Yes**
for the items an Agent holds, **No** for those only a Team holds or nobody holds, or **All**)
and **Status** (To Do, In Progress and In Review on arrival; pick Done to see it). Under them,
its items as bars, the item island's own, grouped by status: each bar its kind's symbol, key,
title, status, flag and hand-in, then its description, its last comment, and its facts (kind,
holder, the Task it is under, Subtasks, comments, when it last moved). A Subtask follows its
Task. Press a bar to open the item's reading under it (its status, details, comments and a box
to comment); press it again to fold it.

### The Agent pills

On a Team's workbench the discovery column lists its Agents as pills (on a phone, the Agent
rows of the list: [On a phone](#on-a-phone)). Each pill says, at a glance, which of five situations its Agent is in:

| Pill | Situation |
|---|---|
| a small dot after the name | **Working**: mid-turn, a tool out |
| a small ring after the name | **Ready**: its turn ended (or was interrupted) less than 10 minutes ago; it just finished, look at it |
| plain | **Idle**: 10 minutes or more since its turn ended, just born, or not known |
| ⚑ after the name, and amber | **Needs you**: its work record has a flag: an item it holds is flagged, or, for a lead, an item its Team holds; or it is asking (a question, a permission, a plan), has made no progress for 12 minutes, or its CLI stopped |
| dimmed | **Stopped**: its pane died; open it to resume |

When more than one holds, Needs you wins, then Stopped, then Working, then Ready. Hover a pill, or use a
screen reader, for the situation in words.

Each Agent's tile on a Team shows the work items that Agent holds as pills in its header,
in the **item island**: the kind's Jira symbol, the status and the flag, and the item's
description when you press one. See [the tile](tile.md#the-item-island).

## Finding your way back

Ronin remembers the Workbench arrangement for that route: whether it has two or four
tilespaces, where its columns sit, which tilespace is selected, and what each tilespace
holds. Returning or refreshing recalls that arrangement.

Settings first opens with **Defaults** in tilespace 1 and **Workspace folders** in
tilespace 2. That is only its first-open floor; once rearranged, refresh restores the
remembered arrangement instead of applying the floor again.

Teams first opens with the **Team roster** in tilespace 1 and the **Teams** stones in tilespace 2.

The **Teams** surface is the one list of Teams, its stones read like the Epic stones, every one
the same height: the Team's name; its lead (人); ⚑ top right, in amber, while anything open the
Team or its Agents hold is flagged; bottom right, small and grey, how many of its items are not
Done; and along the bottom edge the item lifecycle over everything the Team and its Agents hold,
in the board's colours (To Do, In Progress, In Review, Done; press it for the counts). A Team
holding nothing has no line. Flagged Teams come first, then by name.
**Workspace** narrows the stones to the Teams in those Workspaces. Agents outside any Team are one
more stone, **No Team**, last and plain, while there are any.

Press a stone and the Team opens in place of the stones, a kaki **−** at its top right to go back to them, in the bar an
Epic has on its own page: its name with **Launch** (the Team's own workbench; No Team's opens one
workbench for those Agents), its concept in full and its item lifecycle along its foot. Press the Team's bar and its **Configuration** opens under it (the Team's configuration form, **Delete team** at its foot); press it again to close it. Under it, two lines that expand and collapse, each with its count in brackets: **Agents**, open on arrival (one stone per
Agent, as the Epics are: the lead's first, then flagged ones, then by name; each stone its name,
Team lead or Coworker, its ⚑ and open count, its progress line). Press a stone and the Agent opens
in place of the stones, a **−** to go back to them: the same bar as the Team's, its name (人 for the
lead), at the right how many open items it holds and one mark, ⚑ in amber when flagged (the bar
takes the pill's amber), otherwise the pill's dot, solid while working and hollow just finished;
its objective (what its work record states); its progress line along its foot. Under the bar, two
lines that expand and collapse: **Work items held** (the Epic page's bars over what it holds),
closed until pressed, and **Configuration** (the Agent's own: name, mandate and the rest, with
Save), open on arrival.
An Agent is added to a Team where Agents are made, not here), then, closed until you press it, **Epics** (the
Team's open Epics as Epic stones, each with its progress line; press one to read it in their place,
with **Launch** to its own page). No Team has its Agents only. The **−** or Escape goes back one step. The
selector has a card per Team that places the same Team in the selected tilespace, and a stone
dragged into another tilespace does the same.

**Team roster** is the plain list of every Team and every Agent: one heading per Team with its
Launch and delete, one row per Agent with 人 when it leads, its work position, status, context
and model. Drag a row onto a Team's heading to add that Agent to the Team. A Team launches
from its heading; an Agent does not launch from here: press its row and the Agent opens under
it, press again to close. Open, it shows **Team Lead**, its Team's lead, where you pick another
of the Team's Agents to make lead, then its **Configuration** (name, mandate and the rest, with Save).

If a remembered surface is no longer available at the current scope, its tilespace comes
back empty. Check the discovery column: it is the current answer to what can be opened
here.

## Intentional openings

Some links open a Workbench for a specific task. They may choose its initial surfaces and
selected tilespace—for example, **Desk defaults** opens Defaults beside Launch your own.
That intentional arrangement wins for the first opening only. From then on it is an
ordinary Workbench arrangement: moving or replacing surfaces is remembered, and refreshing
returns to the latest arrangement rather than replaying the original link.

An ordinary Workbench link carries no requested arrangement. It recalls what that browser
tab remembered, or uses the Workbench's first-open defaults when nothing has been remembered.

## The permanent surface head

Every discovery column and surface keeps a visible head of the same depth. Depending on
the surface, the head may show a title, a terminal tile head, or a commons tab strip. The
head does not disappear when a surface is empty or quiet.

Use the controls in that head for the surface you are looking at. A tilespace remains the
same numbered place when you replace its surface.

## The header and the Agent tools on a tablet

On a wide touch screen — an iPad keeps the workbench rather than the phone document — the
application header folds away to give the work below more room. The chevron rides inside
the dynamic island at the top of the screen, next to the name the island is showing.

Collapsing takes the whole header, island included. The chevron stays: it docks to the top
edge of the screen, in the island's own colours, sitting over the head of the work surfaces
so it is always within reach. It is deliberately a little in the way — it is how you get the
header back. Tap it again and the header returns exactly as it was.

An Agent's head keeps the same depth as the surface heads beside it, and stays one row. It
shows the Agent's name, its reading toggle, **メ** and −. メ opens one menu over the tile —
send a file, mention, output, the work record and the Agent's configuration (each a full overlay over the tile), its docs, and Delete or archive —
the same menu on a computer, a tablet and a phone. A choice that has nothing to offer, such
as Output with no Services, is left out rather than shown blank.

The reading toggle is a toggle, never a row in the menu. Each press moves on through the
readings this screen offers, and past the last one it returns to the terminal. A desk walks
every reading the record has; a tablet offers Terminal, Chat and Work; a phone is Terminal
or Chat. Notes and the full record stay on the desk.

## On a phone

A phone opens on one list of every Agent or item in the office. Buttons across the top choose
what it shows:

| Button | What it does |
|---|---|
| **Kind** | What each row is: **Agent**, **Lead** (Agents who lead a Team) or **Item** |
| **Sort** | **By type**: one card per Team, Epic or Workspace. **By active**: one card each for **Flagged**, **Active** (working now), **Recently active** (finished in the last ten minutes) and **Everyone else**, in that order |
| **Type** | Shown only with **By type**: what the list is grouped by, **Team**, **Epic** or **Workspace** |

Press a card to open it in place, with its rows underneath; press it again to close it. More
than one can be open. An open Team card also has **Docs** (the Team's documents) and **＋ Launch
New Agent** under its rows. The phone remembers the three choices and which cards are open.

An Agent sits under an Epic when it holds the Epic or an item under it, so it can appear under
more than one. An Agent's Workspace is its Team's; an item's is that of whoever holds its Epic.
An item's row shows its holder's situation.

Press an Agent to open its tile; back returns to the list. Press an item to open it on its own
screen: the same reading as on a desk, with its status to move, its Agents (each opens that
Agent's tile), its Subtasks (each opens its own screen), comments and a box to add one, and its
attachments (each opens in Docs). Back returns to where you came from.

## All Hands

**All Hands** (on Home the broad slab under Teams, Epics and Workspaces, the office-wide way in; `#/allhands`) is the phone's list on a desk, as a workbench with
two tilespaces. Tilespace 1 opens on the same list, with the same **Kind**, **Sort** and (By type) **Type**;
every group starts open and closes when pressed (it remembers the ones you closed); Tilespace 2
starts empty. Each row carries the same mark as an Agent's card on a Team's selector: ⚑ when
flagged, the working dot (hollow just finished), muted when stopped. Press an Agent and its tile
opens in the selected tilespace; press an item and it opens there on **Find item**. When the
list's own tilespace is selected, what you press opens in the first empty tilespace on screen (with
two or four), else the one beside the list. Drag a row instead and it opens in the tilespace you
drop it on, any of the four; under **Type: Epic**, an Epic's group drags as that Epic. The list is a card in
the selector too, so it can be put in either tilespace. The selector is for the whole office:
**New Agent**, **New Team**, **Archived Agents**, **Teams** (every Team as a stone, as on the Teams
workbench), **Epics** (every open Epic as a stone) and **Find item**, none of them tied to a Team.
Drag a Teams stone, or a Team's group under **Type: Team**, and that Team opens where you drop it.

## Short vocabulary check

> The Team workbench's discovery column offers the Commons surface. Opening it places
> an independent rendered instance in the selected tilespace.

If *tilespace* and *surface* could be swapped in a sentence without changing its meaning,
the two levels have been mixed: the tilespace is the place; the surface is what it holds.
