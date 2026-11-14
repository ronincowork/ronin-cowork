# park — the whole office in one file, and back

`bin/ronin-archive` parks an office: every Agent is archived, Ronin stops, and one file holds
everything needed to bring the office back. `bin/ronin-rehydrate` brings it back on a fresh
install. Use it when an office stops (a hosted customer stops paying, say) and its Agents
should not be lost. Archiving one Agent is a different thing: see
[Archived sessions](../using-ronin/archived-sessions.md).

Run both as the office user, from the install's `bin/`, like `ronin-update`.

```bash
bin/ronin-archive --out /var/tmp/office.tar.gz     # returns at once; Ronin is stopped at the end
bin/ronin-rehydrate /var/tmp/office.tar.gz         # returns at once; Ronin is running at the end
```

## Status, not a held terminal

Both commands return at once and do the work detached. Progress goes to
`<file>.status.json`; the detached run's output goes to `<file>.log`:

```json
{"state":"running"|"done"|"failed","step":"…","size":N,"sha256":"…","error":"…"}
```

`size` and `sha256` describe the file and are also printed as the last lines of the log.
Ronin Cloud's kohai reads this file instead of holding a guest command open. A person
watching can add `--foreground` to either command to run it attached.

## What the file holds

One tar.gz, made by `bin/ronin-export --keep-links`:

| Inside | What | Keyed by |
|---|---|---|
| `manifest.json` | `format`, `release`, `commit`, `contract`, `office_id`, `created_at`, `agents` | — |
| `RONIN-EXPORT/stores/<id>/` | every store: sessions, archive manifests, Teams, work items, wipeboards, catalogs, settings, desks, worktrees, secrets | store id |
| `folders/<path>` | every Workspace Folder — the repositories the worktrees belong to | path |
| `files/<path>` | each Agent's provider conversation, and each provider's sign-in and settings | path |

Stores are restored through `ronin-store` on the destination, so the newer release's layout
decides where each lands. Folders and files go back to the same path, so the office must
come back with the same home and roots (a fresh unit of the same image has them); rehydrate
refuses otherwise, and says which.

A symlink inside a store stays a symlink: a worktree's `node_modules` link stays a link to
the repository's own.

**Not carried:** loose files directly in the home directory. The `home` Workspace Folder a
fresh install registers is the home directory itself, which holds Ronin's own roots, so it
is not carried whole; the Workspace Folders inside it travel one by one. Nor are Ronin's units
or `node_modules`, which the install provides.

**The file holds the office's credentials:** provider sign-ins, the Services secrets store,
the office's tokens. They are the office's, and they travel with it. Nothing is sent anywhere
by these commands; who holds the file and where it goes is the caller's decision.

## ronin-archive

1. Archives every Agent through Ronin's own archive path (`POST /api/machine/park`). Each
   keeps its provider conversation id, Teams, leads, wipeboards and Workspace. Because the
   whole office travels, nothing is handed back: an open desk or held work item does not
   refuse, items stay held by their Agent, and no Team is told. Every Agent is identified
   before any is stopped: if one cannot be resumed, the park is refused and nothing stops.
2. Stops Ronin through its service manager. Ronin stays stopped.
3. Writes the file, then `done`.

## ronin-rehydrate

1. Reads `manifest.json`. It refuses a newer `format`, or a file made by a newer release
   than this install's, before touching anything.
2. Stops Ronin and unpacks beside the data root.
3. Moves aside whatever the fresh install already had where the office's things go, to
   `<data root>/rehydrate-replaced-<stamp>/`. Nothing is deleted. The `office_unit` store is
   kept: it is the new unit's own filing, written by whoever provisioned it.
4. Restores the stores (`ronin-export --restore`), the folders and the provider files.
5. Starts Ronin and resumes each parked Agent with `session_restore`. An Agent that does not
   resume is named in the status and stays in the Archived tab.

## Related

- [Session archive construction](../architecture/session-archive.md): what one Agent's archive keeps.
- `bin/ronin-export --help`: the store export this builds on.
