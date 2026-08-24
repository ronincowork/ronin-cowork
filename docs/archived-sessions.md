# Archived sessions

Archive is a resumable stop, not a delete and not a hidden live process.

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
   and session role. Only then is the archive manifest removed.

So this is not tmux serialization and it is not a suspended process. tmux is genuinely
stopped; provider-native conversation resume is what makes the later process continuous.

- A tile's trash action offers **Archive** or **Hard delete**. Archive writes a private,
  sanitized manifest first, then stops the base tmux session and every grouped viewer.
  Hard delete retains the irreversible behavior: the session-end lifecycle runs and the
  session record directory is removed.
- The roster lists disk-backed records under **Archived sessions**. They are absent from
  the live session list and therefore do not count toward the session maximum.
- Clicking an archived row recreates tmux, resumes the same provider conversation, restores
  Ronin's tmux metadata, and removes the manifest only after restoration succeeds.
- Manifests contain Ronin/tmux metadata and the provider conversation UUID. They never store
  the launch prompt, transcript, or raw process argv, and list responses omit the UUID.

New Claude launches carry a Ronin-minted `--session-id` and the same UUID is stamped on the
tmux session. Legacy Claude sessions are discoverable only when exactly one history file
contains the exact initial prompt. Codex discovery requires a matching rollout file and
thread-writer lock in the pane process tree; the most recently written matching rollout is
the active conversation. If discovery is absent or ambiguous, archive refuses before
stopping tmux.

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
- Archive does not emit `SessionEnd` and does not remove the session directory. Hard delete
  does both, whether selected on a live tile or on an archived row.

## HTTP contract

| Request | Result |
|---|---|
| `POST /api/sessions/:name/archive` | Persist manifest, stop and verify the tmux tree |
| `GET /api/archived-sessions` | Roster-safe rows: `id`, `name`, `archived_at`, `agent` |
| `POST /api/archived-sessions/:id/rehydrate` | Resume provider conversation and restore metadata |
| `DELETE /api/archived-sessions/:id` | Irreversibly end and remove the archived record |

The browser calls these routes through `public/js/api.js`. Archived rows never enter
`S.sessions`, so they cannot appear in live pickers or consume the configured session max.

## Provider identity

New Claude launches are deterministic: Ronin mints a UUID, passes it as `--session-id`, and
stamps it in `@ronin-provider-session`. A resumed Claude process also exposes its UUID in
`--resume`. For older Claude sessions without either argument, Ronin scans only the current
project's Claude history and accepts an ID only when exactly one file contains the exact
initial user prompt; ambiguity fails closed.

Codex does not currently accept a caller-minted conversation UUID on an ordinary new
interactive launch. Its native process keeps both a rollout JSONL file and a matching
thread-writer lock open. Ronin walks the pane process and descendants, intersects those two
FD identities, and selects the most recently written exact match. A rollout without its
matching lock is never accepted.

Provider command syntax is owned once in `src/agents.ts` and documented in
`docs/model-providers.md` § One command registry. Archive code discovers conversation
identity; it does not own install, launch, update, or resume argv. Gemini, Grok, and Hermes
remain non-archivable until their native resume contracts are verified and added there.
