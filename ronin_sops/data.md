# data — connecting to a data source, and choosing which one

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `data.md`) replaces
> this file whole — a default, not law.
> **Voice: relay.** Written for the agent to walk a person through, not to follow itself.
> **Tool: `tejun-survey [path]`** — cores, RAM, disk free where the work is, and every
> store with its size. Run it before advising; the numbers are never in this file.

This covers **how a project connects to its data** — what the options are, how to choose
between them, and how the machine you are on constrains the choice. It arrives as "where
should I put this?" or "how do I get at that?", and size alone answers neither. Establish
what the data *is*, measure what the box has, and both answers follow.

## Three questions, in this order

1. **What breaks if it disappears tonight?** Nothing → it is scratch; put it anywhere.
   Something → it needs a home with a copy somewhere else. This one decides, and it goes
   first because the other two stop mattering when the answer is "nothing".
2. **Does the running app read it, or does a person?** An app reading it at runtime pulls
   it toward the app's own host. A person working on it pulls it toward wherever they
   already keep files.
3. **Does it change?** Rarely-changing bulk and constantly-changing records want
   different homes, and mixing them is what makes both awkward.

## Then measure

`tejun-survey` on the directory the data would land in. What matters is not the free
figure but the **ratio** — what fraction of that disk is this, and what is already living
on it? A working box also carries the session tapes, every checkout and every
`node_modules`, and those grow without anyone deciding they should.

## Three homes

- **Records** — anything queried, joined, counted, or written by two things at once. A
  database, and **Postgres unless you can say why not**: SQLite when it is one process
  with no network, and then stop shopping; a document store when the shape genuinely
  varies per record and you read and write whole documents. Reaching for one *because
  the shape is not settled yet* is not a data decision, it is deferring one, and it is
  paid for later. Managed beats self-hosted for anything you would miss — running your
  own is a job, not a checkbox.
- **Files** — anything read whole: media, documents, exports, archives. Object storage,
  or a synced folder (Syncthing, Dropbox) when a person works across machines. **A synced
  folder is a replica, not a backup** — deletion propagates, and that is the whole risk in
  one sentence. Never sync a directory a process is actively writing to: half-written
  files replicate and conflict copies breed.
- **Scratch** — working copies, intermediate output, anything reproducible. A working
  disk, and it may vanish.

## The machine is not a home

A working directory is where data passes through, not where it lives. The reason is not
capacity — it is that a machine holds **one** copy, and the copy dies with the box. Tens
of gigabytes sitting on a working disk is a signal to ask question 1 again, not a storage
decision that has already been made.

## Connecting to it

Wherever it lands, the connection itself follows three rules:

- **The address and the credential are configuration, never code** — a connection string
  lives in the environment, and it is a secret even when it looks like a URL
  (`secrets.md`).
- **Connect from one place in the code.** One module owns the client; everything else asks
  it. Moving the data later is then an edit in one file rather than a hunt.
- **Prove the connection before building on it.** Read one row, list one object, fetch one
  file — from the machine that will actually do it, not from your laptop. A managed
  database usually has to be told which addresses may reach it, and that is the step
  people discover last.

## Before moving anything

Say what should be true afterwards: where it will be, who can read it, what the app's path
to it becomes. Copy first, read it from the new home, and only then let go of the old one.
**Nothing is deleted in the same step as it is moved.**
