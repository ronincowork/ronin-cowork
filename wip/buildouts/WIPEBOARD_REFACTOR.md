# WIPEBOARD REFACTOR — the wipeboard becomes a transport

> A plan. No code, no schema in the tree, no route, no migration run, until the owner
> says go. Written 2026-08-23 by `@wipeboard_refactor`.
>
> **Storage names in this document are illustrative.** Nothing under *Storage* exists in
> the tree yet — the directory sketch names a layout this plan proposes, and prose outside
> that sketch describes the parts rather than asserting filenames. Paths that ARE cited as
> fact — `src/wipeboards.ts`, `ronin_bin/tejun-wipeboard`, `public/js/wipeboard.js` and the
> rest — were read out of the working tree and are checkable today.

---

## CURRENT STATE / RESUME HERE

**As of 2026-08-23 17:36 UTC. `dev` @ `989daa5`, pushed, working tree clean for every file
below. `bin/ronin-byoin --gates`: clean, 16 ok, 2 skipped.**

### Completed behaviour

- `tejun-wipeboard` (bare) — resolves the calling session, resolves its wipeboards
  (tags + enrolments), prints everything unread oldest-first per wipeboard, excludes the
  caller's own posts, then advances each cursor. Verified by hand end to end.
- Nothing unread → `nothing unread — N wipeboards, all caught up`, exit 0.
  On no wipeboard → `nothing unread — you are on no wipeboard`, exit 0.
- `tejun-wipeboard boards` · `<name>` · `<name> read [n]` · `<name> find <text>` ·
  `<name> post [--to a,b|none] <text>`. `read`/`find`/`boards` move no cursor.
- Posts: one file per post, id `<epoch-ms>-<4hex>` = the filename, monotonic per wipeboard
  against a backwards clock. Header `### @a → @b, @c · YYYY-MM-DD HH:MM`; `→ (no notice)`
  for silent. Unparseable audience parses as everyone.
- Cursors: `read/<session-key>`, one per session per wipeboard. Read count derived, never
  stored. High-water advances past everything **examined**, not everything printed.
- Reaper: read-reap on required readers + grace, TTL backstop, dead-cursor sweep. Runs
  inline on check and on post — no daemon, no timer.
- Lifecycle: whole-wipeboard removal on all six conditions; roster matched on its
  `wipeboard:` **token**; an owner-written Brief keeps the wipeboard permanently; `house`
  never removed.
- Verdicts confirmed by hand: `BAD-ADDRESSEE` exit 2 on empty `--to` (nothing posted),
  `BAD-NAME` exit 2, `NO-WIPEBOARD` exit 3, `NO-SESSION` exit 3.

### Files I own (all committed in `989daa5`)

| File | State |
|---|---|
| `src/wipeboards.ts` | rewritten whole |
| `src/wipeboard-cli.ts` | new — the one action lives here |
| `tests/wipeboards.test.ts` | rewritten whole — 33 assertions |
| `ronin_bin/tejun-wipeboard` | reduced to a 30-line tsx wrapper (was 402) |

### Shared seams I touched — other workstreams read these

| Seam | What I changed | Consequence for others |
|---|---|---|
| `src/routes/wipeboards-api.ts` | rewired to the new core; `mtime` → `newest`; added `GET /:name/unread`; addressed fan-out; inline sweep | imported by `src/index.ts`, `routes/launch.ts`, `routes/sessions-api.ts` (via `announceTeamChanges`, unchanged in signature) |
| `src/user-config.ts` | appended `readWipeboardSettings` + two private helpers. **Nothing existing altered** | imported by auth, tmux, index, settei, passkey, koshi |
| `boardExists()` semantics | now true only for a **directory** | `routes/teams-api.ts` (`wipeboard_exists`) and `routes/launch-preflight.ts` (`adoptsWipeboard`) now report **false** for every legacy `.md` wipeboard. Affects New Team / preflight |
| `boardPath()` | returns a **directory**, not a `.md` file | `src/lookup.ts` prints it in `+wipeboard:` output |

### Uncommitted

**None of mine.** The working tree carries other agents' uncommitted work (workspace-kit,
league, customize, new-team, agent-config, settei/passkey) — untouched by me and not staged
in `989daa5`.

### Verification actually run

- `npx tsx --test tests/wipeboards.test.ts` — **33/33 pass**. Target: `src/wipeboards.ts`
  only, in a temp store, no tmux. Does **not** cover `src/wipeboard-cli.ts`, the API, or
  the tab.
- `bin/ronin-byoin --gates` — clean, 16 ok, **2 SKIP** (`smoke-ui`, `visual-ui`; fast mode
  drives no browser). A SKIP is not a pass: no browser verification has been run at all.
- Hand smoke of the CLI against temp stores using the `RONIN_SESSION` / `RONIN_BOARDS` /
  `RONIN_MEMBERS` seams. Not automated, not in the gate.

### Known failures and limitations

1. **The ▤ Wipeboard tab is broken against the new server.** `public/js/wipeboard.js:327`
   compares `r.data.mtime`, which the API no longer returns. Traced: first poll renders,
   `mtime` becomes `undefined`, every later poll early-returns on
   `undefined === undefined` — **the thread renders once and then never updates.** Known
   and accepted cost of cutting clean; it is the next action.
2. **`src/lookup.ts:70` teaches the old commands** — the `+wipeboard:` expansion still says
   `tejun-wipeboard <name> read` / `post`. Both still work, so this is wrong guidance, not
   a break.
3. **No automated coverage of the CLI, the API, or the tab.** Only the storage core is on
   the unit floor.
4. **Live store on this box:** a new-format house wipeboard (a directory, empty) sits
   alongside six legacy single-file wipeboards — five-eyes, gbrain_service, gbrain_settei,
   house, migration, new_gh_user. **The new code does not see any of the six.** This is the owner's accepted
   fresh-start loss; the files are untouched on disk.
5. **`docs/wipeboards.md`, KOTOBA, the glossary and the three catalogs still describe the
   old model.** No vocabulary work has been done.
6. **D1–D13 are unruled.** The code implements the recommended answer on each. D13
   (roster token vs name) is implemented for the **lifecycle rule only**; the membership
   predicate still matches on name, deliberately left alone.

### Blocker

None. Nothing is waiting on anyone.

### Single next action

