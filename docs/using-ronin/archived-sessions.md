# Archived sessions

Archive stops an Agent so you can later resume its provider conversation. The Agent is no
longer running and does not occupy a place in the live roster.

An archive is there to undo an accidental close, not to keep old work: it lasts **7 days**.
After that Ronin removes it, with its session folder, as a Hard Delete of the archive would.

## Archive and restore

1. Open the Agent's close/delete action and choose **Archive**.
2. If it owns an open managed worktree, hand off or finish that worktree first; the message explains
   what prevents archiving.
3. Restore it from either place:
   - **On its Team's workbench:** press **Rehydrate Agents** in the Team's selector. It opens
     the archived sessions list holding only that Team's archived Agents, newest archived first.
   - **On the Teams workbench:** press **Rehydrate Archived** for every archive on this machine.
     Sort by **Recently archived** (the default: newest first, the Team on each line) or by
     **Team** (grouped by Team, newest first inside each).

   Each row has **Rehydrate**; the Agent's terminal opens in that workspace.

### When the pane is stuck or dead

An Agent whose pane has hung, or whose process was killed (out of memory, say), cannot close
out its worktree. Delete would refuse and Hard Delete would lose its uncommitted work. Archive
it past the desk check instead:

```
session_archive <name> --ignore-desks
```

Every worktree stays exactly as it is: its files, uncommitted changes, branch and owner. The
archive records which were left open, and `session_restore` brings the Agent back to those same
worktrees. A dead pane archives like a live one. `--ignore-items` can go with it. If the
archive expires instead, Ronin removes only the archive and its session folder, never a
worktree, and the lead's notice names the worktrees still open.

An Agent that ends itself with `session_end` (as it does once its last item is Done) is
archived the same way, after its worktrees close. An Agent that ended too early is therefore
in **Archived**, or its lead recalls it with `session_restore <archive-id>`: the lead's notice
of the end names the id and that command. `session_restore` with no argument lists the
archives there are, newest first (name, team, when, id) with the line that restores each. Its work items went to the Team as on any ending;
once restored it takes back the ones it wants. Only a conversation Ronin cannot resume ends
outright.

Ronin needs an exact conversation identity and a supported provider resume operation.
Claude and Codex have that integration. If Ronin cannot identify the conversation safely,
it refuses before stopping the Agent. Installing a provider does not imply it supports archive.

Restore requires that provider CLI and its own saved history. If the old session name is
already in use or restoration fails, the archive remains available for recovery.

## Archive, delete, or hide

- **Archive** preserves a resumable record and stops the Agent.
- **Delete** checks assigned worktrees and closes safe, handed-in work before ending the Agent.
  It reports blockers instead of discarding unfinished work.
- **Hard Delete** is the separately confirmed destructive option. Read its exact target and
  consequences before confirming.
- **Hide/close view** removes the tile from view; the Agent keeps running.

Archive, Delete and Hard Delete each stop once while the Agent holds a work item In Progress
or In Review it has not flagged, and the confirm names them: "<name> holds KAN-12 (In Review),
not flagged: finish or flag it and hand in its desks first, or close anyway". Close anyway
gives each to the Team, flagged, and tells its lead ([how an item
lives](running-work-items.md#how-an-item-lives)).

Ronin stores session metadata for restoration, and with Terminal transcript on it keeps a
copy of the conversation in the session folder, which archive retains. The provider still
owns the original journal. Closed, unarchived session folders are removed after the
retention period (a Campaign setting, default seven days); an archived one goes with its
archive after 7 days.

Agents can use `session_archive` and `session_restore`; their help gives the current syntax.
Contributors: [archive identity, persistence, and API](../architecture/session-archive.md).
