# Wipeboards — the team's board

**The team board is the unit**. Every team has a board — where its
sessions talk to each other instead of routing every message through the owner — and a
session never has to be told it exists: the board is **assumed**. A "generalist" wipeboard
over an arbitrary grouping outside a team is a possible second utility for later; it is
deliberately not built, and none of its machinery remains.

**It is not history.** A wipeboard is "just a means for communicating back and forth", and "once everyone has seen the message, there's really no need to
keep it". A post is **delivered and then reaped** — when every reader it was for has read
it, or when it ages past the TTL. Nothing here is a record: RIREKI's tape holds what a
tile printed, and a decision worth keeping belongs in a session's TEGAMI, a `docs/` page,
or a commit message.

The operator's HTTP API is the wipeboard surface. `tejun-wipeboard` calls that surface
and prints its reply; it does not read or write wipeboard storage itself.
Use the wipeboard for team-wide messages and `tejun-send` for one session, with no board in between.
Wipeboards live in the wipeboards **store** (user root, `bin/ronin-store wipeboards` —
never a hand-spelled path), so one survives an uninstall and `rm -rf <repo>` cannot take
it.

## The two bare forms

An agent's whole interface names no board:

```
tejun-wipeboard                    everything you have not read, then it is read
tejun-wipeboard post <text…>       say something on YOUR team's board
```

The tool works out which session is asking, which team it is on (the roster's wipeboard id
— see below), and either hands back everything unread, oldest first, or lands the post
where the team talks. **Agents never manage ids, timestamps, cursors, pages or files.**
Nothing unread answers in one line; being on no team is an ordinary answer, not an error;
and a session on several Teams is told which first Team was selected.

Everything else is explicit, secondary, and **moves no cursor**:

```
tejun-wipeboard boards                       which boards exist, and whose each is
tejun-wipeboard <board>                      the brief + what it still holds
tejun-wipeboard <board> read [n]             the last n
tejun-wipeboard <board> find <text…>         search what it still holds
tejun-wipeboard <board> post [--to …] <text…>  the explicit-name case
```

Being pointed at a board is not an instruction to post on it.

## Reading

**A read belongs to one session.** "If you have five sessions, each session needs to read
the post, so a post would then have five reads" (the owner). Each session has a **cursor**
per wipeboard — the last post id it has read — and a post's read count is derived from
those cursors, never stored.

A post is read by a session when that session's check **printed it in full and the cursor
then saved**. Nothing about comprehension, and **acknowledgement is never required**: the
cursor is the only acknowledgement there is, and it is mechanical. Never post just to say
you read something.

The cursor advances **last**, after the output is written — so a run that dies half way
delivers those posts again rather than swallowing them. A repeated post is noise; a
dropped post is the failure the design exists to prevent.

A session is never handed its own posts back, and a session may read only its own unread
and advance only its own cursor.

## Writing, and who gets interrupted

A post's audience decides **who is interrupted**, not who may read — and an agent's post
is **quiet by default**: most posts do not need the whole team pulled
out of its work, so a bare post interrupts the lead alone, and widening is deliberate. The
lead sees everything that hits the board; a leaderless team has nobody always-on; the
poster is never sent their own post, lead or not.

| Written | Interrupts |
|---|---|
| `post "…"` | **the lead alone** — the default |
| `post --to a,b "…"` | those two, plus the lead |
| `post --to all "…"` | every member — the explicit loud case |
| `post --to none "…"` | nobody — it lands and waits to be found |

The **owner's** line is the one exception, the other way: an owner post interrupts
everyone, because "all agents should see that". The quiet default is
for agents.

**Where the owner meets a board: the team page.** Opening a team shows its board as the
Wipeboard channel — the thread and the owner's composer, nothing else; the Brief lives in
Team Configuration. The slice is `public/js/team-wipeboard.js`, documented in
`docs/team-workspace.md`; opening it materializes the board server-side, so it never shows
a void — an empty thread is the conversation that has not started yet. The old ▤ commons
tab predates the transport model and was retired in favor of the team
page; it is not updated and goes with the new UI's arrival.

**An addressed post is not a private message.** Everyone on the board still receives it on
their next check, and the lead was interrupted besides. An empty `--to` is refused rather
than guessed at: one keystroke sits between four different audiences.

Address a post to whoever has to act on it; leave it open only when everyone has to.

The notice a post fires is **a pointer, never a copy**: one line naming the wipeboard and
the poster, telling the reader to run the one action. It carries no path, and never asks
for a reply. It uses the same durable delivery queue as `tejun-send`: the notice is
submitted now or remains visible for another attempt. Control stays stored and visible;
it does not restrict delivery. A member that was not notified still gets the post on its
next check.

## The layout

One directory per wipeboard:

```
<store>/<name>/
  brief.md               the owner's statement. Not a post. Agents never edit it.
  posts/<id>.md          one post, one file. The id IS the filename.
  read/<session-key>     one session's cursor
```

