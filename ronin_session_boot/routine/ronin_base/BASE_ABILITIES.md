# BASE ABILITIES — ordinary Ronin work

This reading belongs to the **Ronin Base** Routine. It teaches the ordinary session,
work-record and team-coordination behaviours that Base offers.

## Session macros

When the owner says `+<name>: <args>`, compile that workflow with `tejun <name>` and
execute the recipe it returns. Do not substitute a remembered workflow or a native Agent
feature with a similar name. The active macro set and full routing rule are in
`SESSION_MACROS.md`.

`+forkit:`, **fork it**, and **new session** always mean Ronin's visible-session workflow:
compile `tejun forkit`, create the handoff it requests, launch with `tejun-fork`, report
your understanding, and stop until the owner says go. They never mean an Agent CLI's
internal sub-agent or a bare tmux session. **Spawn it** and **spawn an agent** mean the
Agent CLI's internal sub-agent machinery. For delegation using neither vocabulary, choose
normally; a quick internal sub-agent needs no extra owner confirmation.

## Work records

Your work record is the user-facing account of the task, tracked documents, progress,
worktrees and team. Read it with `read_tegami`; update it with `write_tegami`. Keep it true
when your task, current action, tracked documents, ladder position or repository coordinate
changes. The tools' `--help` output teaches their available amendments and the complete
block shape.

## Other sessions

Check the `@ronin-control` dial before reading or writing another session. The owner alone
changes that dial. A refusal is an answer: report it and do not retry around it.

- Inspect a session's recent live pane with `tejun-peek <session>`. This is a live view,
  not a durable record. When the Ronin Services Routine is enabled, its reading supplies
  the record-backed catch-up route and makes that route authoritative.
- Send one targeted message with `tejun-send <session> <message...>`. Open with
  `from @<your session>:` because the tool adds no watermark. Report `DELIVERED` or
  `QUEUED`; the durable Messages flow owns retries. Do not become a relay.

## Your team's board

If you are on a team, its board already exists. These are the ordinary routes:

```bash
tejun-wipeboard
tejun-wipeboard post <text...>
```

The first reads everything you have not read. The second posts to your own team's board;
its default interrupts the team lead. `--to <session,session>` also interrupts those
sessions, `--to all` interrupts everyone, and `--to none` interrupts nobody. Addressing
changes interruption, not who may later read the post.

Never post merely to acknowledge a notice: reading is recorded mechanically. The board
expires coordination after 48 hours and is not a durable record. Preserve lasting facts in
your work record, a document, or a commit. See `docs/wipeboards.md`.

## When a Base route is absent

Say what is true. If a named tool is not on `PATH`, report that the behaviour was not
delivered; do not reproduce its guarded operation with raw tmux, Git, or store access.
Full procedures live in the compiled macro or the corresponding rows of
`ronin_catalogs/TOOLS.md` and `ronin_catalogs/ACTIONS.md`.
