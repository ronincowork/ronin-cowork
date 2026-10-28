# Jira

Pair a Desk with one Jira space. What Jira assigns to Ronin's account comes in as work items;
what Agents do goes back to Jira. It needs **Services › Jira** on; with it off, the panel
says so.

Open **Settings** and press **Jira**. Open it before you start in Atlassian, so the token
goes straight into the panel when you make it.

Every section folds, and stays as you left it.

## How it runs

The panel's first section is three switches, one per direction of travel, each with a line
saying what it does. Before **Connect**, Polling starts on, Assigned items starts off and Ronin's items starts at
**Off**, so nothing goes up until you say your items are ready; Connect uses whatever they
are set to.
Change them any time after. Each does what it says, with no catch-up when it comes back on,
except that widening **Ronin's items** uploads the items that newly qualify:

- **Services › Jira** (Installations) is the master switch; off, nothing moves.
- **Polling** (down, Jira → Ronin): Jira is read every minute while Ronin is open in a
  browser, and hourly otherwise. Off, only **Sync now** reads it. What is read always comes
  in; the other two switches never hold it back.
- **Assigned items** (up, Ronin → Jira): changes to items that came from Jira go out to Jira.
  Off, they stay in Ronin.
- **Ronin's items** (up, Ronin → Jira) is a pick of three: **Off** sends nothing made in Ronin;
  **Under an epic** sends epics and everything under them, while items with no epic stay in
  Ronin; **All** sends every item. Sent items are created on Jira and their changes go out.
  Widening it (Off to Under an epic, or to All) sends what newly qualifies, parents first.
- **Sync now** always reads: one read, the check for items gone from Jira, and failed writes
  retried.

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
It first puts on the space, assigned to the account, what **Ronin's items** says: nothing,
the epics and everything under them, or every work item. Then assign one work
item to the account in Jira and press **Sync now**.

## Connected

- **Connection**: the site, space, account and token expiry. 14 days before the expiry the
  panel warns; make a new token, paste it in **Replace token** with its date, then revoke the
  old one in Atlassian. **Disconnect** drops every pair; nothing is deleted on either side.
- **Check** runs the connection checks again. **Sync now** reads Jira, then retries failed
  writes.
- **Sync**: the last check, the pair count, the failed writes and the last error.
- **Work items by level**: a table of the Desk's items in Work Items order: each epic heads
  its group, then its items, then their subtasks, marked with a tree; items with no epic come
  last under their own head. Columns: level, kind, Ronin id, title, status, where it was
  created, holders (each Agent a link), and the Jira key as a link, or "goes up at sync".
  Press an epic's row (or the **No epic** row) to fold its group; the fold is remembered.
  **Open** puts the same table full width in the other workspace, at the same density.
- **Pairs**: one row per paired item, with its Jira key (a link), Ronin id, title, level and
  kind, where it started, its status in Ronin and in Jira (as of the last read), holders
  (each Agent a link), flagged, when a change last came in from Jira and last went out to
  it, and failed writes. Filter the rows, or **Re-sync** one.