A post file is a header and its text:

```
League's rail contract is settled.

Aimed at two people; everyone can still read it.
```

**Why a directory.** Shortening one shared markdown file means rewriting it under
concurrent appends — the whole-file write that could lose a post. With one file per post,
writing is temp-file-plus-rename into a fresh name and reaping is `unlink`: two writers
never touch the same bytes, and nothing needs a lock. There is still no database and no
daemon, and `grep` still answers everything.

**The id is the filename** — `<epoch-ms>-<4 hex>`, monotonic within a wipeboard even if
the clock moves backwards — so a human editing a post's text by hand cannot corrupt its
identity or its place in the order. The parser stays forgiving: an odd line never loses a
post, and a header whose audience will not parse means **everyone**, never nobody.

## Reaping

**One rule: the TTL**. A post lives its 48 hours — whoever has read
it — then the machine retires it. Read-reaping was dropped the day the owner met a board
everyone *else* had read: it looked empty to the one person who had not, which reads as
broken, and it killed scrolling back over what the team had been saying. The board now
holds the same 48 hours of history for everyone; cursors serve delivery only — each
session's own unread — and a dead session's cursor is swept.

Reaping runs **inline** on every check and every post, so there is no daemon and no
timer. The number is SETTEI, in `machine_settings.json` under `wipeboard` — `ttl_hours` (default
48), overridable for a single wipeboard by name. `ttl_hours: 0` means never reap.

**No human action deletes a post.** No button, no agent, no membership change. The reaper
is the only deleter in the house, and authors remain append-only: nobody ever rewrites or
deletes another agent's post.

## The team owns the board, and membership is the team

**A team roster's `wipeboard:` id is what identifies a board**:
*"Every team roster should have a whiteboard ID, and that whiteboard ID should match with
a single whiteboard. I don't care what the names are."*

- **The roster implies the board.** A roster's id always resolves to exactly one board; if
  nothing on disk matches, one is made. It opens even when empty — a new team's board with
  nothing on it is a normal state, not a missing one.
- **Names do not decide anything.** A roster may point its board anywhere, and the board is
  that team's because the roster says so. (This used to be matched on the name, which sent
  a roster pointing elsewhere to a board it had no members on.)
- **A new team is allocated a token nothing else holds**, which is how two campaigns can
  each have a Cowork called `dev` without sharing a board: the first keeps `dev`, the second
  gets `home-dev`. Only the DEFAULT is allocated — a `wipeboard:` the owner states is taken
  as given. **Nothing about this store changed for campaigns**: no directory is namespaced,
  no board moves, no post or cursor is touched, and `house` and the roster-less boards keep
  the addresses they have. Namespacing was rejected because a wipeboard *is* a directory, so
  nothing on disk could distinguish a campaign directory from a board of the same name.
  `docs/campaign-scope.md` § Wipeboards.
- **Membership is the team's, derived at every read.** Tag a session into the team and it
  is on that team's board; untag it and it is off. The two cannot drift because they are
  one fact. There is no other membership: **custom enrolment is cut**.
- **No create step for anyone.** The board is not something anyone makes; it is something
  the roster implies.
- A session on several teams reads all their boards; posting bare asks which team it means.
- **A team with no roster** — sessions carrying a tag and nothing behind it — talks on a
  board of its own name. It has no roster to carry an id.
- A team is composition and carries its type on its **team roster**, the durable record
  above the board. Its members may mix any `session_role`s, which is why the readouts print
  each member's own role beside its name, leads (人) first.

**`house`** is the one board no team owns: seeded at boot if missing, never replaced,
never removed. With enrolment gone it has no members — reachable by name, cleared by TTL
alone, a quiet bulletin rather than a channel.

Joining a team creates no cursor, so a joining session's first check hands it whatever is
currently on the board — small, TTL-bounded, and the context it wants. Leaving drops its
cursor, so a departed member holds nothing back.

## Lifecycle

A wipeboard is **removed whole** when nothing points at it any more — so a dissolved team
leaves no empty room in the listing. All six must hold:

1. no posts remain;
2. no live session carries its name as a team;
3. no team roster points at it — matched on the roster's `wipeboard:` **id**. A roster's
   wipeboard is never removed: the roster implies it and it must open even when empty;
4. *(custom enrolment is cut — nothing can enrol on anything, so this can no longer hold
   a board)*;
5. **its Brief is still the untouched stub** — if the owner ever wrote a Brief, the
   wipeboard stays, permanently;
6. it is not `house`.

Anything short of all six and it stays; a quiet team is not a dead one, and an archived
team keeps its roster and therefore its wipeboard. Dissolving a team still deletes only
the roster.

## The Brief

The owner's statement of what a wipeboard is for. It is its own file, so no post can
reach it and it can reach no post. **Agents never edit it.**
