# BASE ABILITIES — ordinary Ronin work

**Fork versus spawn.** `+forkit:`, **fork it** and **new session** always mean Ronin's
visible-session workflow: compile `tejun forkit`, write the handoff it asks for, launch with
`tejun-fork`, report your understanding and stop until the owner says go. They never mean
your CLI's internal sub-agent or a bare tmux session. **Spawn it** and **spawn an agent**
mean the internal sub-agent. Delegation using neither vocabulary is your call and needs no
extra confirmation.

**Your work record** is the owner's account of your task, progress, tracked documents,
worktrees and team. `read_tegami` prints it; `write_tegami < block.json` replaces your
block with the JSON on stdin. The shape is in the letter you were seeded with and in the
`write_tegami` row of `ronin_catalogs/TOOLS.md`. Keep it true whenever your task, position
or documents change.

**Other sessions.** Check the session's `@ronin-control` dial before reading or writing it;
only the owner changes a dial, and a refusal is an answer, not a retry. `tejun-peek
<session>` shows its recent live pane. `tejun-send <session> <message...>` delivers one
message; open with `from @<your session>:` since the tool adds no watermark, report
`DELIVERED` or `QUEUED`, and do not relay replies.

**Your team's board** already exists if you are on a team:

```bash
tejun-wipeboard                  # everything you have not read
tejun-wipeboard post <text...>   # post; the default interrupts the team lead
```

`--to <session,session>` also interrupts those, `--to all` everyone, `--to none` nobody;
addressing changes who is interrupted, not who may read. Never post to acknowledge — your
read is recorded. Posts expire after 48 hours; lasting facts go in your work record, a
document or a commit.

If a named tool is not on `PATH`, say so; do not reproduce its guarded job with raw tmux,
Git or store access. Full procedures are the compiled macro and the rows of
`ronin_catalogs/TOOLS.md` and `ronin_catalogs/ACTIONS.md`.
