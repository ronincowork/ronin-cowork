# JIKAN — the house's clock, and Cron jobs on it

JIKAN (時間, "time") is the one clock every timed thing in the server rides: the message queue's retry, the sessions broadcast, the Tomodachi sweep and the
Cron jobs are each a tick on it — an interval that never overlaps itself and never throws
out, in `src/jikan.ts`. Nothing else in `src/` sets a rhythm, so one fix fixes all.

**Cron jobs** is the owner's word for the requests on it, and a job is a ping, not
infrastructure: one request, one session of an active team (by name, or `lead`), one `due`
date. Every minute the clock asks *is anything due at or before now?* — if yes, the words
go through the ordinary message door (`src/message-queue.ts`, so the dial is honoured and a
busy session gets it queued), and the job is marked: done for a one-time job, the next due
for a repeat. A missed beat is just missed. *Run at next tick* sets `due` to now. Nothing
here births a session or a team; a job whose session is gone leaves `refused: …` in `last`.

```text
```

The list is one Markdown file per team in the `jikan` store — `## id` with `request`, `to`,
`when`, `due`, `state` (`active` · `paused` · `done`), `last`, `by` — hand-editable and the
owner's. Two doors: the **Cron jobs** tab on the team commons (`public/js/team-jikan.js`)
and `tejun-jikan` for an Agent (`ronin_bin/tejun-jikan`, Ronin Base). The command calls
the operator's HTTP JIKAN surface and prints its reply. Adding one is a
`schedule-request`: a propose-and-confirm, since it commits the owner's machine to future
action. The floor is `tests/jikan.test.ts`.
