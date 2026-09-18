# Tool catalog

Tools are executable operations selected and taught by capability documents. They live
in the repo's `ronin_bin/`,
which `setup.sh` puts on PATH — call them by bare name, never by a built path.
(`shim/tmux` is the exception below: it is PATH interception, not a command you type.)
Agents: prefer the selected tool over hand-rolled choreography; it reports the result in
the vocabulary used throughout the coworkspace.

[`docs/architecture/tool-surface.md`](../docs/architecture/tool-surface.md) owns the architectural vocabulary, including the composite tool
boundary. Catalog the public operation here, not its internal routes or modules.

| Tool | Usage |
|---|---|
| `shim/tmux` | On PATH ahead of real tmux: makes `kill-server` unavailable because it ends every session. All other tmux commands pass through. |
| `ronin-url` | Prints where the live operator answers, one line: `RONIN_URL` when set (a development/test target over HTTP), else the path of the operator's own Unix socket — `RONIN_SOCKET` as told at birth, else `<data root>/run/ronin.sock`. The socket is the address, the liveness check and the credential; no tmux is consulted (`docs/architecture/operator-connection.md`). Exit 4 with one of two refusals: no Ronin has started here (no socket), or Ronin is not running (socket, nobody listening). Shell callers build their request through the sourced sibling `ronin-http.sh` (`ronin_connect` sets `url` and `RONIN_CURL`), and resolve both beside their own real file, so an absolute path or projected symlink never depends on Ronin directories being on `PATH`. |
| `ronin-host` | `ronin-host --help` renders the available fixed subcommands. `inspect [path]` measures host and storage; `account` reports secret-free ownership and entitlement; `secrets [path]` reports key names and exposure, never values; `restart` restarts Ronin and nothing else without touching sessions. There is no generic writer or arbitrary service target. |
| `machine-settings` | Typed, secret-free Machine and Campaign configuration. `machine-settings --help` lists read and guarded write operations for the Campaign, installations, Agent defaults, Workspace Folders, providers, machine facts, owner profile, and Team defaults. Writes support the proposal-first `--propose` / `--confirmed <token>` contract; the tool revalidates the exact proposal before applying it. |
| `edges` | `edges --help` discovers `send`, `read`, `team`, `wipeboard`, `page`, `schedule`, and read-only `control`. `edges read <session> [lines]` uses the durable settled record first and falls back to a partial recent live view only when no tape exists. Each operation preserves its guarded outcomes. |
| `session_end` | `session_end` — **no arguments**. Resolves the current Agent, checks all assigned worktrees, automatically closes every clean worktree whose tip is contained in its Team line (an ACCEPTED hand-in is enough; global-dev promotion and manual close are not required), then ends the Agent. Any dirty, pending/rejected, unique, shared, or occupied worktree keeps the whole operation live and prints exact next actions; nothing is discarded. No output on success. Exit 4 = actionable refusal or owner-dialled; exit 5 = Ronin unreachable/stuck. |
| `session_archive` | `session_archive <session>` → `ARCHIVED <session> as <archive-id> — resumable`. Uses the existing live-session archive route; it never substitutes hard delete. Exit 2 = bad arguments, 4 = refused, 5 = unreachable. |
| `session_restore` | `session_restore <archive-id>` → `REHYDRATED <session>`. Uses the existing provider-resume and metadata-restoration route; the manifest is removed only after restoration succeeds. Exit 2 = bad arguments, 4 = refused, 5 = unreachable. |
| `session_check` | **Read one live session by exact name.** An unused name reports `NO-SESSION`; this tool never creates or changes anything. |
| `session_create` | **Create one visible Agent through the ordinary launch resolver. AN OWNER ASKING FOR AN AGENT ALWAYS MEANS THIS VISIBLE SESSION; IT NEVER MEANS SPAWN A CLI-INTERNAL SUB-AGENT.** “Agent,” “new agent,” “fork,” and “fork it” do not request or authorize spawning. Supply the newborn's purpose explicitly with `--prompt`; only Campaign and Team launch context are resolved, never the caller's conversation. There is no dial option: the caller is unchanged and the newborn reads its own resolved birth packet. `session_create --help` dynamically renders provider/model choices and defaults from the canonical Campaign/provider catalog shared with UI dropdowns, so configuration changes require no maintained list. An existing name is refused rather than read or updated. |
| `session_set` | **Change named facts on one existing live session.** It updates Team membership, lead designation, or Workspace Folder handle; a missing name is refused and the bare form points to `session_check`. |
| `team` | Typed Team surface for every Cowork Agent. `team --help` lists roster read/write; project create/read/write/list/assign/return; and settled Kanban member status. Lead remains an explicit session designation changed with `session_set`; it is not inferred from using this tool. Read-only Team enumeration remains `edges team`; visible Agent creation uses universal `session_create`. |
| `mika` | `mika "<request>"` → hands plain words to the house assistant, starting her if needed. Her Build Brief emphasizes the related enabled-feature tools; the launcher carries no job vocabulary. When she is already up it hands off to `edges send`, so the request is either `DELIVERED` or durably `QUEUED`; starting her prints `STARTED`, and exit 5 = Ronin unreachable. |
| `lookup` | **Ronin Services feature.** `lookup mika-source:<id>` → prints one source from the Mika index, verified against it. Exit 2 = not one exact reference; 4 = no operator socket. |
| `owner_view` | **Ronin Services feature.** `owner_view <tab>` → what the owner is looking at in that browser tab: workbench, team, selected workspace, what each visible workspace shows. Absent or stale view = 404, so open Help in the tab you mean. |
| `show` | **Ronin Services feature.** `show <tab> <surface>` → opens a Ronin surface in another visible workspace of that tab; never replaces the selected one. |
| `work-record` | Universal typed record surface. `work-record --help` lists read and update_record; document add/remove/list; and held-project create/read/write/list. It resolves the calling session without accepting record paths and preserves the existing guarded validation. |
| `worktree-desk` | **Get, assign, update, hand in, close, and inspect managed worktrees; initialize an existing Workspace Folder as a local repository.** `--help` lists every operation. `open <repo[:branch]> [--source dev\|team]` defaults to current local `dev`; `team` explicitly starts from the Team review line and records its exact SHA. `sync <repo[:branch]> [--source dev\|team\|lead\|<repo:branch>]` merges committed work from global dev (default), the shared Team line, the Team lead’s private worktree, or a named worktree in the same repository. Its acknowledgement names the exact source SHA, destination before/after HEAD, and whether anything merged; unsaved source files are excluded. `hand-in [<repo[:branch]>] [--assignment]` constructs an isolated candidate from current `dev`, accepted Team delta, then worktree delta; conflicts and stale CAS attempts keep the worktree and record evidence. `close` removes only a clean integrated worktree and refuses while a live session is inside it; `close … --with-session` uses coordinated shutdown. `handoff` transfers custody; `receipts` reads publication evidence; `reply` answers a conflict; exact-confirmed `discard` records a receipt before deletion. `repository-init <existing-project-root>` runs local `git init` only, never creates the folder or adds a remote, and reports `READY` when a repository already exists. Exit 0 done · 2 bad arguments · 3 no matching worktree/session · 4 not accepted · 5 stuck. |

Private implementation files in `ronin_bin/` are intentionally not catalogued as tools:

- `tool-path.sh` and `ronin-http.sh` are sourced libraries.
- `.edges-send`, `.edges-read`, `.edges-team`, `.edges-wipeboard`, `.edges-page`,
  `.edges-schedule`, and `.edges-peek` implement the public `edges` surface.
- `ronin-desk-settle` and `ronin-team` are house-side maintenance entry points, not
  Agent-facing operations.
- `README.md` documents the shelf.

Rules for adding tools:
- Add the executable, its catalog row, and the capability document that conditionally
  selects and teaches it.
- When the job is composite, reuse guarded primitives behind one contract and preserve
  their validation and audit evidence; do not expose copied choreography as another path.
- Tools report stored preferences and operational warnings without treating them as
  access-control decisions.
- Small, zero-dependency bash; concise outcomes and meaningful exit codes.
