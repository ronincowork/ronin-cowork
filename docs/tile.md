# The tile — one cell of the coworkspace, top to bottom

A **tile** is one cell of the coworkspace showing one session. The public word is *tile*;
*pane* is the tmux terminal underneath and is machinery only (KOTOBA § THE GROUND).

A tile is three things and nothing more: **a header**, **a mount point**, and **one of two
views** composed into it. `class Tile` (`public/js/tile.js`) owns what any of it means; the
header is built in one place (`public/js/tilehead.js`) and every callback in it lands back
on the tile.

Construction order is load-bearing: `this.body` must exist before anything mounts into it.
One line breaking that rule took the whole UI down on 2026-08-08. Views mount in DOM order:
tape, then the commons panel, then xterm.

---

## What ships where

**All frontend lives in `RONIN_COWORK`.** A `ronin_service` ships no HTML, JS or CSS — it
fills a subset of *cowork's own* UI (KOTOBA § SURFACES). So every button below is a cowork
button. The question is only whether the thing behind it is plugged in.

The client asks once, at boot, before the grid is built: `GET /api/version`
(`src/routes/version.ts:41`) answers `stream` (is rireki's 🔓 handler registered?) and
`services` (who registered, by name: `michi` · `koshi` · `rireki` · `counting` · `koe`).
`main.js:16-25` parks those on `S.streamOff` and `S.services`.

The house rule for an absent service: **draw the surface opaque-and-inert, never fetch into
a 404.** "Not plugged in", not "broken", not missing.

This table is about **services** only — which control goes dark because something is not
installed. The other half of "is this reachable", whether a control needs a *session*, is
the `needs` column of the header table itself (`public/js/tilehead.js`); both end up in the
same `needs` string, and both dim the control the same way.

| Control | Needs (service) | When it is not there |
|---|---|---|
| ● connection dot | — | always |
| session picker | — | always |
| the mark (job) | — | always — see the note below |
| SHINGO chip + ladder | `michi` | chip hidden, ladder unreachable, never fetched |
| ⛽ context gauge | — | always (hides when there is no reading) |
| 🎛 control dial | — | always |
| ⛩ commons | — | always (individual tabs gate: `koe` · `counting` · `koshi`) |
| ⚡ macros | — | always |
| メ the drop | — | always — it is a container, and it holds 🔒, which needs no session |
| Output | rireki's stream handler | contains Locked only |
| 🏷 groups | — | always |
| 📄 docs | `michi` | inert and opaque, saying so; the doc list is TEGAMI data |
| 📝 note | — | always |
| 🗑 kill | — | always |

**The mark is cowork's, even though it lives in the TEGAMI.** The letter has two halves with
different owners in one file (`src/tegami.ts`): cowork seeds the file at birth with
`session_role` filled and the derived `teams` block rendered, and reads the mark back
for the roster; **michi** owns the
ladder, `at`, `ladder_state`, `docs`, the SHINGO chip, `quietMs`, the `/tegami` routes and
the sweep. A role is set at birth and a ladder is not. So the `?` button works on a free
install; the chip beside it does not.

---

## The six Outputs

The tile composes one or the other. Neither knows the other exists.

**🔒 Locked — `public/js/termview.js`.** The untouched `tmux attach` mirror. xterm.js, an
emulator, because the stream is a live screen full of positioning. Scrollback stays
server-side, so scrolling round-trips through tmux copy-mode. This works and RIREKI does not
touch it.

**🔓 Unlocked — `public/js/tapeview.js`.** RIREKI's client-side render. **It holds no tmux
connection** — no attach, no viewer session, no pipe; tmux does not know this view exists.
Display comes from the tape; input goes back out through the tile's socket. It is a plain
scrollable div, not a terminal, because a tape-fed stream is 100% plain text and a div gets
hardware-accelerated momentum scrolling for free.

The socket sits beside both and is owned by neither (`public/js/tilewire.js`).

**Output is a property of a tile.** Locked attaches the live terminal. Terminal Mirror, Detailed,
Condensed, Conversation and Agent Summary are record-fed views registered by Ronin Services.
Bare cowork offers Locked only. `S.locked` remains a compatibility alias for transport choice.
The old lock button and its global flip are retired. The Output selector changes only its
tile and is compact on touch; Locked remains available there, with tmux copy-mode's normal
round-trip scrolling tradeoff.

The six choices are contracts, not degrees on an unnamed “detail” slider:

| Output | What the tile shows | Produced by |
|---|---|---|
| **Locked** | The attached live tmux terminal, including its active screen and interaction | tmux/xterm |
| **Terminal Mirror** | Every settled RIREKI record, including recognized terminal chrome | mechanical projection |
| **Detailed** | Terminal Mirror without positively identified spinner and input-box chrome | mechanical projection |
| **Condensed** | Dialogue and ordinary text, with adjacent thinking/tool/result/code records represented as compact activity groups | mechanical projection |
| **Conversation** | Positively identified owner and agent dialogue; non-dialogue work is represented as activity rather than silently presented as speech | mechanical projection using the session's decoder |
| **Agent Summary** | Persistent, authored accounts of closed transcript ranges | one-shot `koshi_kaki` calls |

Unknown content is retained by Detailed and Condensed. Conversation is deliberately stricter:
only content mechanically identified as dialogue is rendered as dialogue, while recognized work
becomes an activity row. This keeps provider-specific recognition inside RIREKI's decoder rather
than scattering Claude/Codex guesses through the browser.

Agent Summary has two session policies. **On demand** writes when the owner asks for a summary.
**Keep current** watches for a quiet, settled boundary and then makes another one-shot Kaki call;
it runs whether or not anybody is viewing the tile. The stored chunks therefore remain ready for
a later reader. This cut does not include KOE or voice playback.

The five record-fed Outputs are also service reads, not browser-only presentations. RIREKI exposes
the four mechanical projections through `GET /api/sessions/:name/render?view=...`; Koshi exposes
the fifth through `GET` and `POST /api/sessions/:name/kaki`. A future tool-using reader such as KOE
can call those authenticated routes without recreating the browser's filtering rules.

---

## The header, left to right

Built order (`public/js/tilehead.js`):

```
● │ [ session ▾ ] │ chip │ mark │ ←spacer→ │ ⛩ ⚡ メ
                                                  └─ 🔒 🏷 ⛽ 🎛 📄 📝 🗑
```

**Three on top, the rest behind メ** (owner's ruling 2026-08-17; six then, seven since 📄
landed on 2026-08-18). The row used to end in
eight controls against a picker that has to fit a session name, and at four tiles up
there was not room for both — measured at a 629px tile, the eight left the spacer 23px
short before the picker started giving up characters. So ⛩ Commons and ⚡ Macros stay,
and the rest drop out of メ **as themselves**: the same elements, appended into a
horizontal strip instead of into the row, keeping every handler, every live setter and
every `needs` rule they were built with. Nothing was redesigned into a menu row — the
dial is still the dial and the gauge is still the gauge.

**One table, and a loop.** Every control above is one row of `HEADER` in
`public/js/tilehead.js`, and everything about it is on that row: where it sits, its class,
its glyph, its hover text, its click, what it needs to be live, what it says while it is
not, and — for the three whose help is a reading rather than a sentence — how to read it.
The order of the rows is the order on screen. `buildTileHead` loops the table to build;
`syncTileHead` loops the same table to bring it up to date. Adding a control is adding a
row, and it cannot be half-wired because there is no second place to forget.

That structure is not decoration. A control used to be spread over up to five places —
markup in an HTML string, hover text beside it, click in the tile constructor, inert rule
in a fourth spot, live reading in a fifth — and the set drifted: **three controls had no
inert rule at all**, because nobody had written them a line.

**`needs` is the whole rule for whether a control is reachable.** `session` for the ones
that act on a session; a service name for the ones whose route ships with a service. A row
with no `needs` is claiming to work always — a claim, not an oversight.

Every control says what it is on hover — **including while it is greyed out, which is when
you are most likely to be asking.** That is why the inert ones dim with a class rather than
with `disabled`: a disabled element fires no hover events, so its help never appears
(`setInert`, `public/js/widgets.js`). The refusal therefore lives in the handler, never in
the stylesheet. The help itself is drawn by the house help box, not by the browser —
`public/js/tips.js`, one panel, fixed size, docked to the control's own side of the header.

### ● The connection dot

Green attached, amber connecting, grey disconnected. Set from the socket's status
(`Tile.setDot`). Not a button.

### [ session ▾ ] The session picker

Pick or switch the session this tile shows. `— pick session —` (blank) **detaches** — stops
viewing, does not kill. `➕ new session…` prompts for a name and creates one. A session
that has left the list but is still connected stays visible as `name (gone?)`. A `•` beside
a name means attached elsewhere.

No mark is drawn in the picker: the collapsed `<select>` sat an inch from the job button
showing the same icon, which is the same fact twice.

### The SHINGO chip 信号

Position, then how long it has sat there. **Hidden until a ladder exists** — a session that
keeps no TEGAMI costs nothing on screen. Tapping it is *always* the ladder; there is no gate
view and no detail view.

This is an **outline indicator, not a channel**. It says moving / held / stopped somewhere it
shouldn't be. Nothing on this side can touch a session; a gate is answered by typing into the
pane like everything else. The age is the file's mtime — the cheapest true thing on the
tile, and beside a gate it reads as how long the session has been waiting on *you*.

**The ladder** unrolls under the header (`public/js/shingo.js:85`). Four fixed columns —
torii · done-or-not · leg # · description — so the eye can run straight down any of them.
Exactly one rung is live: you are at the gate or you are doing leg four, never both. It opens
scrolled to the rung you are standing on. `[GATE]` rows are a rung **kind**, never a status;
statuses are `PLANNED` · `ACTIVE` · `DONE`.

Needs `michi`. `refreshTegami` asks `serviceMissing('michi')` and simply does not fetch when
michi is absent — the one way that question is asked anywhere in the client.

### The mark — what this session is doing

The task button. Reads `session_role` off the session list, which carries it for every session.
Click it to change it: a popover of the `ronin_catalogs/session_roles/` definitions, plus *not marked*, which
is a real state and stays reachable.

**`?` when nobody has said, not blank.** It was blank first, on the argument that a made-up
mark is worse than an empty square. That was wrong in the only way that counts: an empty
button is invisible among six others, so nobody learns there is a question to answer.

It writes the same field the agent maintains with `write_tegami`, surgically: the
`session_role` value inside the fenced block changes and the ladder, `docs`, `at`, `objective`
and every key this version has never heard of survive byte for byte. The owner is simply the
other writer, for when an agent never re-marked itself or was redirected mid-flight.

**It is no longer only a re-label.** The dial and permissions are still untouched and no
brief is re-sent — but a committed change hands the session that task's own reading
(`task/<session_role>/`), through the same observer the agent's own `write_tegami` change
goes through, so there is one implementation and not a second one in the route. When the
mark moved and its reading did not land, GET carries a `delivery` fault: a changed mark
with undelivered reading is a split state and must not pass silently.

`POST /api/sessions/:name/session_role` → 409 if the letter has no readable json block.
A body naming a retired axis key is refused 400, and the retired per-session axis
routes (`session_job` · `family_role` · `session_task` · `role_family`) answer 410
naming what replaced them (R35).

### ⛩ The torii — the Commons

⌃⇧C (⌃⌥C on Linux/Windows). One press, straight to the CoWorking Commons over this tile,
landing on ⌂ Roster — roster, new session, wipeboard, project roots, hotwords. It needs no
session, because it is the way to GET one. **A way in, not a close:** the session keeps
streaming behind the panel and ✕ on the tab strip comes back to it. Stopping viewing is the
blank option in the picker; killing is 🗑.

**The torii means this, and only this, everywhere** (owner's ruling 2026-08-17). It was メ
here and き in the bar for the same act, while ⛩ on this same header meant something else
entirely — the letter. One glyph for two things and two glyphs for one thing. Both moved in
the same pass, so the mark never had a period of meaning both.

**The letter button is gone.** It opened `/api/sessions/:name/tegami/raw` — the TEGAMI
verbatim, in a scrollable selectable block — and it was the only client reader of that
route. What went with it is worth naming, because it was deliberate: the chip and the
ladder are an INTERPRETATION, and the letter was the source, which is the question you ask
when the readout looks wrong. The cost is real and the owner weighed it: `js/shingo.js`
hides the chip when a session has no ladder, so a session with a letter and no ladder up now
has no route to its own letter at all. The header width won.

The route is MICHI's and still serves — a client ceasing to be a consumer is not a reason to
take an endpoint away. If the raw view returns, it belongs inside the ladder panel, where
the reader already is, not as a second glyph competing with the first.

### ⚡ Macros

The fast path for `session_macros`. **It prefills and stops** — `+forkit: ` lands in the input
you are typing in, mid sentence, and you add your own words. It never runs anything. The
text it inserts is text you could have typed, so after a few uses you type it yourself,
including from a pane or a phone where no menu exists. A menu that executed would hide the
syntax forever.

Where the text lands, in precedence order: the composer's textarea (touch) → the parked
buffer (unlocked, shown in the strip) → `sendRaw` with no Enter (locked).

A macro marked `send:` is the exception — it fires and presses Enter for you, marked with a
`⏎` after its headline. Those carry a **120-second per-tile cooldown**, and a spent card
says `sent — wait Ns before sending it again` in place of its description rather than
silently swallowing an impatient second tap.

**FOUR CARDS, AND THE DROP IS A TEACHING SURFACE (owner's ruling, 2026-08-17).** It was
every macro in the catalog, one `+name:` row each, the explanation on hover. The owner:
*"I would rather have four macros and have larger buttons… These should be headlines, and
the boxes are big enough that you can actually describe in them what that means, so people
can then go, 'Oh, I see.'"* Three consequences, and none of them is cosmetic:

- **Four, not thirteen.** A macro is on the drop only if its catalog entry says
  `- **preview:** yes` (`ronin_catalogs/MACROS.md`, parsed in `src/macros.ts`). Opt-in,
  because a dozen entries and a surface that holds four means opt-out would put every macro
  written later on the button until somebody noticed. *"If we have too many, people just
  don't get educated."* **Display only: every macro still runs**, typed or from the keypad,
  and nothing is deleted.
- **No `+name:` on the face.** The headline is the entry's `label:`, in plain words. The
  invocation moved into the help box — still learnable, no longer the first thing read.
- **The body copy is always visible**, from the entry's `blurb:`, never clamped and never
  on hover. Confirmed directly by the owner, who also has a phone, where hover does not
  exist. This is body copy inside the button and deliberately **not** `tips.js`, which is
  the terse hover primitive and is width-gated by `check-tips`.

**TWO AUDIENCES, AND NO FALLBACK BETWEEN THEM (owner's ruling, 2026-08-17).** *"We need to
split out the description and the agent instruction into two different things because they
don't overlap, and the macro should carry both."* A catalog entry is written twice:

- the prose under the `## name` heading is the **agent's instruction** — served as
  `instruction` on `/api/macros` (renamed from `description` the same day, because that name
  is what invited a human surface to render it);
- `label:` and `blurb:` are the **person's copy**, and the card renders those and only those.

The card used to fall back to the instruction when an entry carried no blurb. That is gone:
it would have greeted a person who tapped ⚡ to find out what `forkit` does with *"Owner-invoked
only — never fork on your own initiative"* — a prohibition addressed to somebody else. Both
halves are now required on **every** macro, previewed or not (`check-catalogs` fails a stock
entry missing either), because the next surface is a library people browse to adopt macros
from and copy written for four would have to be written again for thirteen.

A macro of the **owner's own** can still reach the drop without a blurb — a user catalog file
is theirs and no gate reaches it. That card is its label plus one quiet line saying the blurb
is missing and where to add it. Never the instruction, and never a blank, which reads as broken.

The card is the same shape as the launcher's kind buttons (`.ks-btn`) because it is the same
job: picking a thing you may never have heard of by reading what it does.

The reference — every macro, the ones not previewed included, with the full instruction —
is `ronin_catalogs/MACROS.md`.

Inert without a session: there is nothing to prefill.

### メ The drop — the rest of the header

One click, and 🔒 🏷 ⛽ 🎛 📄 📝 🗑 appear in a horizontal strip under the header. The owner's
words: *"consolidate the Lock, the Tags, the Gauge, the Dial, the Save status, and the
Trash Can into a single button… When you click it, you just see those boxes exactly as they
are, but maybe it just drops down horizontally."* Which is what it does — the controls are
**the same nodes, appended somewhere else**, not a redrawing of them as menu rows.

**メ is a reclaimed glyph, and this shape is not new.** It was the tile-head Commons button
until 2026-08-17, when ⛩ took the Commons everywhere and freed it. On touch it has meant
exactly this all along: `tiledrop.js` collapses the whole header into one bar row where メ
is *this session*. Desktop is being brought into line with a design the phone already wore.
The only difference is the shape — a pointer needs no word beside the icon, and a desktop
header has room for a strip rather than a list.

**It needs nothing**, which is a claim about the control: it is a container, and it holds
🔒, which works with no session at all. Dimming it would have hidden the six explanations of
why its contents are dim. A control that is inert in the row is inert in the drop, with the
same sentence — `setInert` paints the element, and the element is the one that moved.

**Dismissal follows ⚡, not the retired `ui.popover`** (`public/js/tilemore.js` says why at
length). The short version: ⚡ sits immediately to メ's left, anchors to the same corner of
the same header, and closes its rivals with a `.open` **class** sweep, which is the phone's
grammar too. A `hidden`-attribute drop would be one no existing sweep could see and the two
would open on top of each other. What it does take from the retired primitive is the half
that was about access — `aria-haspopup` / `aria-expanded` on メ, and focus back on メ when
the drop closes under the keyboard.

Escape closes it, in the **capture** phase and only while it is open — so it beats a locked
pane to the keystroke when the drop is up, and never takes Escape away from that pane when
it is not — and **not while a modal sheet is up over it**, since that Escape belongs to the
topmost surface and this listener would otherwise reach it first. Clicking outside closes
it; clicking a control inside closes it *if that control raises something the strip could
cover*. The instruments (⛽ and 🎛, the `holds` rows whose value changes in place) leave it
up, exactly as the phone gives the dial its `stay` mode.

**And so do 🏷 and 📝** — the `modal` rows, since 2026-08-18. Their sheet sits over a
full-viewport scrim at a z-index far above the strip, so there was never anything for the
strip to cover; closing it only hid their own opener, and a `display: none` button cannot
take focus back when the sheet closes. Focus fell to `<body>` and the next Tab restarted
the page. Leaving the drop up means the owner comes back to the exact control they left
from, and 📄 is the counter-example that keeps this a per-row column rather than a rule:
its docs pane is an in-tile surface the strip really would sit on top of, so 📄 still closes
it. The primitive was hardened in the same pass (docs/ui.md) — this stops *causing* the
failure, `ui.sheet` stops *hiding* it.

A **click on the scrim** closes the drop as well, and that is the intended asymmetry
rather than a leak: the scrim's click still reaches `document`, where it is an outside
click for everything under it. The keyboard peels one layer per Escape (sheet, then drop);
a pointer pressed on the scrim dismisses the stack it was pressed through. Measured
2026-08-18 — Escape from 📝's sheet lands on 📝 with the drop still up, a backdrop click
lands on メ with the drop closed, and neither lands on `<body>`.

**Desktop only.** `collapseTileHead` hoists this header into the phone's app bar behind its
*own* メ, snapshotting the header's children to restore later; a control nested one level
deeper is not in that snapshot, and the restore would leave it inside a sheet that is then
removed. So the drop is built on a fine pointer and skipped on a coarse one — the same
`isCoarse()` test the collapse gates on, which makes the two exactly complementary. A phone
at two or four tiles gets its own headers back, every control in the row, as before.

### 🔒 / 🔓 The lock

Behind メ.

**Not "streaming" and not "disconnected".** The session is running in tmux either way. What
differs is whether *this view* is attached, and the consequence is lag.

- **🔒 Locked** — attached to the live tmux session, painting in lockstep. Scrolling goes
  back to the server and back. **This is a drawn screen, not selectable text.**
- **🔓 Unlocked** — reading what the terminal painted, captured byte by byte as it went, so
  the text can lag the live pane. Scrolling is instant and stays in your browser, typing
  still goes to the real terminal, and **the text selects and copies like any web page**.

Flipping reconnects **only this tile**. Parked text is discarded on a flip — it is visible in
the strip, so nothing vanishes silently.

With no record service the button is dim and inert on every device, and the refusal is
stated in `setLocked` rather than in the stylesheet: `.lock.off` used to carry
`pointer-events: none`, which blocked the hover that delivers the tooltip, so the one control
that most needed to explain itself said nothing.

### 🏷 Groups

Behind メ.

The session's memberships, stored on the tmux session itself (`@ronin-tags`). The point is
**addressing, not decoration** — "the kojinsa group" resolves to a session list, so a
coordinator can be pointed at a set instead of at named members one by one. Agents resolve
the same names with `ronin_bin/tejun-team`. The button lights when the session is in any.

### ⛽ The context gauge

Behind メ — and that is the one place where hiding a control costs something real, because
a reading you have to open is a reading you stop watching. The owner was asked about exactly
that and ruled it anyway: *"the context viewer is also visible at the bottom of all of the
Claude sessions anyway, so we're showing it twice."* The pane already prints the number; the
gauge was the second copy, and the second copy is what pays for the header's width.

How full the session's context window is. A tachometer tuned to the **useful** range: 0% at
6:00, 15% at 9:00, 50% at 12:00, pegged by ~80% — sessions never reach 100%, and the
difference between 6/17/35% is what you actually watch. The arc shows each zone's colour only
as it is reached.

Scraped from **ordinary pane text** (`src/ctx.ts`) — the same status line the CLI already
prints, never from agent internals. A plain shell has no status line, reports null, and the
gauge hides rather than showing a placeholder. Tap (touch) or hover (desktop) for the number
and the model.

A readout, not a control. Dials are inputs; gauges are readouts.

### 🎛 The control dial

Behind メ, and it is one of the two rows that do NOT close the drop when clicked: you turn
it by tapping the thing you are already looking at, three detents in a ring.

`@ronin-control` — who, other than the owner, may touch this session. Three detents, tap to
advance:

- **👤 owner only** — outside agents get nothing, no writes and no reads.
- **👁 watch** — outside agents may observe, never type.
- **🤖 type** — full access, and the default for an unflagged session.

"Outside agents" means agents reaching *into* the session — never the agent already running
inside it, and never the owner's own typing. tmux is the single source of truth: the dial
POSTs and then **re-reads** rather than assuming the write took.

**Yours to turn; agents never flip it.** The flip happening in the owner's UI *is* the
authorization. Full story: `docs/session-control-dials.md`.

On both surfaces — an explicit override of the never-change-desktop rule, because the
cockpit motif is meant to be the same everywhere.

### 📄 Docs

Behind メ, beside 📝 — the two things a session keeps in writing: the post-it it wrote for
you, and the documents it is working in.

One press lists **this session's** docs; one more opens the file, in place, over this tile.
The owner's words (2026-08-18): *"If I wanted to look at a tile and say 'oh, I want to watch
this tile's docs', it's not actually easy or intuitive to find them by going to the Commons,
going to Docs, and then looking for their particular agent's tracked docs."* The ▧ Docs tab
lists **every** session's docs grouped by session, so reaching one tile's meant leaving the
tile, remembering the session's name, and finding its group among all the others — three
steps and a memory test for a fact the tile already knows about itself.

**It fetches nothing.** `refreshTegami` already parks the whole letter on the tile and
`docs` is part of that payload (`src/services/michi/tegami.ts`), refreshed on connect, after
a write, and by the 30s poll. So there is no loading state and no failure state here to
design: the read that already exists refuses to fetch without michi rather than 404ing,
discards a response if the tile switched session mid-flight, and keeps its last value on a
failed read. The Team commons Docs surface renders what that left behind.

**Opening one clobbers the terminal**, which is the owner's own reasoning: *"it would just
open in place on that session, clobbering the session I'm looking at, which is fine because
you can just close the commons and you're back in the session."* The Commons already renders
*into* a tile, so this is the existing architecture and not a new panel — the same editor the
▧ Docs tab uses (`public/js/docs.js`, whose `open` is exported for exactly this), the session
still streaming behind it, ✕ on the tab strip to come back.

**It is not the file browser, and it is not a crack in that rule.** A doc is on this list for
the one reason it is on the ▧ Docs tab: an agent ran `write_tegami --doc <path>`. All that is
different is the scope. Which is also why a session that has listed nothing gets a sentence
saying so — the same sentence the tab uses for its own empty list, narrowed to one session —
and never a fallback to the global list, which would rebuild the hunt inside the tile.

The button lights when there is something behind it, the same reading 🏷 and 📝 carry, so the
drop does not have to be opened to learn it is empty. **Needs a session and `michi`**: the
list is TEGAMI data, exactly as the SHINGO chip is, and without either the button dims and
says which is missing.

Height is measured at open time against the room under the header (`fitDropToTile`,
`public/js/tilemore.js`) — `.tile` is `overflow: hidden`, so a list longer than the tile is
cut with no scrollbar. That measurement was ⚡'s, spelled once and now shared by both drops.

### 📝 Note

Behind メ.

A post-it on the session. Lives on the tmux session itself as a user option — no separate
storage, gone when the session dies. The button lights when there is one.

### 🗑 Kill

Behind メ — which is also a second's worth of friction in front of the one control on this
header that cannot be undone. That is a side effect of the width ruling, not its reason.

Destroys the tmux session on the host, root plus its `grid_*` viewers. Confirms first, then
the tile detaches and returns to the commons. Inert without a session — there is nothing to
kill, and it used to stay lit and say nothing about why pressing it did nothing.

---

## Typing, and copy-paste

### Typing out

**Locked** is key-for-key to the host: every keystroke round-trips to the tmux terminal
exactly as `tmux attach` always did.

**Unlocked** is the DVR rule (`public/js/dvr.js`, pure and tested). Printable text — typed or
pasted — **parks locally** and shows in a thin strip over the tile. Command keys (^C, Esc,
arrows, Tab, any control char) go straight through immediately. Enter sends the whole parcel
as **one atomic write with the `\r` glued on**; a delayed `\r` on a timer is a message iOS can
lose halfway. Backspace eats parked text first, and is a command key once the strip is empty.

**The composer** is the unlocked tile's own textarea, docked at the bottom (`composer.js`).
A tape-fed tile hides xterm entirely, so without it there was nothing on the page to type
into — not a missing nicety, the missing input path. Enter sends; Shift+Enter **and
Option+Enter** insert a newline (Option+Enter is the muscle memory the agent's own box takes,
and it used to send). A bare Enter with an empty box is a command key, and it is the recovery
path when a TUI swallowed a previous send's Enter. A send into a closed socket keeps your
text and flashes rather than vanishing.

### Copying out

**Unlocked — just select it.** The transcript is a plain div. Native selection, native ⌘C,
native find-in-page. This is the answer to "how do I copy from a tile", and it is why the
lock tooltip says so in capitals.

**Locked — hold the modifier, drag, then ⌘C / Ctrl-C.** And **the modifier is not the same
key everywhere**:

| Platform | Key |
|---|---|
| macOS | **⌥ Option** |
| Windows · Linux · everything else | **⇧ Shift** |

That is xterm's own rule, not ours (`SelectionService.shouldForceSelection`, 5.5.0):
`isMac ? altKey && macOptionClickForcesSelection : shiftKey`. Ronin mirrors it in one place —
`IS_MAC` / `SELECT_MOD` / `forcesSelection` in `public/js/state.js` — deliberately copied
rather than improved, because a test that disagrees with xterm names the wrong key.

**Why a plain drag looks like it worked and did not.** Every viewer session is created with
tmux `mouse on` (`src/tmux.ts:511`). Without the modifier, the drag is forwarded as mouse
escapes: tmux enters copy-mode, highlights under your cursor, and copies to the **paste
buffer on the host**. The browser never saw a selection and your clipboard is untouched. You
watched text highlight, so you press ⌘C and get whatever was there before.

**The hint.** A real drag (>8px) in a locked tile that leaves `getSelection()` empty raises a
one-line prompt naming the key — `wireCopyHint`, `public/js/termview.js`. Once per tile,
re-arming after ten minutes. The test is *"they tried and got nothing"* rather than *"is
mouse reporting on"*: it is the honest condition, and it catches causes we have not met yet.

**The ⌘C itself.** xterm draws to a canvas, so the browser's native copy cannot see the
selection; a `copy` listener (`public/js/layout.js`) feeds it the captured terminal text. The
selection is **stashed the moment it is made** (`S.lastSelection`), because a streaming TUI
repaint can clear the visible highlight before ⌘C fires. The hijack only engages when there
is a selection, so an ordinary page copy still works.

**HTTPS is not required for any of this**, and never was. The copy path is the `copy` event
plus `clipboardData.setData()`, which is not secure-context gated. What does need a secure
context: the 🎤 (`getUserMedia`), and `navigator.clipboard.writeText` in the keypad panel —
which falls back to `execCommand` anyway. `setup.sh` used to say "HTTPS needed for clipboard";
it was wrong, and it sent people looking for a certificate when the answer was a modifier key.

The old Copy Mode toggle is retired. One way to copy, any pane, locked or unlocked.

### Pasting in

Locked pastes straight through. Unlocked parks the pasted text in the strip like anything
else printable, and sends it on Enter. The composer takes a native paste.

---

## The phone and the touch keys

**A phone never builds the workbench at all.** At an iPhone-class viewport (small AND
coarse — `IS_PHONE` in `state.js`) `main.js` mounts the phone shell instead
(`public/js/phone.js`, the MOBILE plan, owner 2026-09-01): pick the Cowork, pick the
Agent, drive its tile. On the stage the tile's own head is hidden and the shell's slim
bar replaces it — ‹ back, the Agent's title, and one メ sheet holding the head's own
controls (Status, Work record, Output, Note, Control, Kill), **relocated, not cloned**,
so every handler and live widget keeps its owner. The Status row is a reading, not a
door.

**The keys ride the composer on every coarse tile** — phone shell and iPad workbench
alike (`public/js/keysrow.js`): Esc, ^C, ⌫, ^U, Tab, ⇧Tab, the arrows and ⤓, docked
directly above the box they drive, lifting over the software keyboard with it. They act
on that tile's own session, never "the active tile". The two clearing keys are there
because the agents disagree about their own in-pane box — Esc empties Claude's, ^U
(readline kill-line) empties a readline-shaped composer such as Codex's — and they are
generic terminal keys on purpose: providers ship remappable keymaps, so a hardcoded
per-provider key would be a guess with an expiry date. **Ronin's own box clears
uniformly**: Esc from a hardware keyboard empties the composer (an already-empty box
passes Esc through as a command key, the bare-Enter rule), and a ✕ appears on the box
whenever it holds text. On a box with no tape service the composer
(and the row) rides the locked mirror too on coarse tiles — it is the only input path a
touch screen has — and the body's padding keeps the CLI's own input line clear of it.

The one-row hoisted phone header, the keys drawer, the ニ sheet and the header's
`.ctrls` keys are all retired with this; `tiledrop.js` keeps only `isCoarse` and
`makeDrop`, the sheet primitives.

An iPad (coarse but wide) keeps the workbench; `trimBarForTouch` (`layout.js`) moves the
shape button to the end of the bar and drops the desktop scaffolding.

---

## Known drift

Recorded so nobody re-discovers it.

*Both entries that stood here are now fixed and have been removed — the un-gated ⛩
torii and the dead `.dc` row in the phone sheet. Nothing is outstanding.*

**The one thing worth knowing, because it is not drift but a deliberate overload:**
`.off` means two things by position. On a button or the dial it means INERT (dimmed,
still hoverable, guarded in its handler). On the connection `.dot` it is one of that
indicator's three states — `on` / `wait` / `off` — and means DISCONNECTED. No selector
crosses the two (`.tile-head button.off` cannot match a span), so this costs nothing
today; it would cost something the day the dot becomes a button.

---

## Where the code is

| Piece | File |
|---|---|
| the cell | `public/js/tile.js` |
| the header — the table, and the loops that build and sync it | `public/js/tilehead.js` |
| 🔒 the mirror | `public/js/termview.js` |
| 🔓 the tape render | `public/js/tapeview.js` |
| the socket | `public/js/tilewire.js` |
| the text entry | `public/js/composer.js` |
| the parked-parcel rule | `public/js/dvr.js` |
| dial, gauge, job menu, `setInert` | `public/js/widgets.js` |
| the hover help box | `public/js/tips.js` |
| chip, ladder, letter | `public/js/shingo.js` |
| ⚡ | `public/js/tilemacros.js` |
| メ — the desktop drop | `public/js/tilemore.js` |
| 📝 and 🏷 | `public/js/panels.js` |
| the phone's one row | `public/js/tiledrop.js` |
| the letter's role half | `src/tegami.ts` |
| who is plugged in | `src/routes/version.ts` |

Related: `docs/session-control-dials.md` · `public/js/README.md` · KOTOBA § COWORKSPACE,
§ SURFACES, § LADDER.