Update `public/js/wipeboard.js` to the new payload: `mtime` → `newest`, add paging via
`?since=`/`?limit=`, render the cleared line, add the addressee field to the compose row.
Then `bin/ronin-byoin --ui`, which is the first browser verification this work will have had.

## Goal — the owner's words

> "Every team will have a wipeboard. That's the 80/20. There could be additional
> wipeboards which we may create, like kind of a side wipeboard between two, but let's
> focus on just the one wipeboard per team."
>
> "If we have a size problem, we should just start TTL and shit because we don't need to
> keep it. **This is not history. This is not a document that persists. This is just a
> means for communicating back and forth.** In fact, once everyone has seen the message,
> there's really no need to keep it. We could just make it very, very fluid, maybe after
> only a certain amount of time, so if someone wanted to read it, but I doubt it. These
> should be concise posts that, once everyone digests, go away. It's just a means of
> sharing information to a broader group. Or two agents talking to each other if they need
> to share something back and forth."
>
> "Yes, absolutely, the owner should be able to inject a comment, so if currently at the
> bottom of the wipeboard the owner can type a message, then all agents should see that."
>
> "**A read post is only read by a single session. If you have five sessions, each session
> needs to read the post, so a post would then have five reads.**"

And the hard requirement that shapes every surface below:

> "The tools and agent skill/instructions must make this a one-action workflow. An agent
> should do nothing beyond **check wipeboard**. The tool identifies the current session and
> wipeboards, returns only posts since that session's durable cursor in chronological
> order, and advances the cursor only after successful complete output. If nothing is
> unread, answer that plainly and cheaply. **Never make agents manage IDs, timestamps,
> cursors, pagination, acknowledgements, or files.** Full history/search is an explicit
> secondary command, never the default."

---

## The ruling this rests on

**A wipeboard is a transport, not a record.** That is a change to what the word means, and
it belongs in KOTOBA before any code moves. Today `docs/wipeboards.md` and KOTOBA's
`wipeboard` row both describe an append-only file that only a deliberate `rm` ever
shortens; the lifecycle section says in the owner's own earlier words that *"nothing on a
button deletes a file"*. The owner has now ruled the other way for post content: posts are
**delivered, then reaped**.

The two rulings are reconcilable and the distinction must be written down precisely,
because it is the whole safety argument:

- **No human action deletes a post.** No button, no agent, no `add`/`remove`, no close.
  That older ruling stands untouched.
- **The machine reaps a post on a rule** — every reader it was for has read it, or it aged
  out.
  Reaping is not editing and it is not a button; it is the wipeboard doing the one job it
  now has.
- **Authors are still append-only.** No agent ever rewrites or deletes another agent's
  post. The reaper is the only deleter in the house.

**Nothing is actually lost, and this is the reason the ruling is safe.** A post an agent
read was printed into that agent's tile, and RIREKI's tape is the durable record of
everything a tile printed — it answers with no tile open and even when Ronin is not
running. A decision worth keeping belongs in the session's TEGAMI (`decided`) or in a
`docs/` page or the manifest. The wipeboard was never the right home for either, and 436 KB
of five-eyes traffic is the evidence that treating it as one does not work.

---

## What is wrong today — evidence, measured

All of this was read out of the working tree and the live wipeboards store on 2026-08-23.

**1. A post has no identity and no total order.** The header is `### <author> · HH:MM`
(`src/wipeboards.ts:144`, and the same shape written by `ronin_bin/tejun-wipeboard:150`).
No date, no seconds, no id. On the live `five-eyes` wipeboard **42 distinct HH:MM values
are carried by more than one post**. A post is addressable only by its byte offset in a
file, which is not an address. Everything in the owner's requirement — *"since that
session's cursor"*, *"chronological order"* — needs an identity that does not exist.

**2. The size problem is not theoretical.** The live five-eyes wipeboard, in the
wipeboards store rather than this repo, was **265,328 bytes / 71 posts /
5 authors** when this session began reading it and **436,053 bytes / 122 posts / 6 authors**
about ninety minutes later. One team, one working day.

**3. Every notice tells every agent to re-read a slab.** A post fires a `tejun-send` notice
ending *"Read it: `tejun-wipeboard five-eyes read`"* (`ronin_bin/tejun-wipeboard:346`), and
`read` prints **the last 20 posts plus the Brief** by default (`:376`, `:389`). Six agents
notified on every post, each re-reading twenty posts it has mostly already read, with no
way to tell what is new. That is the cost the one-action requirement exists to end.

**4. There is a real write that can lose posts, and it is not the append.** `O_APPEND` is
genuinely safe: `appendPost` (`src/wipeboards.ts:171`) and the shell's `>>` (`:150`)
interleave whole posts and that is a sound concurrency story. But `setBrief`
(`src/wipeboards.ts:182`) does read-whole-file → `writeFile` whole-file: **not atomic, no
temp+rename, no lock**. An append landing between that read and that write is lost, and the
API materialises a team wipeboard through this path (`wipeboards-api.ts:196`). `write_tegami`
already does atomic temp+rename in this house; the wipeboard does not.

**5. The ▤ Wipeboard tab fetches the entire wipeboard every two seconds.**
`GET /api/wipeboards/:name` returns every post (`wipeboards-api.ts:146`); the `mtime` guard
in `public/js/wipeboard.js:327` only skips the re-render, not the transfer. On today's
five-eyes that is 436 KB every poll.

**6. A born session never hears the word.** `grep -rn wipeboard ronin_session_boot/`
returns nothing. An agent meets the wipeboard only through `SESSION_MACROS.md`'s
`+wipeboard:` blurb, `ACTIONS.md § wipeboard-post` and the `TOOLS.md` row — none of which a
session reads unless something sends it there.

**What is already right and is not being touched:** membership derived and never stored;
the dial as law throughout; the owner's watermark; the forgiving parser; the wipeboards
store as the home; the notice as a pointer and never a copy; posts never rewritten by
another hand; and — verified in `public/js/wipeboard.js:92-99, 356` — **the owner's compose
row at the bottom of the tab already exists and posts today.**

---

## The model

Six nouns. An agent meets none of them.

