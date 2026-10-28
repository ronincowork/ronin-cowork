# Jira

Pair a Desk with one Jira space. What Jira assigns to Ronin's account comes in as work items;
what Agents do goes back to Jira. It needs **Services › Jira** on; with it off, the panel
says so.

Open **Settings** and press **Jira**. Open it before you start in Atlassian, so the token
goes straight into the panel when you make it.

Every section folds, and stays as you left it.

## How it runs

The panel's first section is three switches, one per direction of travel, each with a line
saying what it does. Before **Connect**, Polling starts on and the two up switches start off,
so nothing goes up until you say your items are ready; Connect uses whatever they are set to.
Change them any time after. Each does what it says, with no catch-up when it comes back on,
except that turning **Ronin's items** on uploads the items that were held back:

- **Services › Jira** (Installations) is the master switch; off, nothing moves.
- **Polling** (down, Jira → Ronin): Jira is read every minute while Ronin is open in a
  browser, and hourly otherwise. Off, only **Sync now** reads it. What is read always comes
  in; the other two switches never hold it back.
- **Assigned items** (up, Ronin → Jira): changes to items that came from Jira go out to Jira.
  Off, they stay in Ronin.
- **Ronin's items** (up, Ronin → Jira): items made in Ronin are created on Jira, at Connect
  or when you turn it on, and their changes go out. Off, they stay in Ronin.
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
With **Ronin's items** on, it first puts every work item in the Desk on the space, assigned to
the account. Then assign one work
item to the account in Jira and press **Sync now**.

## Connected

- **Connection**: the site, space, account and token expiry. 14 days before the expiry the
  panel warns; make a new token, paste it in **Replace token** with its date, then revoke the
  old one in Atlassian. **Disconnect** drops every pair; nothing is deleted on either side.
- **Check** runs the connection checks again. **Sync now** reads Jira, then retries failed
  writes.
- **Sync**: the last check, the pair count, the failed writes and the last error.
- **Work items by level**: the Desk's items as a tree, epics with their children under them,
  then the items with no parent. Each shows its Jira key if it is paired, or "goes up at
  sync". Before Connect, it is what Connect will put on the space with Ronin's items on.
- **Pairs**: one row per paired item, with its Jira key (a link), Ronin id, title, level and
  kind, where it started, its status in Ronin and in Jira (as of the last read), holders
  (each Agent a link), flagged, when a change last came in from Jira and last went out to
  it, and failed writes. Filter the rows, or **Re-sync** one.
