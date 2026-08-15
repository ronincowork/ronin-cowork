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

| Control | Needs | When it is not there |
|---|---|---|
| ● connection dot | — | always |
| session picker | — | always |
| the mark (job) | — | always — see the note below |
| SHINGO chip + ladder | `michi` | chip hidden, ladder unreachable, never fetched |
| ⛩ torii (the letter) | `michi`'s route | **not gated** — see *Known drift* |
| ⛽ context gauge | — | always (hides when there is no reading) |
| 🎛 control dial | — | always |
| メ commons | — | always (individual tabs gate: `koe` · `counting` · `koshi`) |
| ⚡ macros | — | always |
| 🔒/🔓 lock | rireki's stream handler | inert and opaque; every tile born 🔒 and stays 🔒 |
| 🏷 groups | — | always |
| 📝 note | — | always |
| 🗑 kill | — | always |

**The mark is cowork's, even though it lives in the TEGAMI.** The letter has two halves with
different owners in one file (`src/tegami.ts`): cowork seeds the file at birth with
`session_job` already filled and reads the role back for the roster; **michi** owns the
ladder, `at`, `ladder_state`, `docs`, the SHINGO chip, `quietMs`, the `/tegami` routes and
the sweep. A role is set at birth and a ladder is not. So the `?` button works on a free
install; the chip beside it does not.

---

## The two views

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

**Lock is a property of a tile.** `S.locked` is only the default a *new* tile is born with.
It used to be one global, so flipping it reconnected all four at once. Touch is fixed
unlocked (`locked = !IS_TOUCH`) and the button is hidden there entirely — locked is a shit
show on a phone, where every scroll gesture round-trips through tmux copy-mode.

---

## The header, left to right

Built order (`public/js/tilehead.js`):

```
● │ [ session ▾ ] │ chip │ mark │ ←spacer→ │ メ ⛩ ⚡ 🔒 🏷 ⛽ 🎛 📝 🗑
```

Every control in this header says what it is on hover — **including while it is greyed out,
which is when you are most likely to be asking.** That is why the inert ones dim with a
class rather than with `disabled`: a disabled element fires no hover events, so its `title`
never appears (`setInert`, `public/js/widgets.js:134`).

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

Needs `michi`. `refreshTegami` (`public/js/tile.js:253`) checks `S.services` and simply does
not fetch when michi is absent.

### The mark — what this session is doing

The job button. Reads `session_job` off the session list, which carries it for every session.
Click it to change it: a popover of the `SESSION_JOBS.md` catalog, plus *not marked*, which
is a real state and stays reachable.

**`?` when nobody has said, not blank.** It was blank first, on the argument that a made-up
mark is worse than an empty square. That was wrong in the only way that counts: an empty
button is invisible among six others, so nobody learns there is a question to answer.

Setting it is a **re-label and nothing else** — no brief is re-sent, the dial is untouched.
It writes the same field the agent maintains with `write_tegami`, surgically: the
`session_job` value inside the fenced block changes and the ladder, `docs`, `at`, `objective`
and every key this version has never heard of survive byte for byte. The owner is simply the
other writer, for when an agent never re-marked itself or was redirected mid-flight.

`POST /api/sessions/:name/session_job` → 409 if the letter has no readable json block.

### メ The commons

⌃⇧C (⌃⌥C on Linux/Windows). Opens the CoWorking Commons over this tile — roster, new session,
wipeboard, project roots, hotwords. **A way in, not a close:** the session keeps streaming
behind the panel and ✕ on the tab strip comes back to it. Stopping viewing is the blank
option in the picker; killing is 🗑.

### ⛩ The torii — this session's letter

Opens the TEGAMI **verbatim** — the file as the agent left it, in a real scrollable,
selectable block. The chip and the ladder are an interpretation; this is the source, and
"what does this letter actually say" is the question you ask most often when the readout
looks wrong.

On **every** session, ladder or not. Read-only; the only thing that changes a letter is the
agent that owns it. Never both panels at once — opening the letter closes the ladder.

### ⚡ Macros

