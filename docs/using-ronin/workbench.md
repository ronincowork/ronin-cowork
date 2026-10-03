# Workbench — finding and arranging your work

A **workbench** is one fixed page format: two or four workspaces and one discovery column.
Ronin has Campaign, Cowork, Team, and Setup workbenches. Setup fixes Presets in workspace 1
and opens its ordered selector surfaces in workspace 2; the other workbenches retain their
ordinary two/four arrangement.

This is the guide for an Agent using Ronin. It explains where things are and how to find
them. The implemented builder contract lives in Ronin Cowork's
[Workbench construction document](../architecture/workbench.md); you do not need its
frontend, data-loading, or state details to use a Workbench.

The vocabulary comes from `ronin_catalogs/lexicons/professional_en.md`. In particular:

- the **coworkspace** is the whole Ronin interface;
- the **workbench** is this page format inside it;
- the **discovery column** (`selector_column`) offers surfaces available here;
- a **workspace** is a numbered place that holds one surface;
- a **surface** (`workspace_surface`) is the thing opened in that place;
- the **surface head** is the permanent top row of that surface.

If this guide and [KOTOBA](../../KOTOBA.md) disagree, flag the difference. Do not invent a replacement word.

## Library, profile, tenant

The four destinations reuse one Workbench implementation; they are profiles and tenants,
not four layout systems.

- `Workbench.library` is the one reusable catalog of surface types.
- `Workbench.profile(name)` lists which library types the selector may expose.
- The tenant says what is being screened: a Campaign, Teams collection, Team, Agent or Session.
- Tenant data filters or parameterizes a library type; it never changes the frame.

| Tenant context | What a profile may expose from the library |
|---|---|
| Campaign | Campaign settings and Campaign-level resources |
| Teams collection | Teams, Agents, shared resources, and creation surfaces available in the selected Campaign context |
| Team | that Team's Agents, Commons, Trello view, and launch surface |
| Agent | Self, Documents, Team membership, and separate Task Managers for the Agent's Teams |
| Setup | pinned Presets plus Register, providers, roots, Services, gbrain, and Templates |

On the Cowork and Desk workbenches one card reads the work items: **Trello view**. The button at its top left says which
view you are in, **View by: Status** or **View by: Board**, and switches to the other. It is laid out like a
Trello board: Status shows one list per stage, its items grouped under each board's name;
Board shows one list per board, its items grouped under each stage's name. Each list shows
its count at the head and **Add a work item** at the foot, which starts the new item in that
list. In Board view, **Unfiled** always sits at the far right in its own shade, and **Add
board** after the boards starts a new one. On a Team's workbench, Add starts on the Team's
own board (else its lead's, else Unfiled); you can still pick any board. On a Team's
workbench the card shows the boards that Team and its Agents work on, plus **Unfiled**, so
unfiled work can be taken on from there; a board added there is held by the Team. In
Board view, drag an item onto another board's list to move it there (what is under it comes
with it), or onto empty space to make it a board of its own: that is how work leaves
Unfiled. On a Team's workbench a board made that way is held by the Team if nobody held it.
An item's **Assign** can also give it to a Team. Press a list's name, a
group's name or an item to open it over the lists. Its buttons at the top right are **Save** (once there is something to
save), **Assign** (pick the Agent or Team that holds it), **Add** (a new item, starting where you
pressed) and **Close**; Escape closes it too. Wherever you add an item, you give its title,
objective, status and board: an existing board, **New board** (the item becomes a board of
its own) or **Unfiled**, the default, for work nobody has filed yet.

On the Cowork and Desk workbenches the **Who** card is the Teams door of the collection: one
stone per Team, and under each stone the boards that Team works on with their items. The
two-line button on its head hides or shows the boards. **Workspace** at the top narrows the
stones to the Teams working in one registered folder. Press a Team to open its profile beside
its boards; press a board for its items; press an item for the item. Escape, or the back stone,
is the way back. What (boards) and Where (folders) follow on the same stones.

Adding another tenant or profile adds no layout implementation. Adding another surface
registers a per-workspace factory in the shared library; any profile may name that type.

The Campaign settings surface holds that Campaign's effective desk configuration. Choosing
a desk-profile template copies its complete settings into the Campaign; after that, the
Campaign's individual settings may be changed without changing the template or depending
on it as a live source.

## The page

