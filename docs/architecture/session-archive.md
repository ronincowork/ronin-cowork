# Session archive construction

Archive is a resumable stop, not a delete and not a hidden live process.

For contributors. See [Archived sessions](../using-ronin/archived-sessions.md) for use and recovery.

## What actually happens

The provider and tmux do different halves of the job:

1. Ronin identifies the provider's conversation UUID from the persisted launch identity
   (`launch-identity.json`), so a dead pane (process gone, pane kept by `remain-on-exit`)
   archives like a live one. A dead pane has no current path; its start path is the cwd.
2. Ronin writes a private manifest containing that UUID and the session's tmux/Ronin
   metadata. It does not copy the model conversation.
3. Ronin kills the base tmux session and every grouped `grid_*` viewer, then verifies they
   are gone. The CLI processes are therefore gone from RAM and the session is absent from
   the live census.
4. On rehydrate, Ronin asks the central agent registry for the installed provider CLI and
   its resume argv, then creates a new tmux session with that process. The argv is the
   Agent's birth command (its birth receipt's `cmd`, so its model and permissions mode come
   back with it, KAN-661) with the CLI's resume grammar after the executable:
   `claude --model <m> --dangerously-skip-permissions --resume <uuid>`, `codex --model <m>
   --dangerously-bypass-approvals-and-sandbox resume <uuid>`. A birth command that is not the
   CLI itself (a part's wrapped launch), or no birth command, falls back to the CLI's Dangerously
command, never its plain one (KAN-718). An Agent born on a
   part's provider (`src/provider-parts.ts`) is restored through that part's `wrapResume`.
5. The provider CLI loads its own conversation history. Ronin restores the session key,
   teams, leads, wipeboards, note, project root, control dial, agent stamp, provider UUID,
   and session type. Only then is the archive manifest removed.

   Each kill also stops the session's systemd pane scope, so nothing the Agent started
   outlives it ([agent temp and processes](agent-scope.md)).

So this is not tmux serialization and it is not a suspended process. tmux is genuinely
stopped; provider-native conversation resume is what makes the later process continuous.

## The recording

RIREKI reads provider journals through Core's persisted launch identity. Archive retains
the session directory, including `launch-identity.json` and any isolated journal home;
restore reuses that identity and home. Archive does not create a transcript copy.
Hard deletion of an archive removes its retained session directory. The legacy terminal
recorder is disconnected from RIREKI registration.

- A live tile's trash action offers **Archive**, **Delete**, and **Hard Delete**. Archive is
  resumable and refuses while the Agent owns an open desk, naming the emergency way past it:
  `ignore_desks: true` (`session_archive <name> --ignore-desks`) skips the ending preflight,
  leaves every desk record and worktree as it is, and writes `desks_left_open` on the manifest. Delete visibly checks all desks,
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

## An Agent's own end

`session_end` (`POST /api/harakiri`) archives (KAN-501). `performAgentEnd` runs the same desk
checks and closes as Delete (`shutdownAgent`), with its stop step replaced by `archiveAgent`,
the one archive the archive route also calls. So the manifest is written and tmux stopped
exactly as above, `SessionEnd` is not emitted, and the session folder stays. Only when no exact
provider conversation is known does it stop the Agent outright, emit `SessionEnd` and remove
the folder.

Desks close, as before: `session_end` only ends with every desk clean and handed in, so the
work is on the Team line and a restored Agent reopens a desk from it. Holds are released as on
any ending (`releaseHolder`): a stopped Agent holding work would hide it from the Team, so the
lead keeps the decision and a restored Agent takes items back by handoff; restore does not
reclaim. The lead's end notice (the members-list ack, `memberEnded`, and the "ended without a
handover" notice when it applies) carries `<name> ended, archived as <id>: session_restore <id>`.
Delete, Hard Delete and the tile's shutdown are unchanged: they end outright, and the
folder goes with the Agent.

## Warm restart: archive all, restore all

A planned stop of an office (a resize, Restart, Update; KAN-671) saves its Agents first and
brings each back afterwards. Two calls, both on the operator socket like every route:

- `POST /api/machine/archive-all` (`session_archive --all`) runs `archiveWith` for every live
  Agent, the same manifest and stop as any archive, with `warm_restart: true` on the manifest.
  As for the park there is no desk or item check, holds and desks stay with the Agent, and no
  Team is told. Unlike the park, an Agent with no resumable conversation does not refuse the
  rest: it is left running and named in `not_saved`. Its hook record is cleared, so the card
  starts fresh. Body `{ "pane": "%7" }` (optional, the tool sends `$TMUX_PANE`) saves that
  Agent last, so a call from an Agent saves the others before its own pane is stopped.
  Answer: `{ ok, saved: [{ name, id, agent }], not_saved: [{ name, error }] }`.
- `POST /api/machine/restore-all` (`session_restore --all`) runs `rehydrate` on every
  `warm_restart` manifest, oldest first: the same restore as `session_restore <id>`, so the
  name, cwd, key, Teams, leads, wipeboards, project root and the birth command (KAN-661) come
  back and the provider continues its conversation. An archive whose name is running is not
  touched. Answer: `{ ok, restored: [{ name, id }], not_restored: [{ name, id, error }] }`;
  a manifest that did not come back stays in the Archived tab.

The tools take `--status <file>` (`ronin_bin/ronin-all.sh`): the call runs detached
(`setsid`) and the tool returns at once, for a caller that cannot hold a command open (the
park, over qemu-guest-agent). `<file>` reads `{"state":"running"}`, then the answer above
with `"state":"done"` in place of `ok`, or `{"state":"failed","error"}`; it is written whole
(rename), and is done or failed within 600 s (the curl limit). The park's order: archive all
done (or failed), stop, start, Ronin's port answers, restore all.

Both are idempotent: archive all saves only what is live, and a restored manifest is removed,
so a second restore all does nothing. Ronin and tmux may be stopped and started between the
two; the manifests and session folders are on disk. A warm manifest that is never restored
expires as any other.

## Expiry

An archive undoes an accidental close; it is not storage (owner, 2026-11-15). An archive whose
`archived_at` is older than `ARCHIVE_DAYS` (7, `src/session-archive.ts`) is removed by
`expireArchives` in `src/routes/sessions-api.ts`, through `deleteArchived`, the same removal
`DELETE /api/archived-sessions/:id` uses: `SessionEnd` emitted, holds released, the
session folder (and its temp root) and the manifest removed. It runs at service start (`src/index.ts`) and after
each new archive is written (`archiveWith`). No timer and no setting. A failure on one archive
is logged and the rest still go.

An archive with `desks_left_open` (made with `--ignore-desks`) expires the same way: the
removal touches only the manifest and the session folder, never a desk record or worktree.
The lead's end notice (`memberEnded`) names the desks still open (`expiryNotice`).

Leads list the archives with `session_restore` and no argument: it reads
`GET /api/archived-sessions` and prints each archive's name, team (its tags), when, id and
`session_restore <id>`, newest first.

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
| `POST /api/sessions/:name/archive` | Persist the resumable manifest and stop the Agent; refuses while it owns an open desk (`acknowledge: 'ignore_desks'`) unless `ignore_desks: true`; `ignore_items: true` likewise for held items |
| `POST /api/harakiri` | `session_end`: close safe desks, then archive as above (`archived` in the answer); an unresumable conversation ends outright |
| `DELETE /api/sessions/:name` | Coordinated close of safe assigned worktrees followed by Agent deletion |
| `POST /api/sessions/:name/shutdown` | Immediately start observable safe Delete, or exact-confirmed Hard Delete; returns an operation id |
| `{t:'shutdown', ...operation}` on `/events` | Each phase, desk count, terminal success, or actionable blockers, pushed as they happen; `{t:'want', resource:'shutdown', id}` answers a reopened socket with the operation as it stands |
| `POST /api/machine/park` | Archive every Agent for `bin/ronin-archive` ([park](../operating/park.md)): the same manifest and stop, no desk or item refusal, holds kept; answers what to carry beside the stores |
| `POST /api/machine/archive-all` | Archive all for a warm restart ([above](#warm-restart-archive-all-restore-all)): every live Agent saved, each named `saved` or `not_saved` |
| `POST /api/machine/restore-all` | Restore all that archive all saved and is not running, each named `restored` or `not_restored` |
| `GET /api/archived-sessions` | Roster-safe rows, newest first: `id`, `name`, `archived_at`, `agent`, `tags`, and `desks_left_open` when set; archives older than 7 days have already gone ([Expiry](#expiry)) |
| `POST /api/archived-sessions/:id/rehydrate` | Resume provider conversation and restore metadata |
| `DELETE /api/archived-sessions/:id` | Irreversibly end and remove the archived record |

The browser calls these routes through `public/js/api.js`. A shutdown's phases reach it as
`{t:'shutdown', id, …}` on `/events` until it is complete or failed (`runShutdown` in
`public/js/session-retire.js`); a socket that reopens mid-shutdown asks for the state with
`{t:'want', resource:'shutdown', id}`. Nothing polls, and an overall deadline returns the
controls if the socket stays silent. Archived rows never enter
`S.sessions`, so they cannot appear in live pickers or consume the configured session max.
Agents and team leads use those same routes through `session_archive <session>`,
`session_restore` (the list) and `session_restore <archive-id>`; the tools add no lifecycle or
store of their own.

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

## The session folder is the Agent

A session's folder under the session store (`birth-receipt.json`, `launch-identity.json`,
`brief.md`, `AGENT_BIRTH_BRIEF.md`, `AGENT_BRIEF.md`, `tegami.md`, `transcript.jsonl`, and for isolated launches
`cli-home/`, plus `tmp/`, the Agent's `TMPDIR`, and `scope`, its pane scope: [agent temp and processes](agent-scope.md))
lives exactly as long as its Agent, live or archived (owner, 2026-11-22). No sweep and no
setting decide it. Every ending that deletes the Agent removes the folder, and a short temp
root outside it, in the same step (`removeSessionFolders`, `src/agent-scope.ts`): Delete,
Hard Delete, the tile's shutdown, `worktree-desk close --with-session`, a `session_end` with
no resumable conversation, an archive's Hard Delete, and [expiry](#expiry) after 7 days.
Archive keeps it. An Agent whose pane died keeps its tmux session (`remain-on-exit`), so it
stays a tile, reads Stopped, and keeps its folder until it is deleted.
