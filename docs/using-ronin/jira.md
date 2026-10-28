# Jira

Pair a Desk with one Jira space. What Jira assigns to Ronin's account comes in as work items;
what Agents do goes back to Jira. It needs **Services › Jira** on; with it off, the panel
says so.

Open **Settings** and press **Jira**. Open it before you start in Atlassian, so the token
goes straight into the panel when you make it.

## Connect

The panel lists the Atlassian steps:

1. admin.atlassian.com › your organization › **Directory › Service accounts › Create a
   service account**. Any name, 6–30 characters. On **Select app roles**, give Jira the
   role **User** and leave every other app at **None**.
2. Open the account › **Create credentials › API token**. Any name. Expiry is up to 365
   days; the **Review** page shows the date.
3. Scopes: `read:jira-work`, `write:jira-work` and `read:jira-user`. Scopes cannot be
   changed later, so a missing one means a new token.
4. On a Free site, nothing to do. On a paid site, in the space: **Space settings › Access**,
   add the account as **Member**.
5. In Jira, **Settings › Work items › Work item linking › Activate**, if it is off.

Then fill in **Site URL**, **Space key** (the prefix on every work item: `KAN` in `KAN-1`),
**API token** and **Token expiry**, and press **Connect**. Ronin checks them and says what
to fix, keeps the token with Services (it is never shown again), puts every work item in
the Desk on the space assigned to the account, and runs the first sync. Then assign one work
item to the account in Jira and press **Sync now**.

## Connected

- **Connection**: the site, space, account and token expiry. 14 days before the expiry the
  panel warns; make a new token, paste it in **Replace token** with its date, then revoke the
  old one in Atlassian. **Disconnect** drops every pair; nothing is deleted on either side.
- **Check** runs the connection checks again. **Sync now** reads Jira, then retries failed
  writes.
- **Sync**: **Polling** on reads Jira every minute while you are in Ronin, and every hour
  otherwise; off, only **Sync now** reads it. Below it are the last check, the pair count,
  the failed writes and the last error.
- **Pairs**: one row per paired item, with its Jira key (a link), Ronin id, title, level and
  kind, where it started, its status in Ronin and in Jira (as of the last read), holders
  (each Agent a link), flagged, when a change last came in from Jira and last went out to
  it, and failed writes. Filter the rows, or **Re-sync** one.
