# Edges
- **label:** Edges
- **blurb:** How do I work across an Agent, Team, wipeboard, schedule, or visible workspace boundary?
- **class:** cowork
- **requires:** —
- **order:** 10

Reach for this bundle whenever work crosses out of this session: one-to-one messaging,
Team-wide posts, another session's recent view, rosters, Team pages, schedules, or visible
Control. Nothing here changes your own record; that belongs to Work Record.

**Tell** means message another Agent with `edges send`. **Wipeboard** means read or share
a Team note with `edges wipeboard`.

## Tools

| Tool | Authority | Teach | Help |
|---|---|---|---|
| `edges send` | write: one message to one session | priority | `edges --help` |
| `edges wipeboard` | read/write: the Team's board | priority | `edges --help` |
| `edges read` | read: another session's durable record, or live fallback | priority | `edges --help` |
| `edges team` | read: a Team's sessions | priority | `edges --help` |
| `edges page` | read/write: the Team page | | `edges --help` |
| `edges schedule` | read/write: the Team's Cron jobs | | `edges --help` |
| `edges control` | read: a session's Control setting | | `edges --help` |

`edges send` delivers one message to one session, with no board in between. The Tell
delivery automatically opens with the sending session's name from the queue record;
do not write a second `from @<your session>:` line. If the sender cannot be resolved,
the delivery says so rather than implying the owner or Team lead spoke. Report
`DELIVERED` or `QUEUED`; both are accepted outcomes, and you do not relay replies.

`edges wipeboard` is the Team's board: post rules, collisions, line state, and anything
everyone must see. A bare post interrupts the lead; `--to` changes who is interrupted, never
who may read. Never post to acknowledge — your read is recorded. Posts expire; lasting facts
go in your work record, a document, or a commit.

`edges read` reads another session's durable settled record first. Only when no record
exists does it fall back to the recent live view, which is partial; there is no second
command to learn.

`edges control` reads a session's Control setting. Control is the owner's visible setting;
no Agent operation raises another session's Control.

Forking into a new Agent crosses a boundary too, but it belongs to the Session bundle,
not here.
