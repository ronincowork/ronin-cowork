# edges
- **seed:** message an Agent, post to the Team's wipeboard, read another session
- **when:**
- **depth:** seed
- **serves:** cowork-agent
- **order:** 10

Use `edges` whenever work crosses out of this session: a Tell to one Agent, a post to the
Team's wipeboard, another session's record, rosters, Team pages, schedules. Your own record
is `work-record`'s; a new Agent is `session_create`'s.

**Tell** (`edges send <session|team> "<text>"`): to one session, or a Team's live lead. The
queue shows your name and channel; don't add a `from` line. `DELIVERED` and `QUEUED` both mean
done; don't relay replies. `NO-SESSION`: no such session or led Team, nothing queued.

**Wipeboard** (`edges wipeboard`; `edges wipeboard post "<text>"`): the Team's board, for
what everyone must see: rules, collisions, line state. A bare read prints what you haven't
read. A bare post interrupts only the lead; `--to a,b` adds those two, `--to all` everyone.
Address whoever has to act. Being pointed at a board is not a reason to post; never post to
acknowledge, since your read is recorded. Posts expire after 48 hours; lasting facts go in
your record, a document or a commit.

**Read** (`edges read <session> [lines]`): its settled record first; only when it has none,
its recent live view, which is partial.
