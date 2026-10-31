# Jira

Pair a Desk with one Jira space. What Jira assigns to Ronin's account comes in as work items;
what Agents do goes back to Jira. It needs **Services › Jira** on; with it off, the panel
says so.

Open **Settings** and press **Jira**. Open it before you start in Atlassian, so the token
goes straight into the panel when you make it.

Every section folds, and stays as you left it.

## How it runs

The panel's first section is three switches, one per direction of travel, each with a line
saying what it does. Before **Connect**, Polling and Assigned items start on and Ronin's items
starts at **Off**, so nothing made in Ronin goes up until you say your items are ready;
Connect uses whatever they are set to. Change them any time after; what waited while a switch
was off goes when it comes back on:

- **Services › Jira** (Installations) is the master switch; off, nothing moves.
- **Polling** (down, Jira → Ronin): Jira is read every minute while Ronin is open in a
  browser, and hourly otherwise. Off, only **Sync now** reads it. What Jira changed always
  comes in; the other two switches never hold it back.
- **Assigned items** (up, Ronin → Jira): changes to items that came from Jira go out to Jira.
  Off, they stay in Ronin.
- **Ronin's items** (up, Ronin → Jira) is a pick of three: **Off** sends nothing made in Ronin;
  **Under an epic** sends epics and everything under them, while items with no epic stay in
  Ronin; **All** sends every item. Sent items are created on Jira, assigned to the account,
  and their changes go out. Widening it sends what newly qualifies, parents first. An item
  that came from Jira is never created there again.
- **Sync now** always reads: the space checked, one read, what is waiting sent, and the check
  for items gone from Jira.

## The key is the id

A paired item's Ronin id is its Jira key (`KAN-65`), so Agents and Jira users say the same
name. An item from Jira comes in with its key. An item made in Ronin is `w101` until the sync
that creates it on Jira renames it; a key changed in Jira (the space's key renamed, the item
moved) renames it the same way. Children, links and holders follow, and each holder is told:
"w101 is now KAN-65 (its Jira key); nothing to do." Without a connection, items
stay `w101`.

## Jira wins

Jira is the source; Ronin keeps the item as Jira had it at the last sync, and compares.

- **A change in Jira** replaces the Ronin item at the next read, and its holders hear of it
  as of any change.
- **A change in Ronin** goes up at once, but only if Jira has not changed the item since the
  last sync. If it has, Jira's item replaces Ronin's and each holding Agent is told: "KAN-27
  changed on Jira (by jira:Alice); your change was not sent. Read the item and redo it if it
  still applies."
- **Jira fields** come in only: Sprint, Due date, Rank, Reporter, Created, Resolved, Story
  point estimate, Labels, Components and Fix versions, by Jira's names, the ones Jira fills.
  A Sprint or Due date change reaches the holders as any Jira change does; Rank and the rest
  are refreshed quietly. Ronin never sends them.
- **Comments and attachments** are only ever added, so each goes across once, both ways. A
  Jira attachment shows on the item as its Jira link; it stays in Jira. An Agent's file is
  uploaded. Editing a comment, or removing an attachment, stays in Ronin.
- **Agent links**: each Agent holding the item has a link on the Jira item that opens its
  chat; it goes when the Agent lets go.
- **Jira down, or a token expired**: the panel says **Sync failed** in Jira's own words and
  lists what is waiting to go up. Ronin keeps working and the Agents are not told; every
  tick tries again.
- **Assigned away in Jira**, or deleted there: the pair drops and the item stays in Ronin,
  out of Jira. Assigned back to Ronin, it takes its pair back. A child of a paired item stays
  Ronin's whoever it is assigned to.

## One exact value

Status, kind, priority and link type are the space's own names, exactly as Jira writes them;
anything else is refused, and the refusal names the ones there are. Unconnected, they are
Jira's defaults (To Do, In Progress, In Review, Done; Epic, Task, Story, Bug, Feature,
Subtask; Highest to Lowest, Medium by default; Blocks, Relates, Duplicate, Cloners). Check
reads the space's own; a list Jira will not give keeps the last one read, or Jira's defaults,
and the Sync section says so. The level is the kind's: an epic is 1, a subtask -1, the rest 0.
Ronin never closes a Jira item: a hand-in moves it to In Review, if the space has that
status; promotion leaves it as it is; it is Done when the Jira user moves it there, and that
comes back with the next read.

