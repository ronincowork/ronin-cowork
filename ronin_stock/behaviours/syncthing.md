# Syncthing
- **seed:** Syncthing never carries what git carries: before you add, change or review a synced folder, or chase a file missing on another machine, `ronin-help syncthing`.
- **when:** !irasshai
- **depth:** seed
- **order:** 28

Syncthing keeps chosen folders the same on the owner's machines, peer to peer. It carries only
what has no other way across: stores, notes, documents, work that is in no repository. What
git carries it never carries: `.git`, desks and worktrees, dependencies, build output, caches,
temp files. A desk's work reaches other machines by commit and hand-in, not by sync.

Measure, never remember: `syncthing cli config gui apikey get` gives the key for the REST API
on `127.0.0.1:8384`; folders, devices and who is connected are read from it each time.

### A new folder
1. Before sharing it, write its ignores. The lines go in `.stglobalignore` at the folder's root,
   which syncs; `.stignore`, which never syncs, holds one line on every machine:
   `#include .stglobalignore`. Every device then ignores the same things.
2. The lines, each with `(?d)` so an ignored file never blocks deleting its folder:
   ```
   (?d).git
   (?d)node_modules
   (?d)dist
   (?d)build
   (?d).cache
   (?d)*.tmp
   ```
   plus what this folder's tools write (`.venv`, `target`, `.next`, `coverage`), and for
   `~/ronin`: `(?d)worktrees`, `(?d)tmp`.
3. A repository's checkout is shared only to see its files on another machine, never its
   `.git` or a desk; follow the ignores the sibling repository folders already use.
4. Share it. On each receiving device, put both files in the folder's path, then accept it.
   One side alone syncs nothing.

### Review an existing setup
1. Per folder: its path, `.stignore`, and `localFiles` from `/rest/db/status?folder=<id>`.
2. Find what git carries in it: `find <path> -name .git -prune` (repositories and desks), and
   the largest directories by file count.
3. Propose the ignore lines, and say what would stop syncing: a desk's uncommitted work, a
   dependency folder another machine was using. Each machine keeps its existing copy; nothing
   is deleted by an ignore.
4. Change an `.stignore` only on the owner's yes, on every machine.

### A file missing on another machine
1. Rescan where the change was made: `POST /rest/db/scan`. A rescan announces local edits; it
   fetches nothing. The peer pulls on its own.
2. Prove delivery: `/rest/system/connections`, then `/rest/db/completion?device=<peer>`. At
   100 with `needItems` 0 the peer has it; the other side refreshes its view.
3. Otherwise, in order: the peer is off or not connected; the folder is paused or not shared
   with it; an ignore line matches the file; a `*.sync-conflict-*` copy beside it holds the
   other edit (the owner picks which survives); a device or folder not accepted on one side.

### Don'ts
- Don't conclude it is down from one systemd unit. It can run as `systemctl --user status
  syncthing` or `systemctl status syncthing@<login>`; an answering API, or `pgrep -a
  syncthing`, means it is running. Running, never start another.
- Don't share a folder before its ignores are in place: an index of a worktree tree costs the
  machine its memory.