The fast path for `session_macros`. **It prefills and stops** — `+forkit: ` lands in the input
you are typing in, mid sentence, and you add your own words. It never runs anything. The
text it inserts is text you could have typed, so after a few uses you type it yourself,
including from a pane or a phone where no menu exists. A menu that executed would hide the
syntax forever.

Where the text lands, in precedence order: the composer's textarea (touch) → the parked
buffer (unlocked, shown in the strip) → `sendRaw` with no Enter (locked).

A macro marked `send:` is the exception — it fires and presses Enter for you, drawn as
`+name ⏎` with no trailing colon. Those carry a **120-second per-tile cooldown** and say
`· sent, wait Ns` rather than silently swallowing an impatient second tap.

The reference — browse everything, read the instruction — is the commons' macros tab,
deliberately a different surface.

### 🔒 / 🔓 The lock

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

The session's memberships, stored on the tmux session itself (`@ronin-tags`). The point is
**addressing, not decoration** — "the kojinsa group" resolves to a session list, so a
coordinator can be pointed at a set instead of at named members one by one. Agents resolve
the same names with `ronin_bin/tejun-group`. The button lights when the session is in any.

### ⛽ The context gauge

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

### 📝 Note

A post-it on the session. Lives on the tmux session itself as a user option — no separate
storage, gone when the session dies. The button lights when there is one.

### 🗑 Kill

Destroys the tmux session on the host, root plus its `grid_*` viewers. Confirms first, then
the tile detaches and returns to the commons.

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

## The phone

Touch collapses the whole header into **one row** (`public/js/tiledrop.js`):

```
⛩ ronin │ [ session ▾ ] │ メ │ ニ
```

**メ is this session** — Status, Ladder, TEGAMI, Macros, Groups, Note, Control, Kill.
**ニ is Ronin** — Keys, Home, New, Board, Pad. Everything else is terminal.

The controls in those sheets are **the same nodes, relocated, not cloned**, so every handler
already bound keeps working and the live widgets keep updating from their existing owners.
There is no second copy to keep in sync. The Status row is the only one that is not a door:
it is a reading, so it does not take a tap.

This needs exactly one tile to be honest — a tile header is per-tile and the app bar is
per-page — and `main.js` pins the ≤680px layout to a single terminal.

Desktop never calls any of this.

---

## Known drift

Recorded so nobody re-discovers it. **Neither is fixed by this document.**

1. **The ⛩ torii is not service-gated.** The chip checks `S.services` before fetching
   (`tile.js:257`); the torii does not (`tile.js:288`) and its route,
   `/api/sessions/:name/tegami/raw`, lives in **michi** (michi-api.ts, in the services
   repo). On a
   cowork-only install the button is present and opens a panel reading *"No letter on disk
   for this session yet"* — which is a fetch into a 404 dressed as an empty state, and the
   opposite of the opaque-and-inert rule.

2. **A dead row in the phone sheet.** `tiledrop.js:54` lists `['.dc', 'Detach']`, and no
   `.dc` button exists in the header any more. The loop skips what it cannot find, so the
   effect is silence, not a break — detaching on a phone is the blank option in the picker.

3. **A comment disagrees with the build order.** `tilehead.js:89-90` says the mark sits
   "before the ladder chip"; `select.after(chip.el)` puts the chip first. The chip is what
   you see beside the name.

---

## Where the code is

| Piece | File |
|---|---|
| the cell | `public/js/tile.js` |
| the header, built | `public/js/tilehead.js` |
| 🔒 the mirror | `public/js/termview.js` |
| 🔓 the tape render | `public/js/tapeview.js` |
| the socket | `public/js/tilewire.js` |
| the text entry | `public/js/composer.js` |
| the parked-parcel rule | `public/js/dvr.js` |
| dial, gauge, job menu, `setInert` | `public/js/widgets.js` |
| chip, ladder, letter | `public/js/shingo.js` |
| ⚡ | `public/js/tilemacros.js` |
| 📝 and 🏷 | `public/js/panels.js` |
| the phone's one row | `public/js/tiledrop.js` |
| the letter's role half | `src/tegami.ts` |
| who is plugged in | `src/routes/version.ts` |

Related: `docs/session-control-dials.md` · `public/js/README.md` · KOTOBA § COWORKSPACE,
§ SURFACES, § LADDER.