| Term | What it is |
|---|---|
| **post** | one entry: an author, a time, and text. Now individually addressable |
| **post_id** | `<epoch-ms>-<4 hex>` — e.g. `1787241234567-a3f1`. Monotonic, lexically sortable, collision-free across concurrent writers, and **it is the filename**, never a line inside the post |
| **read_cursor** | per (wipeboard, session): the `post_id` that session has read up to. Durable, one tiny file |
| **read** | a post is *read by a session* when that session's check printed it in full and the cursor write then succeeded. Nothing about comprehension; nothing about acknowledgement |
| **addressee** | a session a post was aimed at. A post that names none is aimed at everyone |
| **required reader** | **the one definition reaping turns on**: a post's addressees if it names any, otherwise every live member. Used everywhere below in place of "everyone" |
| **reap** | the machine deleting a post that every **required reader** has read, or that has aged past its TTL |

**"A post has five reads" is derived, not stored.** Post `P` is read by session `S` iff
`cursor(S) >= id(P)`. With five members, `P`'s read count is however many of the five
cursors sit at or past it. No matrix, no per-post receipts, no write amplification — and it
is exactly the owner's sentence, made mechanical.

**Why a cursor is sufficient and a receipt matrix is not needed.** The one action always
delivers *everything* unread, *in order*, and advances to the last post it printed. Reads
can therefore never be out of order or partial-in-the-middle, so a single high-water mark
carries all the information a matrix would.

### Ordering

Lexical sort of `post_id` is chronological. One machine, one clock, so there is no skew
problem; the 4-hex suffix breaks ties between two writers inside the same millisecond. The
epoch-ms field is 13 digits until the year 2286, so lexical and numeric order agree.

---

## The one action

```
tejun-wipeboard
```

That is the whole thing an agent ever does. Bare, no arguments, no wipeboard name — because
a session may be on several wipeboards and choosing between them is exactly the management
the owner ruled out. The tool:

1. resolves the session it is running in (a pane resolves to its non-viewer owner, so a
   tile watching a session through a grouped viewer still answers as that session);
2. resolves that session's wipeboards (its teams, plus any custom enrolments);
3. reads its cursor on each;
4. prints every post after those cursors, oldest first, wipeboard by wipeboard, **never
   including the session's own posts**;
5. **then** advances each cursor past everything it examined in this run — the last post
   printed, *or* one of the session's own posts if that sorts later. Advancing only to the
   last *printed* post would leave your own post ahead of the cursor forever.

Cursor advance is the last thing that happens, after the output has been written and
flushed. If the cursor write fails, the tool says so and exits non-zero: the posts will be
delivered again next time. **At-least-once, never at-most-once** — a repeated post is
noise, a dropped post is the failure this whole refactor exists to prevent.

### CLI UX — the exact faces

Unread, the ordinary case:

```
$ tejun-wipeboard
WIPEBOARD five-eyes — 2 unread

### @eye_league · 2026-08-23 13:36
League's rail contract is settled: sections carry counts, provenance rides the row.

### @eye_team · 2026-08-23 13:36
ACK — team workspace consumes the rail unchanged.

read: 2 posts on 1 wipeboard
```

Nothing unread — plain and cheap, one line, one `readdir` per wipeboard and one small read
per cursor:

```
$ tejun-wipeboard
nothing unread — 3 wipeboards, all caught up
```

A rōnin, or a session on wipeboards nobody has posted to. **An ordinary state, exit 0, not
an error:**

```
$ tejun-wipeboard
nothing unread — you are on no wipeboard
```

The explicit secondary commands, which an agent uses only when it deliberately wants
history and which **never advance a cursor**:

```
tejun-wipeboard five-eyes read          # everything still on the wipeboard
tejun-wipeboard five-eyes read 5        # the last 5
tejun-wipeboard five-eyes find "rail"   # search what is still there
tejun-wipeboard five-eyes               # the roster + the Brief + where it lives
tejun-wipeboard boards                  # every wipeboard in play
tejun-wipeboard five-eyes post "…"      # append + notify everyone else on it
tejun-wipeboard five-eyes post --to @eye_team,@view_mgr "…"   # notify only those two
tejun-wipeboard five-eyes post --to none "…"                  # notify nobody
```

**Nothing is aliased and nothing is forwarded.** The bare form used to print a listing; it
prints unread now, and the old behaviour is deleted rather than kept reachable. `boards` is
not a new home for an old command — it is where the live *"which wipeboards exist"* readout
lives, because the ▤ tab needs that data and an agent occasionally does. The bare form is
the most valuable real estate the tool has, and it goes to the thing an agent should do.

### Failure semantics

| Verdict | Exit | Means | Cursor |
|---|---|---|---|
| posts printed | 0 | delivered | advanced |
| `nothing unread — …` | 0 | caught up, or on no wipeboard | untouched |
| `NO-SESSION` | 3 | run outside tmux, or only a viewer resolved — cannot say whose cursor to move | untouched |
| `NO-STORE` | 1 | the wipeboards store cannot be reached | untouched |
| `CURSOR-FAILED` | 1 | posts were printed but the cursor did not save; **says out loud they will arrive again** | untouched |
| `BAD-NAME` | 2 | a named wipeboard that is not a legal name | untouched |
| `NO-WIPEBOARD` | 3 | a named wipeboard that is neither a live team nor a directory in the store | untouched |
| `BAD-ADDRESSEE` | 2 | an empty `--to`, refused rather than guessed at — absent means everyone, `none` means nobody | untouched |

A post that reached the file is a post: as today, notification failures never fail a post
and never change its exit code, because teaching a macro to retry a post is how an entry
gets doubled.

---

## Storage

**A wipeboard becomes a directory.** In the wipeboards store (`bin/ronin-store wipeboards`
— never a hand-spelled path):

```
<store>/five-eyes/
  brief.md                       the owner's statement. Not a post. Never reaped.
  posts/1787241234567-a3f1.md    one post, one file
  posts/1787241299011-7c02.md
  read/eye_team-1787240001       one line: <last-read-post-id> <iso8601>
  read/user                      the owner's own marker (never gates reaping)
```

A post file is the shape that is already in front of everyone's eyes, with the date filled
in and the seconds no longer ambiguous:

```
### @eye_league · 2026-08-23 13:36
League's rail contract is settled: sections carry counts, provenance rides the row.
```

An addressed post carries its audience in the same header — see Addressed posts.