A Workbench has one discovery column and two workspace columns. It shows either two or
four numbered workspaces. With four, workspace 3 is below workspace 1 and workspace 4 is
below workspace 2. The discovery column may appear on the left, in the center, or on the
right according to the saved arrangement.

The small surface map in the app bar is the Workbench in miniature. Its blocks show the
current column order and relative widths. Click a block to hide or restore that column,
drag a block to reorder the columns, and drag the divider between the full-size columns
to resize them. The map changes proportion as you resize, so it always shows the actual
arrangement rather than a fixed icon. Ronin remembers order, visibility, and widths
together.

One workspace is selected at a time. Its visible selection mark answers: “Where will the
next surface open?” Selecting a workspace does not change what it already holds.

An empty workspace stays visible and says **Workspace**. It does not fill itself with a
default surface.

## Opening a surface

You can place a surface in either of two ways:

1. Select a workspace, then click a card in the discovery column.
2. Drag a card from the discovery column directly onto a workspace.

The new surface replaces what that workspace was showing. The replaced surface remains
available in the discovery column, so you can open it again.

Each workspace owns its own rendered copy and local presentation state. You may open the
same kind of surface in two workspaces: the second copy does not move, close, reset, or
change the first. Tabs, scrolling, and other local choices remain independent in each
workspace even when both copies read the same underlying data.

## Finding your way back

Ronin remembers the Workbench arrangement for that route: whether it has two or four
workspaces, where its columns sit, which workspace is selected, and what each workspace
holds. Returning or refreshing recalls that arrangement.

Settings first opens with **Defaults** in workspace 1 and **Workspace folders** in
workspace 2. That is only its first-open floor; once rearranged, refresh restores the
remembered arrangement instead of applying the floor again.

Teams first opens with the Team roster in workspace 1 and New Team in workspace 2.

The **Teams** surface is the one list of Teams: each Team is a stone with its objective, how
many Agents it has, and its lead. Press a stone and the stones fold to the left while the Team
opens beside them: its title and objective with **Launch** (open the Team's own workbench),
then three numbered steps. **1 Agents**: lead first, each with its live dot and what it holds,
and **+** at the end to bring in an Agent already running or start a new one. **2 Work items**:
one line per item with its holder and stage bar, the Team's own items first. **3
Configuration**, folded to its kind and model until you open it: the Team's configuration
form, with **Delete team** at its foot. Each step folds or opens from its own heading. Press
the stone again or Escape to go back. Drag a stone into another workspace to open the Team
there.

**Team roster** is the plain list of every Team and every Agent: one heading per Team with its
Launch and delete, one row per Agent with 人 when it leads, its work position, status, context
and model. Drag a row onto a Team's heading to add that Agent to the Team; press a row to
open the Agent in its own tab.

If a remembered surface is no longer available at the current scope, its workspace comes
back empty. Check the discovery column: it is the current answer to what can be opened
here.

## Intentional openings

Some links open a Workbench for a specific task. They may choose its initial surfaces and
selected workspace—for example, **Desk defaults** opens Defaults beside Launch your own.
That intentional arrangement wins for the first opening only. From then on it is an
ordinary Workbench arrangement: moving or replacing surfaces is remembered, and refreshing
returns to the latest arrangement rather than replaying the original link.

An ordinary Workbench link carries no requested arrangement. It recalls what that browser
tab remembered, or uses the Workbench's first-open defaults when nothing has been remembered.

## The permanent surface head

Every discovery column and surface keeps a visible head of the same depth. Depending on
the surface, the head may show a title, a terminal tile head, or a commons tab strip. The
head does not disappear when a surface is empty or quiet.

Use the controls in that head for the surface you are looking at. A workspace remains the
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
shows the Agent's name, its reading toggle, and **メ** — one menu holding that Agent's work
record, docs, mention, output, minimise and close, the same sheet the phone uses. A control
that has nothing to offer, such as Output with no Services, leaves the sheet rather than
sitting there blank.

The reading toggle is a toggle, never a row in the menu. Each press moves on through the
readings this screen offers, and past the last one it returns to the terminal. A desk walks
every reading the record has; a tablet offers Terminal, Chat and Work; a phone is Terminal
or Chat. Notes and the full record stay on the desk.

## Short vocabulary check

> The Team workbench's discovery column offers the Commons surface. Opening it places
> an independent rendered instance in the selected workspace.

If *workspace* and *surface* could be swapped in a sentence without changing its meaning,
the two levels have been mixed: the workspace is the place; the surface is what it holds.
