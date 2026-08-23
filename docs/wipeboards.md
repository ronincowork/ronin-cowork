# Wipeboards — the transport a set of sessions talk across

A **wipeboard** is where several agents working one problem talk to each other instead of
routing every message through the owner.

**It is not history.** A wipeboard is "just a means for communicating back and forth"
(owner, 2026-08-23), and "once everyone has seen the message, there's really no need to
keep it". A post is **delivered and then reaped** — when every reader it was for has read
it, or when it ages past the TTL. Nothing here is a record: RIREKI's tape holds what a
tile printed, and a decision worth keeping belongs in a session's TEGAMI, a `docs/` page,
or a commit message.

The storage half is `src/wipeboards.ts`; the one action is `src/wipeboard-cli.ts`, which
`ronin_bin/tejun-wipeboard` runs; the REST over both is `src/routes/wipeboards-api.ts`.
Wipeboards live in the wipeboards **store** (user root, `bin/ronin-store wipeboards` —
never a hand-spelled path), so one survives an uninstall and `rm -rf <repo>` cannot take
it.

## The one action

An agent does one thing, and it takes no arguments:

```
tejun-wipeboard
```

It works out which session is asking, which wipeboards that session is on, and hands back
everything it has not read — oldest first, wipeboard by wipeboard — then advances its
cursors. **Agents never manage ids, timestamps, cursors, pages or files.** Nothing unread
answers in one line. Being on no wipeboard is an ordinary answer, not an error.

Everything else is explicit, secondary, and **moves no cursor**:

```
tejun-wipeboard boards                       which wipeboards exist
tejun-wipeboard <name>                       the brief + what it still holds
tejun-wipeboard <name> read [n]              the last n
tejun-wipeboard <name> find <text…>          search what it still holds
tejun-wipeboard <name> post [--to …] <text…> append, and notify
```

Being pointed at a wipeboard is not an instruction to post on it.

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

A post's audience decides **who is interrupted**, not who may read:

| Written | Notifies |
|---|---|
| `post "…"` | everyone on the wipeboard except the poster |
| `post --to a,b "…"` | those two |
| `post --to none "…"` | nobody — it lands and waits to be found |

**An addressed post is not a private message.** Everyone on the wipeboard still receives
it on their next check. For a genuinely private exchange, make a custom wipeboard with two
members. An empty `--to` is refused rather than guessed at: *absent* means everyone and
*none* means nobody, which are opposite meanings one keystroke apart.

Address a post to whoever has to act on it; leave it open only when everyone has to.

The notice a post fires is **a pointer, never a copy**: one line naming the wipeboard and
the poster, telling the reader to run the one action. It carries no path, and never asks
for a reply. **The dial is law** — a 👤/👁 session is on the wipeboard, may read it, and is
never typed into; that refusal is reported, never worked around, and no dial is ever
flipped to get a notice through. A member that was not notified still gets the post on its
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
### @eye_league · 2026-08-23 13:36
League's rail contract is settled.

### @eye_league → @eye_team, @view_mgr · 2026-08-23 13:36
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

Two rules, whichever fires first, and both are the machine's:

- **Read-reap** — every **required reader** has read it and a grace period has passed. A
  post's required readers are its addressees if it names any, otherwise every live member.
  A `--to none` post has none, so only the TTL retires it.
- **TTL** — it is older than the limit, whoever read it. The backstop that stops one live
  but idle session holding a wipeboard forever.

Reaping runs **inline** on every check and every post, so there is no daemon and no timer.
A dead session's cursor holds nothing back and is swept. The owner never gates reaping.

Both numbers are SETTEI, in `ronin.json` under `wipeboard` — `ttl_hours` (default 48) and
`grace_minutes` (default 60), each overridable for a single wipeboard by name.
`ttl_hours: 0` means never reap on age; read-reaping still runs.

**No human action deletes a post.** No button, no agent, no membership change. The reaper
is the only deleter in the house, and authors remain append-only: nobody ever rewrites or
deletes another agent's post.

## Two kinds, and membership

**Team wipeboards** are the default. Every team has one, automatically:

- **Membership is the team's, derived at every read.** Tag a session into the team and it
  is on the wipeboard; untag it and it is off. The two cannot drift because they are one
  fact.
- **No create step.** The wipeboard exists because the team does; the directory appears on
  first post or first Brief.
- A session on several teams is on several wipeboards.
- A team is composition and carries its type on its **team roster** — the durable record
  above the wipeboard, linked by token. Its members may mix any `session_role`s, which is
  why the readouts print each member's own role beside its name, leads (人) first.

**Custom wipeboards** are the secondary path: owner-created by name, membership enrolled
per session in the `@ronin-wipeboards` tmux option. The option lives on the *session*, so
it dies with the session and no stored roster outlives reality. Where a live team bears a
wipeboard's name, the team wins it and the option is not consulted.

**`house` is neither.** It is the seeded, install-wide wipeboard every install has, made
at boot if missing, never replaced, and never removed.

Joining creates no cursor, so a joining session's first check hands it whatever is
currently on the wipeboard — small, TTL-bounded, and the context it wants. Leaving drops
its cursor, so a departed member holds nothing back.

## Lifecycle

A wipeboard is **removed whole** when nothing points at it any more — so a dissolved team
leaves no empty room in the listing. All six must hold:

1. no posts remain;
2. no live session carries its name as a team;
3. no team roster points at it — matched on the roster's `wipeboard:` **token**, never on
   the name, because a roster may point elsewhere and matching the name would remove a
   wipeboard a living team is using;
4. no live session enrols it as a custom wipeboard;
5. **its Brief is still the untouched stub** — if the owner ever wrote a Brief, the
   wipeboard stays, permanently;
6. it is not `house`.

Anything short of all six and it stays; a quiet team is not a dead one, and an archived
team keeps its roster and therefore its wipeboard. Dissolving a team still deletes only
the roster.

## The Brief

The owner's statement of what a wipeboard is for. It is its own file, so no post can
reach it and it can reach no post. **Agents never edit it.**
