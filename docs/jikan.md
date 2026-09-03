# JIKAN — the house's clock, and Cron jobs on it

JIKAN (時間, "time") is the rails for everything timed in Ronin (owner, 2026-09-03). One
clock in `src/jikan.ts`, and every rhythm the server keeps is a tick on it:

| tick | period | what it does |
|---|---|---|
| `message_queue` | 2 s, once at boot | retries queued session messages (`src/message-queue.ts`) |
| `sessions_broadcast` | 2 s | pushes the membership list to open browsers (`src/ws/events.ts`) |
| `tomodachi` | hourly, once a minute after boot | sweeps the Stats outbox (`src/activation/tomodachi.ts`) |
| `jikan` | every minute, once 5 s after boot | delivers the scheduled requests below |

The clock is the one implementation of "do this on a rhythm": never two runs of one tick at
once (a slow job is skipped, not stacked), a throw recorded on the face and never escaping,
nothing holding the process open, one boot-run rule for the machine that was off when its
moment came, and one face (`clockFace()`) that says what is on it and how its last run
ended. Nothing else in `src/` sets a timer for a rhythm; a new rhythm is `onClock({ … })`.
That is what makes one fix fix all of it.

**Cron jobs** are the first thing built on those rails, and the owner's word for them. A job
is one request delivered to one agent of a team at a moment or on a rhythm. That is the
whole object. It births nothing: the team and the agent exist already, and the job only
says what words reach whom, when.

## The shape

| field | means |
|---|---|
| `request` | the words delivered, exactly — `+brief:`, or a sentence |
| `to` | a session name on the team, or `lead` for whoever leads it when the moment comes |
| `when` | timing words (below) |
| `state` | `active` · `paused` · `done` (done is the clock's alone: a one-time job after it fires) |
| `by` | who asked — a session name, or `owner` |
| `next_run` · `last_run` · `last_outcome` · `runs` | the clock's own record, beside the job |

Timing words, compiled to the same thing a cron line says, on the machine's local clock:

```text
once 2026-09-04 08:00            one time (`at …` is the same)
daily 08:00 · weekdays 08:00     every day / Monday to Friday, at that time
weekly mon 08:00                 one day a week (mon … sun, or a list: mon,thu)
monthly 1 09:00                  one day of the month
hourly · every 30m · every 2h    on a period, from when it was set
0 8 * * 1-5                      a five-field cron line, when the words are not enough
```

## Where it lives, and how it runs

One Markdown file per team in the `jikan` store (`bin/ronin-store jikan`), the house's
`## id` + `- **key:** value` shape — hand-editable, kept across upgrades, an uninstall
leaves it. Ronin is always on, so `src/jikan.ts` ticks once a minute over every team's
list and delivers what is due through the ordinary message door (`src/message-queue.ts`):
the dial is honoured, a session that cannot take input right now gets it queued, and the
Messages tab shows the line like any other, from **Cron jobs**.

Three rules decide the edges:

- **A missed moment fires once, never a backlog.** `next_run` sits beside the job; if Ronin
  was down when it was due, the next tick fires it once and computes the next from now.
- **A gone session is a refusal, not a birth.** `to: lead` resolves live, so a new lead
  inherits the job; a named session that is not on the team leaves `refused: …` in
  `last_outcome` for the owner to see. Nothing on the clock raises a team or an agent.
- **Nothing outbound.** A job reaches a session on this machine. What that session then
  does with the outside world is its own mandate's business, behind the owner's yes.

## The two doors

**The Cron jobs tab** on the team commons (`public/js/team-jikan.js`): what is the request,
to whom (the lead, or a live member), when — with the next three moments shown as the words
are typed — then the scheduled list (pause · run now · remove) and the done list.

**`tejun-jikan`** for an Agent (`ronin_bin/tejun-jikan`, Ronin Base): the same list, `add`,
`pause`, `resume`, `remove`, and `when "<timing>"` to prove the words. Adding a job is a
`schedule-request` — a propose-and-confirm, because it commits the owner's machine to future
action: the agent says the request, who and when in the tile, and adds it on the yes. This
is how a chief of staff asks for its own 08:00 wake-up.

The floor is `tests/jikan-clock.test.ts` for the clock (never stacked, a throw contained, a
restart replaces) and `tests/jikan.test.ts` for the jobs: the timing words, the file, the tick
with a fake clock and a fake door, the once-not-backlog rule, and `lead` resolving live.
