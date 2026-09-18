# Worktree desk
- **label:** Worktree desk
- **blurb:** How do I preserve and hand in repository work held in a managed desk?
- **class:** cowork
- **requires:**
- **order:** 40

Reach for this bundle when a repository uses managed worktrees or a later assignment needs
a managed desk. A managed desk is a private branch and worktree leased to you. Status,
sync, commit, and hand-in are distinct; none is Git push. Read
`ronin_catalogs/behaviours/conditional/worktree-root.md` before writing in a managed desk.

If `worktree-desk open` reports that the repository uses its checkout, use ordinary Git in
that checkout and read `ronin_catalogs/behaviours/conditional/checkout.md`; no desk or
hand-in applies there.

**Hand in** means submit committed desk work to the Team review line with
`worktree-desk hand-in`; it does not promote or push.

## Tools

| Tool | Authority | Teach | Help |
|---|---|---|---|
| `worktree-desk status` | read: lifecycle facts of your desks | priority | `worktree-desk --help` |
| `worktree-desk sync` | write: merge the selected committed source into your desk | priority | `worktree-desk --help` |
| `worktree-desk hand-in` | write: admit committed work to the Team line | priority | `worktree-desk --help` |
| `worktree-desk open` | create: a private desk | | `worktree-desk --help` |
| `worktree-desk close` | write: remove a clean, integrated desk | | `worktree-desk --help` |
| `worktree-desk receipts` | read: the publication record | | `worktree-desk --help` |
| `worktree-desk reply` | write: answer a conflict on a receipt | | `worktree-desk --help` |
| `worktree-desk handoff` | write: transfer custody | | `worktree-desk --help` |
| `worktree-desk discard` | destroy: exact confirmation required | | `worktree-desk --help` |
| `worktree-desk repository-init` | create: local `git init` in an existing Workspace Folder | | `worktree-desk --help` |

An ordinary contributor needs status, sync, and hand-in. Opening, handoff, receipts,
conflict replies, discard, and closing are in help and on the Worktrees page; assigning a
desk to another Agent is the lead's.

Add `--project <team/id>` to hand-in when the receipt belongs to one held Project. The
accepted acknowledgement records the association and prints the exact LANDING command;
it never changes Project state. A conflict or refusal prints no success movement.

Hand-in constructs an isolated candidate and reports `ACCEPTED` with a receipt, or keeps
the desk and records the evidence on a conflict; nothing is lost either way. Hand-in reaches
the Team line only: the lead's promotion moves the coherent Team line to `dev`, and release
publication is separate work.

`close` removes only a clean desk already contained in its line and refuses while a live
Agent stands in it. The desk you were born in is closed with you when you end, never by
hand. `discard` is the one destructive form and requires the exact confirmation shown. A
discard refuses while any live Agent stands in the desk and reports who occupies it;
nothing is deleted. Use the existing Hard Delete action when the intention is to remove
the Agent and its desks together. Normal clean closure remains `session_end`.

`repository-init` runs local `git init` only, in an existing Workspace Folder; it never
creates the folder, a remote, or a hosted repository.

The table is the executable contract. All ten rows are subcommands of the single
`worktree-desk` executable and appear in its help. `status`, `sync`, `hand-in`, `open`,
`close`, `receipts`, `reply`, `handoff`, and `discard` retain the guarded desk lifecycle;
`repository-init` is the repository operation. No second desk or repository initializer
is projected.

## Choose what to sync

```sh
worktree-desk sync <repo>                       # global dev (default)
worktree-desk sync <repo> --source team         # shared Team review line
worktree-desk sync <repo> --source lead         # Team lead's private desk
worktree-desk sync <repo> --source <repo:branch> # a specific teammate's desk
```

The named desk must be in the same repository. If the lead choice is ambiguous, name
one of the exact desks the tool reports. Source selection does not change custody,
the hand-in destination, or the source desk. It merges committed work only; uncommitted
source files stay there. This does not certify the source work as reviewed or tested.

Read the acknowledgement: it names the source ref and exact SHA, the destination's
before/after HEAD, and merged, already-contained, pending, or conflict. Pending and
conflict leave your files untouched. Commit or preserve destination edits before retrying
a pending sync with the same explicit source. On conflict, resolve the reported commit
on your private desk; do not edit the source or shared Team line.

After the final hand-in, `status` must say `CERTIFIED CLEAN`: no unsaved files and every
commit on the Team line. Stay parked unless told to end.
