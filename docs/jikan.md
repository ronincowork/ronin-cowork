# JIKAN — the house clock and Cron jobs

JIKAN (時間, "time") is the server clock used by Cron jobs and other timed work. Its
intervals do not overlap. Cron jobs are scheduled messages; they do not start an Agent or
a Team.

A **Request** is the plain message an Agent receives, exactly as if a person typed it to
the Agent. A `+name:` macro is one optional kind of Request, never a requirement. **To** is
the Team lead by default or a named member. **When** may be once at a date and time, every
day at a time, weekdays at a time, weekly on a day and time, or every N hours. Advanced
accepts the house grammar. The form previews the next three runs. **Expires** is optional;
a recurring job becomes Done with an expired outcome after that date.

The Team commons shows that Team's jobs. The Coworks workbench offers a Cron jobs card
with the same sortable, filterable table across every Team. New job expands the shared
form in place. Rows show To, Team, Due, Message, one-off or recurring, Expires, State,
recent outcomes, Set by, and actions. Due is relative; hovering it shows the absolute time,
the machine timezone, and the next three runs. Filters and sorting stay with the browser
tab. A person can edit, duplicate, pause, resume, run, or remove a job there.

Every minute the clock delivers due Requests through the ordinary message door. Busy
Agents receive a queued message. One-off jobs become Done; recurring jobs receive their
next due time. Each job retains its five latest outcomes.

Jobs are stored as one hand-editable Markdown file per Team. Each record has `request`,
`to`, `when`, `due`, `expires`, `state`, `last`, `history`, and `by`.

Agents use `tejun-jikan`, with the same Request, To, When, Expires, and one-off/recurring
fields as the form. Their session name appears under Set by:

```sh
tejun-jikan add --to lead --when "weekdays 09:00" --kind recurring \
  --expires "2026-12-31 17:00" --team studio "Review the overnight results"
```

Bare `tejun-jikan` lists the current Team's jobs. `pause`, `resume`, `now`, and `remove`
change one. The command is a thin client of the operator's HTTP JIKAN surface. The
behavior floor is `tests/jikan.test.ts`.
