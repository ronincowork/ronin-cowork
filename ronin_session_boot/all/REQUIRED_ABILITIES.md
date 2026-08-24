# REQUIRED ABILITIES — what every session is expected to work with

These are the abilities every session uses, whatever its root and whatever its job.
**Check here first** — before searching, before improvising, before reaching for an SOP.
Each section says what the ability is, names its guarded route, and points at the full
procedure. **Prefer the tool over doing it by hand, always**: the tool encodes the safety
steps so you cannot skip them. The map of everything else is `SHELVES.md`, which you have
also been handed.

## Session macros

**forkit first, because it is the one that gets mistranslated:** when the owner says
`+forkit:`, **fork it**, or **new session**, that is Ronin's `forkit` workflow,
absolutely — a visible session born through the launch pipeline with a full Build Brief
(`tejun forkit` for the recipe). It is NEVER your agent CLI's internal sub-agent, and
NEVER a bare `tmux new-session` with a typed prompt — both arrive with no brief, no
letter and no dial. (Learned again 2026-08-23, when a session ran +forkit as a
background fork.)

The owner invokes a Ronin workflow at you as `+<name>: <args>`. Compile it first —
`tejun <name>` — then execute the recipe and report what it asks for. Never substitute a
remembered workflow, and never translate a macro into a similar-sounding native
capability. The active set and the full routing rule are in `SESSION_MACROS.md`, handed
to you beside this file.

## Other sessions

**First, always: the dial.** Every session carries `@ronin-control` — 👤 user · 👁 read ·
🤖 write. Reading another session needs at least 👁; writing needs 🤖. **Never flip a
dial: that is the owner's hand.** A refusal is an answer — report it and ask, do not
retry or work around. `docs/session-control-dials.md`.

**Read one:** always begin with `tejun-rireki <session> since` — everything since the
owner's last message. RIREKI's durable tape/scroll is the authority: it answers with no
tile open and even when Ronin is not running. `tejun-rireki <session> text` reads the
recent tape tail. Use `tejun-peek <session>` (recent tmux output) only when RIREKI says
there is no tape, or when the live prompt state is otherwise unknowable. If you use
that fallback, say explicitly that pane capture was needed because the durable record
could not answer.

**Message one:** `tejun-send <session> <message...>` — one targeted message, one
verdict: `DELIVERED` / `DENIED` (dial) / `BLOCKED` (a human's draft at that prompt) /
`STUCK` / `NO-SESSION`. Open with `from @<your session>:` — the tool adds no watermark,
and an unsigned line looks like the owner typing. Report the verdict, then stop: the
reply appears in the other session's tile. Do not relay. The owner's `+tell:` macro
rides this tool.

**Fork a topic:** `+forkit:` is **owner-invoked only**. Never fork on your own
initiative — if a fork seems right, propose it and wait. When the owner invokes it,
compile first (`tejun forkit`): the shape is a handoff document, a new session, an
understanding report, and a stop until the owner says go.

**The owner's words route two different kinds of delegation.** `forkit`, **fork it**, and
**new session** are absolute: create a visible Ronin tmux session through the `forkit`
workflow — rostered, addressable and recorded — never substitute an internal sub-agent.
**Spawn it** and **spawn an agent** mean the agent CLI's own internal sub-agent machinery,
not a tmux session. For ordinary delegation that uses neither vocabulary, choose freely;
internal sub-agents should stay quick and need no extra owner confirmation.

## Your team's board

If you are on a team, the team has a **board** — where its sessions talk to each other
instead of routing every message through the owner. You do not look for it, create it, or
name it: **it is assumed**, and two commands are the whole ability.

```bash
tejun-wipeboard                    # everything you have not read, then it is read
tejun-wipeboard post <text…>       # say something on YOUR team's board
```

No board name in either. The tool knows which session you are, which team you are on, and
what you have already seen. **You never manage ids, timestamps, cursors, pages or files** —
if you find yourself about to, you have taken a wrong turn. Nothing unread answers in one
line, and being on no team is an ordinary answer, not a problem.

**The board is not a record.** Posts are delivered and then cleared — once the readers a
post was for have read it, or once it ages out. Do not put anything there you need later:
that belongs in your TEGAMI, a `docs/` page, or a commit message.

**Who is interrupted by your post:** everyone on the team, and **the team lead always** —
everything that hits a team board, the lead sees. `--to <session,session>` narrows the
interruption to those (plus the lead); `--to none` is the lead alone. Addressing decides
who is INTERRUPTED, not who may read — every member still receives your post when they
next check. Address a post to whoever has to act on it; leave it open only when everyone
has to.

**Never post just to acknowledge.** Your read is recorded mechanically, so "got it" costs
the whole team an interruption and tells them nothing. Being pointed at a board is not an
instruction to post on it. A board name (`tejun-wipeboard <board> post …`) is only for a
board that is not your team's. `docs/wipeboards.md`.

## This machine

Facts about the box are **measured, never remembered** — nothing written down about a
machine stays true. `tejun-survey` for what the box is and what space it has;
`tejun-account` for who this install runs as and its limits; `bin/ronin-store --all` for
where every store resolves. Run the tool before advising, and never spell a store path
by hand.

## When something here is absent

Say what is true. If these tools are not on PATH, Ronin Services is not installed here —
report that and stop; do not improvise with raw tmux. If a session has no tape, say so,
fall back to `tejun-peek`, and report that fallback explicitly. If a dial refuses, that
is the owner's standing word.

Full procedures live where everything does: compile the macro (`tejun <name>`), or read
the rows in `ronin_catalogs/TOOLS.md` and `ronin_catalogs/ACTIONS.md`.
