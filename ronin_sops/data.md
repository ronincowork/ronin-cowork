# data — where data lives, and how to decide

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `data.md`) replaces
> this file whole — a default, not law.
> **Voice: relay.** Written for the agent to walk a person through, not to follow itself.

It arrives as "where should I put this?", and size never answers it. Establish what the
data *is*, and the home follows.

## Three questions, in this order

1. **What breaks if it disappears tonight?** Nothing → it is scratch; put it anywhere.
   Something → it needs a home with a copy somewhere else. This one decides, and it goes
   first because the other two do not matter when the answer is "nothing".
2. **Does the running app read it, or does a person?** An app reading it at runtime pulls
   it toward the app's own host. A person working on it pulls it toward wherever they
   already keep files.
3. **Does it change?** Rarely-changing bulk and constantly-changing records want
   different homes, and mixing them is what makes both awkward.

## Three homes

- **Records** — anything queried, joined, counted, or written by two things at once. A
  database. Managed beats self-hosted for anything you would miss: running your own is a
  job, not a checkbox.
- **Files** — anything read whole. Media, documents, exports, archives. Object storage or
  a synced folder; cheap, and it does not care how big it gets.
- **Scratch** — working copies, intermediate output, anything reproducible. A working
  disk, and it may vanish.

## The machine is not a home

A working directory is where data passes through, not where it lives. The reason is not
capacity — it is that a machine holds **one** copy, and the copy dies with the box. Tens
of gigabytes sitting on a working disk is a signal to ask question 1 again, not a storage
decision that has already been made.

## Before moving anything

Say out loud what should be true afterwards: where it will be, who can read it, what the
app's path to it becomes. Copy first, read it from the new home, and only then let go of
the old one. **Nothing is deleted in the same step as it is moved.**
