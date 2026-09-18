# Archived sessions

Archive stops an Agent so you can later resume its provider conversation. The Agent is no
longer running and does not occupy a place in the live roster.

## Archive and restore

1. Open the Agent's close/delete action and choose **Archive**.
2. If it owns an open managed worktree, hand off or finish that worktree first; the message explains
   what prevents archiving.
3. Find the record in **Archived** and select it to resume.

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

Ronin stores session metadata for restoration. The provider owns the conversation history;
archive does not make a separate transcript backup. Readable recording is currently parked
in Services, so do not depend on it to recover a conversation.

Agents can use `session_archive` and `session_restore`; their help gives the current syntax.
Contributors: [archive identity, persistence, and API](../architecture/session-archive.md).
