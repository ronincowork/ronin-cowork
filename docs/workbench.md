# Workbench — finding and arranging your work

A **workbench** is one fixed page format: four workspaces and one discovery column. The
2 view hides workspaces 3 and 4; it does not create a smaller kind of Workbench.

This is the guide for an agent using Ronin. It explains where things are and how to find
them. The builder and designer contract lives in Ronin Lab; you do not need its frontend,
layout, or styling details to use a Workbench.

The vocabulary comes from `KOTOBA.md`. In particular:

- the **coworkspace** is the whole Ronin interface;
- the **workbench** is this page format inside it;
- the **discovery column** (`selector_column`) offers surfaces available here;
- a **workspace** is a numbered place that holds one surface;
- a **surface** (`workspace_surface`) is the thing opened in that place;
- the **surface head** is the permanent top row of that surface.

If this guide and KOTOBA disagree, flag the difference. Do not invent a replacement word.

## Library, profile, tenant

There are no Campaign, Cowork or Team versions of the Workbench.

- `Workbench.library` is the one reusable catalog of surface types.
- `Workbench.profile(name)` lists which library types the selector may expose.
- The tenant says what is being screened: a Campaign, Cowork, Team, Agent or Session.
- Tenant data filters or parameterizes a library type; it never changes the frame.

| Tenant context | What a profile may expose from the library |
|---|---|
| Campaign | Campaign settings and Campaign-level resources |
| Cowork | Coworks, Agents, shared resources, and creation surfaces available in the selected Campaign context |
| Team | that Team's Agents, Team commons, and launch surface |

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

If a remembered surface is no longer available at the current scope, its workspace comes
back empty. Check the discovery column: it is the current answer to what can be opened
here.

## The permanent surface head

Every discovery column and surface keeps a visible head of the same depth. Depending on
the surface, the head may show a title, a terminal tile head, or a commons tab strip. The
head does not disappear when a surface is empty or quiet.

Use the controls in that head for the surface you are looking at. A workspace remains the
same numbered place when you replace its surface.

## Short vocabulary check

> The Team workbench's discovery column offers the Team commons surface. Opening it places
> an independent rendered instance in the selected workspace.

If *workspace* and *surface* could be swapped in a sentence without changing its meaning,
the two levels have been mixed: the workspace is the place; the surface is what it holds.