## Connect

The panel lists the Atlassian steps:

1. In Jira, open the space you want Ronin on. The address bar gives the Site URL (up to
   `.atlassian.net`); the space key is the short code before every work item number (`KAN`
   in `KAN-1`).
2. admin.atlassian.com › your organization › **Directory › Service accounts › Create a
   service account**. Any name, 6–30 characters. On **Select app roles**, give Jira the
   role **User** and leave every other app at **None**.
3. Open the account › **Create credentials › API token**. Any name. Expiry is up to 365
   days; the **Review** page shows the date.
4. Scopes: `read:jira-work`, `write:jira-work` and `read:jira-user`. Scopes cannot be
   changed later, so a missing one means a new token.
5. On a Free site, nothing to do. On a paid site, in the space: **Space settings › Access**,
   add the account as **Member**.
6. In Jira, **Settings › Work items › Work item linking › Activate**, if it is off.

Then fill in **Site URL** (the address you open Jira at, up to `.atlassian.net`; with or
without `https://`, and anything after it is ignored), **Space key** (the space's short code,
not its name: `KAN` in `KAN-1`),
**API token** and **Token expiry**, and press **Connect**. Ronin checks them and says what
to fix, keeps the token with Services (it is never shown again), and runs the first sync.
Until every check passes the campaign is not connected: the panel shows these fields again,
filled with what you entered (the token aside), and what to fix above them.
It first puts on the space, assigned to the account, what **Ronin's items** says: nothing,
the epics and everything under them, or every work item. Then assign one work
item to the account in Jira and press **Sync now**.

## Connected

- **Connection**: the site, space, account and token expiry. 14 days before the expiry the
  panel warns; make a new token, paste it in **Replace token** with its date, then revoke the
  old one in Atlassian. **Disconnect** drops every pair; nothing is deleted on either side.
- **Check** runs the connection checks again and reads the space's names. **Sync now** is
  described above. Connect, Check, Sync now and a change to the switches show at once where
  you pressed: the button says it is busy, a line says what is running, and then what came
  of it.
- **Sync**: the last check, the pair count, how many items are waiting to go up, and, when
  the last sync failed, **Sync failed** with Jira's message and each waiting item.
- **Work items by level**: a table of the Desk's items in Work Items order: each epic heads
  its group, then its items, then their subtasks, marked with a tree; items with no epic come
  last under their own head. Columns: level (1, 0 or -1), kind, id, title, status, where it was
  created, and holders (each Agent a link). The id is the item's one id: once it is on Jira,
  its key, as a link; until then its w id, with a quiet "goes up" if **How it runs** sends it,
  or "stays in Ronin" if it does not. A line above
  counts them: on Jira, to go, staying in Ronin. Before Connect the table follows the switches
  as you set them. Press an epic's row (or the **No epic** row) to fold its group; the fold is
  remembered. The title wraps in a narrow column. The Level, Kind, Status and Created in
  headers filter: press one for its values, each with a tick box; untick a value to hide
  it (Done under Status, say) and tick it to show it again. A shown item keeps
  its epic and parent as context, the count line says how many are hidden, and the filters
  are remembered in both places. **Open** puts the same table full width in the other workspace, at the same
  density; it repaints with the panel after Connect, Sync now or a change to the switches. Its
  **Refresh** says Refreshing… while it reads, then the time it finished, or what failed.
- **Pairs**: one row per paired item, with its Jira key (a link), Ronin id, title, level and
  kind, where it started, its status, holders
  (each Agent a link), flagged, when a change last came in from Jira and last went out to
  it, and what it has waiting to go up. Filter the rows, or **Re-sync** one. **Open** puts the same table
  full width in the other workspace, with the same filter; a Re-sync on either repaints both.