**Why a directory rather than one file plus a sidecar.** Reaping is the deciding argument,
not taste. Removing a post from a single shared file means rewriting that file under
concurrent appends — precisely the `setBrief` defect above, now on a timer. With one file
per post, **reaping is `unlink` and writing is `O_CREAT|O_EXCL` temp+rename into a fresh
name**: two writers never touch the same bytes, no lock is needed anywhere, and no rewrite
of shared state exists to lose a post in. It also keeps every original property the house
cares about — plain markdown, hand-editable, no database, no daemon, `grep` still answers
everything — and it adds one: because the id is the *filename*, a human editing a post's
text can never corrupt its identity or its place in the order.

**Atomicity, stated exactly.** Every write in the new module is temp-file-plus-rename
within the same directory: post creation, cursor advance, and the Brief. `rename(2)` on one
filesystem is atomic, so a reader either sees the whole thing or does not see it at all,
and a partially written file can never be observed. This closes finding 4 as a side effect
of the layout rather than by adding a lock.

**Metadata is derived, never copied** — the existing no-drift rule, unchanged. The name is
the directory name. The Brief is a file of its own, as sketched above. Whether it is a
**team wipeboard** or a **custom wipeboard** is read off the live teams at every ask, as
`isTeamBoard`/`is_team_board` do now. Membership is `@ronin-tags` (team) or
`@ronin-wipeboards` (custom). **Nothing else is stored**, and in particular no member list
and no kind marker: a stored one could drift, and a derived one cannot.

**TTL is SETTEI, on the established pattern.** The owner's config file in the config store
gains a `wipeboard` section, on the shape `src/user-config.ts` already uses everywhere — the generic
`readSection` plus one named `write…Section` helper over the private `updateConfig`, which
preserves every key it did not come to change. It is published onto the tmux server bus as
`@ronin-wipeboard-ttl` (the same job `publishMax` and `publishOwner` do) so the
zero-dependency bash tool reads it without a second JSON parser — the identical arrangement
`@ronin-session-max` and `@ronin-owner` already use. A per-wipeboard override is one key in that same section,
keyed by name; it is not a file in the store, so the store stays dumb and hand-editable.

---

## Reaping — the fluidity

Two rules. Whichever fires first wins, and both are the machine's.

- **Read-reap.** Every **required reader** of the post — its addressees if it names any,
  otherwise every live member — has a cursor at or past it → reap after a **grace period**,
  so a member mid-turn, or one born a minute later, still finds recent context.
- **TTL.** The post is older than the TTL → reap it regardless of who read it. This is the
  backstop that stops one idle-but-live session from holding a wipeboard hostage forever.

**Recommended defaults, for the owner to rule:** grace **60 minutes**, TTL **48 hours**.

**Who counts as a required reader.** An addressed post: its addressees. An open post: every
live agent member, read fresh at reap time — the same derived membership every other answer
uses. Either way **agents only**, and either way derived, never stored. A `--to none` post
has no required readers at all and is retired by the TTL alone.

- A **dead** session's cursor never counts and is swept, because its `@ronin-key`
  (`<name>-<created-epoch>`) never returns. A session relaunched under the same name has a
  new epoch, therefore a new cursor, and correctly sees what is currently on the wipeboard.
- A **live member with no cursor at all** (it has never checked) counts as having read
  nothing and does hold its wipeboard's posts — that is the correct answer, and TTL is what
  bounds it.
- The **owner never gates reaping.** A wipeboard the owner never opens must still reap. The
  owner's `read/user` marker exists only so the tab can show what is new since they last
  looked.

**Where the reaper runs: nowhere.** No daemon, no timer, no janitor — the house doctrine
holds. Reaping happens **lazily, inline**, on every check and every post: one `readdir` of
the posts, one small read per cursor, `unlink` what qualifies. That is cheap precisely
because TTL keeps the directory small, and it is self-correcting on a machine that was
switched off for a week. `src/index.ts` gets one opportunistic sweep at boot beside the
existing `seedHouseBoard()` call, for wipeboards nobody happens to touch.

**The Brief is never reaped by this rule**, and neither is an empty wipeboard directory
*while anything still points at it*: a wipeboard with zero posts is a normal, openable
state — the conversation that has not started yet. What happens when nothing points at it
any more is the Lifecycle section below, the only rule here that removes a wipeboard rather
than a post.

---

## Lifecycle — what happens when a team dies

**The owner's question, answered honestly: today the wipeboard does not go away, and the
plan as first written would have left exactly the graveyard the owner suspected.**

What the tree does now, verified: `deleteTeamRoster` in `src/team-rosters.ts` unlinks the
roster file and nothing else, and its own comment says why — *"the wipeboard is NOT
(nothing on a button deletes a file, owner 2026-08-07): it reverts to being a custom
board, or the owner removes it by hand."* `docs/wipeboards.md` then keeps the orphan
listed forever, on the reasoning that *"history survives a team's death and rebirth."*

**That reasoning is dead.** It was written when a wipeboard was history. Under the
transport ruling there is no history in there to survive — so an orphan is not a preserved
thread, it is an empty room with a stub sign on the door. Reaping alone would have turned
every team that ever existed into one of those.

**And the cost is not disk.** An empty wipeboard directory is a few hundred bytes; ten
thousand of them would not matter. The cost is **the listing** — the ▤ Wipeboard tab and
`tejun-wipeboard boards` both enumerate what exists, and a roll of two hundred dead
wipeboards is a surface nobody can read. That is the reason to remove them, and it is worth
being precise about, because it also says what *not* to do: never remove one merely to save
space.

### The rule

The reaper removes a wipeboard **whole** — directory, stub Brief and all — when **every one**
of these holds:

1. no posts remain (they all reaped);
2. no live session carries its name as a team;
3. **no team roster points at it** — tested against each roster's `wipeboard:` token, not
   against the name. A roster's wipeboard defaults to the team's own token but may name a
   different one, so matching on the name would delete a wipeboard a living team is using;
4. no live session enrols it as a custom wipeboard;
5. **its Brief is still the untouched stub.** If the owner ever wrote a Brief, that is the
   owner's writing and the wipeboard stays — permanently, and with no further argument;
6. it is not the `house` wipeboard, which is seeded at boot and never removed.

Anything short of all six and the directory stays. It is cheap, and a wrong deletion is not
recoverable.

### What that gives you, case by case

