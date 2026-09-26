# Session archive construction

Archive is a resumable stop, not a delete and not a hidden live process.

For contributors. See [Archived sessions](../using-ronin/archived-sessions.md) for use and recovery.

## What actually happens

The provider and tmux do different halves of the job:

1. Ronin identifies the provider's conversation UUID while the process is still live.
2. Ronin writes a private manifest containing that UUID and the session's tmux/Ronin
   metadata. It does not copy the model conversation.
3. Ronin kills the base tmux session and every grouped `grid_*` viewer, then verifies they
   are gone. The CLI processes are therefore gone from RAM and the session is absent from
   the live census.
4. On rehydrate, Ronin asks the central agent registry for the installed provider CLI and
   its resume argv, then creates a new tmux session with that process. Today the verified
   forms are `codex resume <uuid>` and `claude --resume <uuid>`.
5. The provider CLI loads its own conversation history. Ronin restores the session key,
   teams, leads, wipeboards, note, project root, control dial, agent stamp, provider UUID,
   and session type. Only then is the archive manifest removed.

So this is not tmux serialization and it is not a suspended process. tmux is genuinely
stopped; provider-native conversation resume is what makes the later process continuous.

## The recording

RIREKI reads provider journals through Core's persisted launch identity. Archive retains
the session directory, including `launch-identity.json` and any isolated journal home;
restore reuses that identity and home. Archive does not create a transcript copy.
Hard deletion of an archive removes its retained session directory. The legacy terminal
recorder is disconnected from RIREKI registration.

- A live tile's trash action offers **Archive**, **Delete**, and **Hard Delete**. Archive is
  resumable and refuses while the Agent owns an open desk. Delete visibly checks all desks,
  automatically closes clean Team-contained work, and refuses actionably without loss.
  Hard Delete is unmistakably destructive: after exact-target confirmation it preserves
  quarantine/receipt evidence, then removes the Agent and every owned desk regardless of
  dirty files or unhanded commits.
- The Commons has a separate **Archived** tab listing disk-backed records. They are absent
  from the Roster and live session list and therefore do not count toward the session maximum.
- Clicking an archived row recreates tmux, resumes the same provider conversation, restores
  Ronin's tmux metadata, and removes the manifest only after restoration succeeds.
- Manifests contain Ronin/tmux metadata and the provider conversation UUID. They never store
  the launch prompt, transcript, or raw process argv, and list responses omit the UUID.

Archive uses the launch artifact whenever one exists. An artifact without a resolved
conversation id refuses archive; it never falls through to process discovery.
For pre-artifact sessions, a stamped provider id wins without process inspection.
Otherwise the compatibility reader accepts an explicit id from the live process argv
where supported. Prompt-content matching and descriptor lock/mtime selection are
refused, not silently treated as identity. Consequently some older sessions can no
longer be archived automatically. Refusal happens before writing a manifest or stopping tmux.

The archive manifest store is declared as `archived_sessions` in both store tables. Resolve
its location with `bin/ronin-store archived_sessions`; never spell the path in callers.

## Failure guarantees

- If no exact provider conversation UUID can be found, archive returns `409` before writing
  a manifest or stopping tmux.
- Manifest publication is exclusive. A colliding archive identity returns an error and the
  existing manifest is never overwritten.
- The manifest is durable before tmux is stopped. If stopping fails and the base session is
  still live, the new manifest is removed; if the base is already gone, the manifest stays
  available for recovery.
- Rehydrate refuses a live name collision and a missing provider CLI. If process creation or
  metadata restoration fails, the partial tmux tree is stopped and the manifest remains.
- Archive does not emit `SessionEnd` and does not remove the session directory. Live shutdown
  does both, whether selected on a live tile or on an archived row.

## HTTP contract

| Request | Result |
|---|---|
| `POST /api/sessions/:name/archive` | Persist the resumable manifest and stop the Agent; refuses while it owns an open desk |
| `DELETE /api/sessions/:name` | Coordinated close of safe assigned worktrees followed by Agent deletion |
| `POST /api/sessions/:name/shutdown` | Immediately start observable safe Delete, or exact-confirmed Hard Delete; returns an operation id |
| `{t:'shutdown', ...operation}` on `/events` | Each phase, desk count, terminal success, or actionable blockers, pushed as they happen; `{t:'want', resource:'shutdown', id}` answers a reopened socket with the operation as it stands |
| `GET /api/archived-sessions` | Roster-safe rows: `id`, `name`, `archived_at`, `agent` |
| `POST /api/archived-sessions/:id/rehydrate` | Resume provider conversation and restore metadata |
| `DELETE /api/archived-sessions/:id` | Irreversibly end and remove the archived record |

The browser calls these routes through `public/js/api.js`. Archived rows never enter
`S.sessions`, so they cannot appear in live pickers or consume the configured session max.
Agents and team leads use those same routes through `session_archive <session>` and
`session_restore <archive-id>`; the tools add no lifecycle or store of their own.

## Provider identity

`docs/agents/<cli>.md` owns launch and resume grammar. Launch identity is minted or
isolated before startup and persisted under the birth key. This path requires no `/proc`
inspection and keeps isolation unchanged.

Only births without a launch artifact reach `providerSessionInfo`. It prefers the tmux
provider-id stamp. Its remaining process-argument compatibility path reads Linux
`/proc/PID/cmdline`; it is unavailable on macOS or after the process exits. An explicit
supported session/resume id is accepted; conflicting ids refuse. There is no journal
search by prompt and no descendant descriptor scan. Older unstamped sessions without
an explicit supported id remain unidentifiable rather than risking a neighbour's history.

## Retention of closed session folders

A session's folder under the session store (`birth-receipt.json`, `launch-identity.json`,
`brief.md`, `README.md`, `tegami.md`, `transcript.jsonl`, and for isolated launches
`cli-home/`) outlives the session on purpose: it is the evidence a later reading of the
Agent needs. It does not outlive the retention period. `src/session-retention.ts` runs once
at boot and then weekly on the JIKAN clock and removes a folder that is **closed** — no live
session carries its key — **unarchived** — no archive manifest names its key — and has not
been written to for the period. Archived folders stay until hard delete, as before.

"Closed" is not a marker file; it is the absence of a live key, and the close time is the
folder's last write (Rireki writes `transcript.jsonl` when the Agent's journal moves — it no
longer touches it on a clock, so the last write is the last thing the Agent actually did).
Retention is unaffected: a folder whose key is still live is never removed, however long it
has been quiet. The period is `config.cowork_defaults.session_retention_days`
on a Campaign, default **7**, no UI; when campaigns disagree the most generous value wins,
because a folder does not record which campaign it was born into. `0` on any campaign
switches the sweep off. Set it with `PUT /api/campaigns/:id` (`config.cowork_defaults`) or
by editing the campaign file; `machine-settings defaults write` covers Agent defaults only.
