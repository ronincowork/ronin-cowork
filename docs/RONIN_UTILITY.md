# RONIN_UTILITY — where everything is, and how the owner drives it

The quick answers for "where is…", "how do I…" and "what is this" about the coworkspace
itself. Answer from here; the fuller pages are one `ls` away in `docs/`.

## The pages

- **The landing** (`/`) has three doors: **Machine Settings** opens the Campaign page (this
  install's identity, desk profile, Routines and Installs, defaults and templates), **Coworks** opens the
  coworkspace, **New Project** opens the launch page for a fuller new Team or Agent.
- **The bar** on every page: two doors on the left, **Ronin** (the Campaign) and **Coworks**
  (the all-Teams page); the **place** in the middle, in italics — *Teams* on the Coworks page,
  *Your team: <name>* on a Team page — is a reading, not a button; on the right, **か New**
  for a quick new session, **⚙** for the cowork commons, and **2 ⇄ 4**, one button wearing
  the workspace count.
- **On a phone** the coworkspace is three steps: pick the Cowork, pick the Agent, drive it in
  a full-screen tile with the composer docked at the bottom.

## The workbench — one page format, three scopes

Every workbench is the same shape: a **selector column** (the roster: the Team commons card
first, then each Agent as a card, then ＋ Add team member) beside **two or four workspaces**.
A **workspace** is a numbered slot; a **surface** is what it holds. Select a workspace and
click a roster card, or drag the card onto any workspace, and that surface opens there; the
previous one is back in the column. An empty workspace says *Workspace*. Ronin remembers the
arrangement per page. The three scopes differ only in what the column offers:

| Workbench | Address | The column lists |
|---|---|---|
| **Campaign discovery workbench** | Machine Settings | the Campaign's own surfaces: configuration, project roots, Team roster, templates, Routines and Installs |
| **Cowork workbench** | Coworks | every Team in the Cowork, then the sessions on no team |
| **Team workbench** | a Team's page (`#/team/<name>`) | this Team's commons card and its members |

| Surface | What it is for |
|---|---|
| **terminal tile** | one Agent: its live terminal, composer, Output selector, Control dial, work record |
| **team commons** | this team: **Docs** (what agents listed, plans, docs by project root) · **Wipeboard** · **Agent Message Queue** · **Team Configuration** (the team's Routines, kit, launch defaults) |
| **cowork commons** (⚙) | this install and owner: usage stats · **Account** (Configuration · Appearance · Release & update · Hotwords · Koshi · gbrain · Log out) · Desk profile · Project roots · Archived · Help desk · Keypad |
| **campaign commons** | the Campaign: Campaign · Project roots · Team roster · Templates · **Routines and Installs** (what is on the machine, and the switchboard that fills new teams) |
| **new session** | the launcher, placed by か New or ＋ Add team member; the newborn lands in that workspace |

**Where to send the owner:** teams → the **Coworks** door · settings, account, look, updates
→ **⚙ → Account** · which Routines a team runs → **Team Configuration**; for new teams, the
Campaign's **Routines and Installs** · project roots and templates → the campaign commons · a fuller new
Agent or Team → **New Project** on the landing · a quick session → **か New**.

## The tile head — the buttons, left to right

| Button | What it does |
|---|---|
| **⛩** | edit this Agent's title (the session name beside it never changes) |
| **View Work Record** | the Agent's own account: repositories, current action, the ladder |
| **Output** | which view this tile shows — **Locked** is the live terminal; the record-fed views (Terminal Mirror, Detailed, Condensed, Cherry Pick, Agent Summary) arrive with Ronin Services and are absent on the free build |
| **@** | mention another session — picks a name into the message box |
| **⚡** | this session's macros: pick one and `+name:` lands in the input for the owner to finish. A macro marked **⏎** is a `send:` macro — it is typed and sent at once, then rests 120 seconds on that tile |
| **メ** | the drop: the rest of the head, in one strip — **⛽** context gauge (how full the session's context window is, read off its own status line; hidden until there is a reading) · **🎛** Control dial (**👤** owner only · **👁** outside agents may watch · **🤖** outside agents may type; only the owner turns it) · **📄** this Agent's tracked docs, opened over the tile · **📝** session note · **🗑** kill the session and its viewers |

## Locked and Unlocked

**🔒 Locked** is the attached live terminal — the real `tmux` screen, rendered by a terminal
emulator. Scrollback stays on the server, so wheel-scrolling round-trips through tmux; the ↓
pill returns to the bottom, and typing while scrolled up does nothing until you are back
at the bottom or press Escape. The free build offers Locked only.

**🔓 Unlocked** views hold no terminal connection at all: they are RIREKI's record, rendered
client-side as plain text — lower latency, a proper scrolling view, and ordinary copy and
paste. They arrive with Ronin Services; a locked tile is not "broken" when they are absent.

## Copy and paste

- **Copying from a Locked tile:** hold **Shift** while dragging (**Option** on a Mac), then
  copy as usual (Ctrl+C / ⌘C). Without the key the running app takes the drag as mouse input
  and nothing is selected. The selection is captured the moment it is made, so a repaint
  that clears the highlight does not lose it.
- **Copying from an Unlocked view** is ordinary text selection.
- **Pasting** goes into **the composer**, the box under the tile: Enter sends, Shift+Enter
  (Option+Enter on a Mac) makes a new line, the mic dictates into it, ✕ clears it. It is
  separate from the terminal's own input. On touch, the **Keys** row beside it sends what a
  keyboard would — Esc · ^C · ⌫ · ^U · ⇧Tab · the arrows — straight to the session.

## Feedback

The **Feedback** button sends the owner's words to the Ronin team: what they like, what they
want added, how they use Ronin, and a comment. When the owner voices a wish, a complaint or a
"how do I", answer, then point them there. Their experience is what shapes the next release.