| Situation | Outcome |
|---|---|
| Team dissolved (roster deleted), nobody left, nothing said, stub Brief | **gone** — nothing points at it |
| Team dissolved, but the owner had written a Brief | **kept** — the owner authored something |
| Team **archived** (the roster's `state`), zero live members | **kept** — the roster still points at it; this is the plan without the execution, and KOTOBA calls it a normal, openable state |
| Roster alive, all posts reaped | **kept, empty** — the ordinary quiet team |
| Custom wipeboard, owner-made, gone quiet | **kept** — the owner made it on purpose; only their `rm` removes it |
| A team renamed by untag-and-retag | the old name's wipeboard reaps out; the new name's starts fresh. Unchanged from today, and now it does not litter |

**"Nothing on a button deletes a file" survives intact.** No button in this plan deletes a
wipeboard. Dissolving a team still deletes only the roster. What removes the empty room is
the reaper, on a rule, after everything in it was read — and the reaper remains the only
deleter in the house.

This amends `docs/wipeboards.md`'s Orphans paragraph, so it is **decision D9**.

---

## The owner's line

The compose row at the bottom of the ▤ Wipeboard tab already exists and already posts,
watermarked `user: <name>` so a steer is never mistaken for an agent's post. Two changes:

1. **An owner post now notifies every member**, through the same one `tejun-send` fan-out
   the shell tool uses — never a second delivery path. This reverses a documented
   asymmetry (`src/wipeboards.ts:19-24`: the owner has the tile dials, so their posts stayed
   silent). The owner's ruling is *"if the owner types a message, then all agents should
   see that"*, and the dial route is one-to-one while this is the broadcast case. **Flagged
   as decision D3** because it reverses a written ruling.
2. The owner's post is an ordinary post: it gets an id, it sits in the order, it is
   delivered by every member's next check, and it reaps on the same rules as any other.

**The dial stays law.** A 👤/👁 member is on the wipeboard, may read it, is never typed
into, and the refusal is reported rather than worked around. No dial is ever flipped to get
a notice through. A member that was not notified still gets the post on its next check —
which is a strict improvement on today, where a skipped notice meant a missed post.

---

## Addressed posts — who gets interrupted

**The owner's shape, taken as given:** a post with no addressees notifies everyone on the
wipeboard, as today; a post that names some notifies only those; and *"or none, I guess"* is
a real third answer.

**Is it hard? No.** The fan-out already resolves the roster and loops it
(`ronin_bin/tejun-wipeboard`'s post branch, and the same loop in the API). Addressing is a
filter on a list that is already in hand — it adds no new delivery path, no new state, and
nothing an agent has to remember between calls.

**It costs the reader nothing.** The one action does not change: an agent still types
`tejun-wipeboard` and gets what it has not read. Addressing is entirely a **writer-side**
concern, which is what keeps it compatible with the hard requirement.

### The one thing that must be said out loud

**An addressed post is not a private message.** Everyone on the wipeboard can still read it,
and everyone still receives it in their unread stream on their next check. Addressing
filters **the interrupt, not the post**.

That distinction has to be in the action page in those words, because an agent that
believes otherwise will put something on a shared surface it would not have. If the owner
wants a genuinely private exchange, that is the **side wipeboard between two** from the last
message — a custom wipeboard with two members — and it is a different mechanism, already
built.

### The form

| Written | Notifies |
|---|---|
| `post "…"` | everyone on the wipeboard except the poster — today's behaviour, unchanged |
| `post --to @eye_team,@view_mgr "…"` | those two, and nobody else |
| `post --to none "…"` | nobody. It lands on the wipeboard and waits to be found |

**An empty `--to` is refused, never interpreted.** *Absent* means everyone and *none* means
nobody — opposite meanings one keystroke apart — so the empty string is a `BAD-ADDRESSEE`
error rather than a silent guess. This is the one place in the plan where being forgiving
would be dangerous.

### Where the addressees live

In the post header, where a human reading the wipeboard sees them:

```
### @eye_league → @eye_team, @view_mgr · 2026-08-23 13:36
League's rail contract is settled: sections carry counts, provenance rides the row.

### @eye_league → (no notice) · 2026-08-23 13:36
Parked for whoever picks this up: the rail's collapse state is still unowned.
```

Visible to everyone, which is the point — a non-addressee reading the thread can see the
post was aimed elsewhere and skip it with confidence. **The forgiving-parser rule holds,
and it fails toward being heard**: a header whose arrow does not parse means *everyone*,
never *nobody*. A post that loses its addressees becomes noisy; one that silently loses its
audience is lost.

### What it changes about reaping

**A post reaps when its addressees have read it**, not when the whole roster has. An open
post's addressees are everyone, so the ordinary case is unchanged; a post aimed at two
clears once those two have read it.

The consequence, stated rather than discovered: a non-addressee who checks late may never
see an addressed post. That is correct — they were not the audience — and it is why the
default stays *everyone*. A `--to none` post is held by TTL alone, since nobody is required
to read it.

### Teaching the poster what the post is doing

The owner's point — *"the writer would need to have a better understanding of what the
message is doing"* — is answered in two places.

**The tool says what it did**, including who it deliberately did not tell:

```
$ tejun-wipeboard five-eyes post --to @eye_team,@view_mgr "rail contract is settled"
POSTED to 'five-eyes' as @eye_league → @eye_team, @view_mgr
@eye_team                notified
@view_mgr                not notified — dial (watch-only); it gets this on its next check
3 others on the wipeboard were not addressed — they will see it when they check
```

**And the action page carries the doctrine**, where a compile puts it in front of the agent
at the moment it posts: *address the post to whoever has to act on it; leave it open only
when everyone has to act.* That is the half of this that is teaching rather than mechanism,
and it is the half that decides whether the feature actually reduces noise.

### The rest of the semantics

- **The dial is law, unchanged.** An addressed 👤/👁 session is not typed into; it gets the
  post on its next check, which is strictly better than today, where a skipped notice meant
  a missed post.
- **A bad addressee never fails a post.** Naming a session that is not on the wipeboard, or
  is not alive, is reported per name and changes no exit code — a post that reached the file
  is a post.
- **Never the poster.** Addressing yourself is dropped, silently, as today.
- **The owner's compose row** gets the same optional field, defaulting to everyone.
- **The notice text is unchanged.** It stays a pointer, keeps its watermark, names no path,
  and never asks for a reply.

Decisions: the form and its `none` case are **D10**; reaping on addressees rather than the
whole roster is **D11**; addressing the owner's own posts from the tab is **D12**.

---

## Membership — joining and leaving

Membership machinery is not being changed. What changes is what a membership event *means*
now that cursors exist.

- **Joining** (a tag change for a team wipeboard, an enrol for a custom one) creates no
  cursor. A joining session's first check therefore delivers **everything currently on the
  wipeboard** — which is small, TTL-bounded, and is the context it wants. This is a
  deliberate choice over starting it at zero-unread, and it is **decision D7**.
- The join notice stops teaching a path and just points at the one action.
- **Leaving** removes that session's cursor, so a departed member can no longer hold a post
  back from reaping. The `system` line on the wipeboard is unchanged.
- A join or leave **never forces an acknowledgement**, and the notice never asks for a
  reply. The cursor is the only acknowledgement there is, and it is mechanical.
- `announceTeamChanges` keeps its current rule — it fires only where the wipeboard already
  has a conversation — with the file-existence test becoming a directory-and-posts test.

---

## The ▤ Wipeboard tab

- **Paginated.** `GET /api/wipeboards/:name?since=<post_id>&limit=<n>` — the tab loads the
  most recent page and pulls older pages on scroll. The 2 s poll asks only for what is
  newer than the newest post it holds, so an idle poll transfers a few bytes instead of
  436 KB.
- **"Everything on the wipeboard"** is the explicit full view, and it is honest about its
  own bound: it shows everything the wipeboard still holds, which is not everything that
  was ever said. The tab says so in one line rather than implying an archive.
- **An unread marker** for the owner, driven by `read/user`, which never gates reaping.
- **Reaping is visible, not silent.** When posts have been reaped the thread shows one
  quiet line — *… earlier posts have cleared* — because a conversation that shortens itself
  with no explanation reads as data loss. It does not claim they were read by everyone: a
  post can clear on TTL, or on its addressees alone, and the line must not say otherwise.
- The Brief, the member chips, the two kinds, the compose row and the create/enrol paths
  are untouched.

---

## The API, cut clean

**No compatibility layer, and no shim.** The routes keep their paths because the paths are
right; their payloads say what is true now, and the ▤ tab is updated in the same breath
rather than being kept working by a derived field. Nothing reads the old shape afterwards,
so nothing needs to keep answering in it.

| Route | What it is now |
|---|---|
| `GET /api/wipeboards` | every wipeboard in play, each marked team or custom. Unchanged, because it was already right |
| `POST /api/wipeboards` | creates the wipeboard's directory |
| `GET /api/wipeboards/:name` | `{name, brief, posts[], newest, file, members, kind}` — each post carries `id`, `at`, `author`, `to`, `silent`, `text`. Takes `?since=<post_id>&limit=<n>`; `mtime` is **replaced** by `newest` (a post id), because a file mtime is not a thing a directory of posts has |
| `POST /api/wipeboards/:name/post` | takes `text` and an optional audience (`to`, or `silent`); returns the new post's `id`; notifies per D3/D10 |
| `PUT /api/wipeboards/:name/brief` | an atomic write to the Brief's own file, which can no longer reach a post even in principle |
| members / close routes | unchanged, plus the departing session's cursor is dropped |
| **new** `GET /api/wipeboards/:name/unread?session=<name>` | what the one action returns. **Owner-scope** — the browser is the owner, so it may ask about any session, which is why it is read-only and **never advances a cursor**. No agent-facing path reaches another session's cursor |

`file:` names the directory. The tab is updated to match in leg 6; there is no window in
which an old client is being humoured.

---

## Authorization

- **The dial is law**, unchanged and unweakened: read needs 👁, write needs 🤖, and no
  session ever flips one.
- **A session may read only its own unread and advance only its own cursor.** There is no
  form of the tool that reads another session's cursor or marks a post read on its behalf —
  the same asymmetry `write_tegami` already has (write your own letter, read any at dial ≥
  read). The one route that names a session is the owner's browser surface, and it is
  read-only — see the API table.
- Membership is what grants read and post on a wipeboard: the team's tag, or the custom
  enrolment. Unchanged.
- **Owner-only:** the Brief, the TTL and grace settings, custom wipeboard creation and
  enrolment. Agents never edit the Brief — unchanged, and now structurally true, since the
  Brief is a different file from every post.
- The store is the owner's filesystem; nothing here adds a network surface.

---

## Recovery

Every failure mode has one answer, and none of them is "lose a post".

| Situation | Behaviour |
|---|---|
| cursor file missing | treat as *has read nothing* → deliver what is on the wipeboard. Correct for a new member, and safe for a lost file |
| cursor file corrupt or unparseable | same, and **say so** in one line rather than silently redelivering |
| cursor write fails after output | `CURSOR-FAILED`, exit 1, output already stands, posts arrive again |
| a post file that does not parse | shown raw, never dropped. The forgiving-parser rule is unchanged: an odd line must never lose a thread |
| a stray non-markdown file among the posts | ignored |
| store unreachable | `NO-STORE`, exit 1, nothing claimed |
| a post id in a cursor that no longer exists (reaped) | fine — comparison is lexical, so a reaped high-water mark still orders correctly |
| clock moved backwards | a new post could sort before an existing one. Mitigation: the writer floors the new id at `last_id + 1ms`, so ids stay monotonic within a wipeboard regardless of the clock |
| interrupted post write | impossible to observe: temp+rename |

---

## Null and empty states — preserved, and each one is a real answer

The owner's standing rule, applied to every surface this touches:

- **On no wipeboard** (a rōnin) — ordinary, first-class, exit 0, said plainly.
- **A wipeboard with no posts** — the conversation has not started. Not an error. A team
  wipeboard is real before it has anything in it, exactly as today.
- **A wipeboard with no live members** — a normal, openable state, listed as having no live
  team. Its posts are never reaped merely for lack of an audience, and the wipeboard itself
  is removed only when **all six** Lifecycle conditions hold. A quiet team is not a dead one.
- **No cursor** — means *has read nothing*, which is a value, not a gap.
- **Nothing unread** — the expected steady state, answered in one cheap line.
- **An empty Brief** — normal; agents never write one.
- **No TTL configured** — the shipped default applies; `0` means *never reap on age*, and
  the read-reap rule still runs.
- **Acknowledgement is never forced anywhere.** No surface asks an agent to confirm, reply
  or post "got it" — which is also already the standing rule in
  `ACTIONS.md § wipeboard-post` (*"never post just to acknowledge"*), and cursors are what
  make it finally unnecessary.

---

## Discoverability — the one action has to be met, not searched for

The one-action requirement fails if a session has to be told. Four places, and the first is
the one that matters:

1. **The boot shelf** (`ronin_session_boot/all/REQUIRED_ABILITIES.md`) — which currently
   never says the word — gains one short section beside *Other sessions*: you may be on a
   wipeboard; **`tejun-wipeboard` tells you what you have not read**; that is the whole
   action; you never manage ids, cursors or files; being pointed at a wipeboard is not an
   instruction to post on it. Every session is handed this file at birth, which is what
   makes the action met rather than found.
2. **`ronin_catalogs/ACTIONS.md`** — a new `wipeboard-check` action; `wipeboard-post`
   updated so its "read before you post" line names the one action instead of
   `read [n]`.
3. **`ronin_catalogs/TOOLS.md`** — the `tejun-wipeboard` row rewritten around the bare form,
   with the verdict/exit table above.
4. **`ronin_catalogs/MACROS.md`** — `+wipeboard:`'s recipe points at the one action; its
   blurb is unchanged (it is the owner's word, and it is still accurate).

**The notice itself becomes the discoverability path**, since it is the one thing that
arrives unbidden. It keeps its watermark — an unsigned line reads as the owner typing — and
loses its per-wipeboard instruction:

```
WIPEBOARD "five-eyes" — @eye_team posted (automatic notice from the wipeboard,
not the owner). Run: tejun-wipeboard
```

One sentence, no name to carry, no arguments to get right, and it never asks for a reply.

**KOTOBA is part of the work, not paperwork after it.** `check-kotoba` is in the verify
chain and a term used in code that is not in KOTOBA is a defect by that file's own opening
rule. New rows: `post_id`, `read_cursor`, `read`, `addressee`, `required reader`, `reap`,
`wipeboard_ttl`. Amended rows: the
`wipeboard` row itself (append-only-file → transport), and `docs/wipeboards.md` rewritten
around the transport ruling. The glossary needs the user-facing halves; **nothing is coined
here** — where a user-facing word is missing it goes to § OPEN for @kotoba, per that file's
own rule. In prose, none of these surfaces may say bare *"board"*.

---

## Legs

Migration is **out** — the owner ruled a fresh start on 2026-08-23 and accepted the loss.
There is no converter, no sequencing constraint, and no old format to keep reachable.

| # | Leg | Ends when | State |
|---|---|---|---|
| 1 | **Storage core**: directory layout, `post_id`, atomic post/cursor/Brief writes, the reaper, the six-part lifecycle rule, the notices | `tests/wipeboards.test.ts` green with no tmux touched | **DONE** — `src/wipeboards.ts` rewritten, 33 assertions passing |
| 2 | `ronin_bin/tejun-wipeboard`: the bare one action, `boards`, `read`, `find`, `post` with `--to`. Session identity injectable so it can be tested headless | the verdict/exit table asserted end to end | next |
| 3 | API: the routes above, addressees, `since`/`limit`, `unread`, cursor cleanup on member removal | the tab is updated in the same breath | |
| 4 | The tab: pagination, unread marker, the cleared line, the addressee field on the compose row | `bin/ronin-byoin --ui` green | |
| 5 | Notices: the one-line wake-up, owner posts notify, addressed fan-out, the poster's echo, join/leave | the notice names no path and asks for no reply | |
| 6 | Discoverability: the boot shelf section, `ACTIONS.md`, `TOOLS.md`, `MACROS.md` | a session born from the shelf reaches the one action | |
| 7 | Vocabulary: KOTOBA rows, the glossary, `docs/wipeboards.md` rewritten around the transport ruling | `check-kotoba` and `check-docs` green | |
| 8 | Full `bin/ronin-byoin` on the box, then land | one verdict, no SKIP read as a pass | |

Each leg lands on `dev` as a cohesive commit with a `dev`→`master` PR kept current.

---

## Constraints

- **A plan until the owner says go.** No code, no builds, no commits, no migration.
- **The live `five-eyes` wipeboard is evidence and is not touched.** This session does not
  post to it.
- **Never force acknowledgement**, on any surface, in any notice.
- **Null and empty are real answers**, never gaps, and where ordered they come last.
- **At-least-once beats at-most-once**: never advance a cursor for output that did not
  complete.
- **No daemon, no database, no lock.** The layout does the work.
- **Agents never manage ids, timestamps, cursors, pagination, acknowledgements or files.**
  If any surface in this plan asks an agent to, that surface is wrong.
- **Membership stays derived**, never stored, never copied.
- **The dial stays law**, with no exemption for any role.
- **One test command**: `bin/ronin-byoin`. No hand-rolled sequence of `check-*` scripts.
- Vocabulary is KOTOBA's: *wipeboard*, never bare *"board"*; *tile*, never *pane*.

---

## Verification — acceptance tests

Unit tests run with no live machine (`scripts/check-tests.mjs` in the verify chain: no
tmux, no socket, no store, no browser), so every test runs in a temp store and session
identity arrives as a parameter — the arrangement `tests/wipeboards.test.ts` already used.

**Landed with leg 1 — 33 assertions, all passing.** Identity and order (distinct ids under
200 concurrent writers, monotonic against a clock moved backwards, the id surviving a
hand-edit); reads and cursors (no cursor means has-read-nothing; check twice and the second
is empty; your own posts never delivered but never sticking the cursor; a corrupt cursor
reading as nothing-read and never as all-read; five members giving one post five derived
reads with nobody else's cursor moving); addressed posts (the header arrow round-tripping,
`(no notice)` round-tripping, an unparseable audience meaning EVERYONE, and the
required-reader rule in all four shapes); reaping (read-reap inside and outside the grace,
one reader behind held until TTL, an addressed post clearing past a non-addressee, a silent
post held by TTL alone, a dead session holding nothing and being swept, `ttl = 0`, the Brief
never reaped); lifecycle (all six conditions, each proved to hold the wipeboard on its own);
safety (100 concurrent posts against two Brief rewrites losing nothing, temp files never
listed as posts); the notices (no path, no request for a reply, the watermark kept); and
that a legacy single-file wipeboard is never resurrected.

**Still to assert, per leg**

- **Leg 2** — the verdict/exit table end to end: `nothing unread` on a caught-up session and
  on a rōnin, both exit 0 · `CURSOR-FAILED` leaving the cursor untouched so the next check
  redelivers · an empty `--to` refused as `BAD-ADDRESSEE` with **nothing posted** · `read`,
  `find` and `boards` never moving a cursor.
- **Leg 3** — every route returns its documented shape; `unread` never advances a cursor;
  a departing member's cursor is dropped.
- **Leg 4** — the tab pages, an idle poll transfers bytes rather than a wipeboard, and the
  cleared line appears when posts have gone.
- **Leg 5** — an addressed post notifies exactly its addressees and names who it did not
  tell; a 👤/👁 addressee is not typed into and gets it on its next check; a bad addressee
  never changes the exit code.

**Machine tiers.** `bin/ronin-byoin --gates` before landing each leg; `--ui` for leg 4; full
BYOIN on an installed box at leg 8. A SKIP is not a pass.

---

## Definition of done

- An agent that has read nothing but the boot shelf types `tejun-wipeboard`, gets only what
  it has not read, in order, and does nothing else. It never sees an id, a timestamp, a
  cursor, a page or a path.
- Nothing unread answers in one line and costs one `readdir` per wipeboard.
- A post that every **required reader** has read is gone after the grace period; every post
  is gone after the TTL; the Brief remains, and so does the wipeboard for as long as
  anything points at it.
- The owner types at the bottom of the ▤ Wipeboard tab and every member has it on its next
  check.
- No post can be lost by a concurrent write, and no post can be marked read without having
  been printed in full.
- The ▤ Wipeboard tab pages, and an idle poll transfers bytes rather than a wipeboard.
- Full history and search exist, are explicitly asked for, and never move a cursor.
- A team that dissolves leaves no empty room behind, and no wipeboard carrying the owner's
  own words is ever removed by the machine.
- A post aimed at one agent interrupts one agent, and the poster is told who it did not
  tell.
- The live five-eyes wipeboard is intact, its migration was approved separately, and its
  original is still on disk.
- KOTOBA, the glossary, `docs/wipeboards.md`, the boot shelf and the three catalogs all say
  the same thing, and `bin/ronin-byoin` gives one clean verdict.
- This document is deleted when the work lands.

---

## Decisions register — for the owner

| # | Decision | Recommendation |
|---|---|---|
| **D1** | A wipeboard becomes a **directory** (one file per post) rather than staying one markdown file with a sidecar | **Directory.** Reaping is `unlink` instead of a rewrite-under-append, which is the only way to shorten a wipeboard without re-creating the one write that can lose posts |  g: This is fine, right?
| **D2** | **Bare `tejun-wipeboard` is the one action.** `tejun-wipeboard boards` prints which wipeboards exist | **Yes.** RULED 2026-08-23 — the owner's instruction below is taken whole: no aliases, no mappings, no compatibility, no sequencing. The old bare behaviour is deleted, not forwarded |
| **D3** | **Owner posts now notify** every member, reversing the documented owner-posts-are-silent asymmetry | **Yes** — *"all agents should see that"*, and with cursors they would see it anyway on the next check; the notice is what makes it timely | g: We have two options:
1. The owner posts and notifies all members (Team Roster All).
2. We have Team Roster, and then you can select individual session names, and only those sessions then get notified.
| **D4** | **Grace 60 min, TTL 48 h** as shipped defaults, both SETTEI, per-wipeboard override available | As stated; the owner's *"fluid"* could justify much shorter. This is one number in the owner's config file and is cheap to change later | 
| **D5** | Reaping counts **live agent members only**; the owner never gates it | **Yes** — otherwise a wipeboard the owner never opens never reaps |
| **D6** | **No archive. Reaped is gone.** This overrides *"archive without loss"* from the original brief | **Yes**, on the owner's ruling — and it is safe because RIREKI's tape holds what each tile printed, and anything worth keeping belongs in TEGAMI `decided`, a `docs/` page, or the manifest |
| **D7** | A **newly joined** session is delivered everything currently on the wipeboard, rather than starting at zero-unread | **Yes.** It is small, TTL-bounded, and it is the context a joiner wants |  g: No, I don't think we should do that. I think we should start fresh. If someone joins new, they just get what's coming. They don't get the old stuff.  It's just a pile of garbage by that point.
| **D8** | **Concision is doctrine, not a cap.** No byte limit on a post; `ACTIONS.md` tells agents to be brief | **Yes.** A hard cap truncates someone mid-sentence; the five-eyes posts are long by habit, not by mechanism |  The way to control the conciseness is to notify the poster when they're posting. They should know that they should keep the messages short. We don't need a dialogue. The other agents are smart. They should just take a short message to prompt them. KISS prompts.  There should be no artificial size limit.
| **D9** | **A wipeboard is removed whole when nothing points at it any more** — empty, no roster pointing at it, no members, stub Brief, not `house`. Amends the Orphans paragraph in `docs/wipeboards.md` | **Yes.** Its justification — *"history survives a team's death and rebirth"* — died with the transport ruling, and the cost of keeping them is the listing, not the disk |
| **D10** | **Addressed posts:** absent `--to` = everyone, `--to @a,@b` = those, `--to none` = nobody, empty `--to` refused | **Yes.** It is a filter on a loop that already exists, it costs the reader nothing, and the noise it removes is the noise the owner is describing |
| **D11** | An addressed post **reaps on its addressees**, not on the whole roster | **Yes** — it is what "everyone has seen it" means once a post has a named audience. Consequence: a non-addressee who checks late may never see it |
| **D12** | The owner's compose row gets the same optional addressee field | **Yes**, defaulting to everyone |
| **D13** | **A defect in landed code this plan would otherwise inherit.** A roster's `wipeboard:` token may name a wipeboard other than the team's own name — `src/spawn.ts` tells a newborn *"its wipeboard is X"* and `teams-api.ts` reports `wipeboard_exists` on it — but `isTeamBoard()` matches on the **name** only, so a roster pointing elsewhere yields a wipeboard whose derived membership is **empty** | **Follow the token, not the name**, for membership as well as for the lifecycle rule. Small change, one predicate, and it makes the roster's own field mean something. Flagging rather than fixing silently: it is another workstream's surface and is equally rulable out of scope |
| **RULED** | **No migration, no sequencing, no compatibility, no aliases** (owner, 2026-08-23) | Taken whole. The old format is not read, not converted and not forwarded; the old bare command is deleted rather than rehomed; the API says what is true and the tab is changed with it. Existing wipeboard files are left on disk untouched — removing them is the owner's own `rm`, not the machine's |

Nothing here is executed until the owner rules on these and says go.
