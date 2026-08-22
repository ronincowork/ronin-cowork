# KOTOBA_GLOSSARY — the house words in plain English

> **Companion to `KOTOBA.md`, which is the source of truth.** KOTOBA holds every noun with
> its scope and its record. This file answers one narrower question: **what do we call this
> when a user is looking at it?**
>
> **The rule: if the UI already has an English word, that word wins. Nothing is coined
> here.** Where a word is missing or two collide, it goes to § OPEN for @kotoba to rule —
> never filled in on the spot.
>
> Two audiences, one file. An agent writing a tooltip, a doc or site copy looks here. So
> does anyone wondering whether a Japanese name is allowed to reach a user's face. (Mostly:
> no.)
>
> **Counted lists drift; this file no longer carries counts.** "The seven" session jobs
> here missed four; KOTOBA's own "the ten" heading missed one. Where a set lives in a
> catalog, the catalog is the count.

## Where the Japanese stops

From KOTOBA: **Ronin is the product name and goes everywhere.** Our internal system names —
**TEJUN · MICHI · TEGAMI · SHINGO · RIREKI · OBOERU · TOMODACHI · SOROBAN · KOSHI · KOE ·
DAIKUSAN · KOTOBA · AGERU · JUSHO · BYOIN · SETTEI · KYOKAI** — **stay ours.** Useful shorthand between us; a translation tax
on anyone else.

**The list is KOTOBA's.** This file quotes it verbatim and may never carry a name KOTOBA
does not have — two divergent copies is how a closed set stops being closed, and
`check-kotoba` holds the two lists identical.

**Words a user or their agent works with are plain English.** Nothing a third party must
learn in order to use Ronin should cost them a second language first.

---

## § THE SPACE — what a person is looking at

| House term | Plain English | One line |
|---|---|---|
| Ronin | **Ronin** | The product. The one word anyone learns on purpose. |
| `coworkspace` | **the coworkspace** | The whole UI — every tile, panel, tab and button in it. Say *the coworkspace* for the lot, *a tile* for one cell, *the commons* for a tile with no session in it. |
| tile | **tile** | One cell of the coworkspace, showing one session. The public word for the terminal you look at. |
| ~~pane~~ | **tile** | **Not a house word — tmux's, retired from ours** (owner, 2026-08-22). A pane exists only inside the tmux server (the thing `pipe-pane` attaches to); everything OURS that touches or shows one — browser and backend alike — is the **tile**. The word survives only where tmux's own object is literally the subject (the recorder pipes *a pane*). Our code that misnamed its own structures pane is being swept (OPEN_THREADS 4.33). |
| session | **session** | One agent, one job, one name. Keeps running when you close the tab. |
| agent | **agent** | The CLI in a tile — `claude`, `codex`, `pi`, a shell script. |
| `session_commons` | **the commons** | The shared surface inside a tile when no session is showing — one per tile, and about sessions. Already plain English. (Was `coworking_commons` until 2026-08-18.) |
| `admin_desk` | **the desk** | What a tile shows when you ask it for the machine instead of a session — everything about this install and this app, behind ⚙. Say *the desk*, or just ⚙. Never "the install commons": a commons is about sessions; a desk is about the machine. |
| `commons_tab` | **tab** | One section of the commons, reached from its tab strip. Say *the Roster tab*, *the Docs tab*. **Never "pane" or "panel"** — pane is tmux's word, and panel adds a second word for a tab. A row on the desk is not a tab. |
| `cowork_setup` | **cowork setup** | The one-time surface that shapes a new coworkspace before it opens. In code and house documents always write `cowork_setup`; never bare *setup*, *setup page*, or *first run*. |
| locked 🔒 / unlocked 🔓 | **Locked / Unlocked** | Locked: this view is attached to the live session. Unlocked: the session is still running, this view is not attached to it. |

## § THE TABS — the commons' rooms

| House term | Plain English | One line |
|---|---|---|
| `session_roster` | **the roster** | The **⌂ Roster** tab: every session on the machine. The session list, full stop. **Never "the board."** |
| `session_launch` | **launch** | The **＋ New** tab. Where a session is born. |
| `job_class` | **job group** | A shelf you invent to organize the ＋ New board's session jobs; a job may sit on several. The surface says *job group* (＋ add new); `job_class` is the internal name and never reaches a user's face. **Not the roster's Groups** — those address sessions; a job group addresses nothing (KOTOBA § LAUNCHER). |
| `wipeboard` | **wipeboard** | The **▤ Wipeboard** tab and the file behind it. Our own coinage and it stays — *wipe* is right for a surface many hands write on and erase. Alias **whiteboard** only, because voice-to-text hears it that way. **Never "the board."** |
| Brief | **Brief** | Your statement of what a wipeboard is for. Agents never edit it. |
| `MDEDIT` | **the Docs tab** | The **▧ Docs** tab: the documents each session is working on, opened and edited in the tile. **MDEDIT is ours and never reaches a user's face**; on screen it is just *Docs*. Say *list a doc*, never *track* or *attach*. There is no file browser by design — ask the session to show you a file (`+show_file`). |
| SETTEI (設定) | **Configuration** *(the tab)* · **your settings** *(the things in it)* | What you have set about how your Ronin behaves. **SETTEI never reaches a user's face**; the tab says **⚙ Configuration** (owner, 2026-08-18 — "Setup" read as the act, and the room is a standing statement). |
| — | **Hotwords** | The words dictation keeps mishearing, sent with your voice. The **tab** is coworkspace like every UI surface; `src/services/koe/hotwords.ts` and the stock list belong to **KOE**. |
| KOSHI | ⚠ **see § OPEN 1a** | Ronin's own agents, doing the house's internal jobs. **Reaches a user's face today** — the `目 Koshi` tab, `↻ Restart Koshi`, and body copy calling it *"your AI admin"*. |
| `project_root` | **project root** | A folder on the machine Ronin is allowed to work in. |
| `inclusion_list` | **the project root list** | Which folders those are. Ships empty. |
| `user_customization` | **your own macros and jobs** | The recipes you write to extend what Ronin can do. Distinct from settings: **you set a setting, you write a recipe.** |
| ▦ keypad | **Pad** | Physical keys wired to macros. Optional hardware. |

## § THE CONTROLS ON A SESSION

| House term | Plain English | One line |
|---|---|---|
| dial (`@ronin-control`) | **Control** | Per session: you-only 👤, read 👁, read-and-write 🤖. Only the owner flips it. |
| tag / group (`@ronin-tags`) | **Groups** | Labels used to address a set of sessions at once. The addressing kind — not the ＋ New board's *job groups*. |
| note (`@ronin_note`) | **Note** | The owner's one line about a session. |
| `session_job` (in the letter) | **what it's doing** | The job's icon, drawn beside every session in the roster and the tile picker. Set at launch; the session changes it itself as its work changes. |
| — | **Status · Ladder · Macros · Detach · Kill session** | The rest of the per-session menu. Already plain. |

## § PROGRESS AND HISTORY

| House term | Plain English | One line |
|---|---|---|
| MICHI (道) | **ladder** | Ruled in KOTOBA: never say MICHI to a user. The UI says Ladder. |
| ladder | **ladder** | What a session has done, is doing, and knows is next. |
| rung · leg · phase · gate | **rung · leg · phase · gate** | One line on the ladder; a unit of work; a group of them; a stop waiting on someone. **Leg stays** — no rename to *step*, which is `tejun-step` (position in a macro run). |
| undetermined | — | Not rendered at all. The ladder never guesses ahead. |
| SHINGO (信号) | *(no user word)* | The ladder shown on a tile header. A user sees the ladder, not a name. |
| TEGAMI (手紙) | ⚠ **none — see § OPEN 1** | The one file a session keeps about its own work. Still reaching a user's face. |
| RIREKI (履歴) | ⚠ **two words on screen — see § OPEN 6** | Everything a pane printed, written to disk as it happens. The tape view says *the recording*; the Services card says *Readable transcripts*. One must win. |
| OBOERU (覚える) | **memory** | Notes that outlive the session that wrote them. |
| TOMODACHI (友達) | **Stats** | What your sessions have been doing — counts, not content. **Ruled 2026-08-22:** every surface says *Stats*; the internal spelling is `cowork_stats`; the card's "Usage statistics" is renamed. TOMODACHI never reaches a user's face. |

## § HOW WORK IS ASKED FOR

| House term | Plain English | One line |
|---|---|---|
| TEJUN (手順) | **macros** | The UI says Macros. A user never needs the word TEJUN. |
| macro | **macro** | A saved instruction you would otherwise have typed to your agent. |
| invocation | **typing a macro** | `+name: what you want`. That is the whole syntax. |
| `session_job` | ⚠ **none settled — see § OPEN 2** | What a session is doing now. The values read plainly on their own (RiffOnIt, CutCode, CheckWork, …); the *category* has no user word. The set lives in `ronin_catalogs/SESSION_JOBS.md` — the catalog is the count. |
| forkit | **fork** | Split the current topic into its own session. |
| harakiri | **harakiri** | A session ends itself. Kept — it is a word people know. |

## § THE DOOR OUT

| House term | Plain English | One line |
|---|---|---|
| AGERU (上げる) | *(no user word — the surfaces say what they do)* | The one door out: nothing leaves except through it and the model provider. **The door is live in cowork** — one allowlisted client, the egress record, the Services activation and stats sends. The review-outbox surface is still to come **[planned]**. The name stays ours. |
| `packet_kind` | **Usage counts · Feedback · Macro submission** | The three things that can be sent. The JSON says `tomodachi` / `kansou` / `tejun`; **a user never sees those three words.** |
| `ageru_packet` | **what gets sent** | Shown in full before anything leaves, and kept afterwards. Never *your data*, never *diagnostics*, never *telemetry* — it is a file, and the sentence should say so. |
| `egress_log` | **where Ronin has connected** | Every outbound request Ronin ever made, model providers included. The honest answer to "does this thing phone home", which is a list, not a promise. |
| KOE (声) | *(the name stays ours)* | Voice, both directions. **Dictation in is live** — the mic on a tile goes through `/api/transcribe` with your Hotwords attached. Spoken summaries back are not built **[planned]**. What a user meets is the mic and the **Hotwords** tab. |

## § WHAT IS SOLD

Base Ronin is open source. The rented capabilities on top are **`ronin_service`**, alias
**Services** — owner-ruled 2026-08-10.

| House term | Plain English | One line |
|---|---|---|
| `ronin_service` | **Services** | A rented capability on top of base Ronin: a folder, plus optionally a long-running process that reads files base already writes. Base never imports one. |

**Never** *module* (the client is built of ES modules) · *plug-in* (OpenClaw's kojinsa-tools and
skinner) · *extension* (two live bind-mounted directories) · *applet* (RIREKI's recorder is
one). All four are taken elsewhere in this environment. *add-on* is free and is the fallback.

**What the Services card sells, in its own words** — by this file's rule those UI words win,
and each maps to a house name:

| On the card | House machinery |
|---|---|
| **Live status ladders** | MICHI + SHINGO + koshi |
| **Readable transcripts** | RIREKI — see § OPEN 6 for the word |
| **Stats** | TOMODACHI + SOROBAN (`cowork_stats` — ruled 2026-08-22, was "Usage statistics") |
| **Voice** | KOE |
| **gbrain** | gbrain — a proper name, the vendor's, credited on the card |

---

## § NOT TRANSLATED, DELIBERATELY

A user never meets these, so they never need an English word. Listed so nobody helpfully
translates one and creates a second vocabulary.

**Counting:** SOROBAN · tally · gauge · census · ledger · diff · derived · drop · install id
**The recording machinery:** r_tape · r_scroll · recorder · ring · settler · decoder · lens ·
faucet A / faucet B *(r_tape and r_scroll are RIREKI's two durable artifacts — there is no
r_render; the tile's paint is ephemeral)*
**Files and layout:** DAIKUSAN · system_scope · user_scope · session_scope · the upgrade
test · shadowing · the session directory · build-out doc · handoff · `landed/`
**Plumbing:** shim · control-check · viewer session · scrape · compile · step tracker ·
`session_macro` · `workspace_macro` · one-way flow
**Ours only:** KOTOBA · KOSHI · SHINGO · BUNKAI · KYOKAI · `ronin_repo` · dohyo

---

## § RULED — standing rulings, one line each

- **tile beats pane everywhere a person reads** (2026-08-10, strengthened 2026-08-13):
  *pane* is legal only where tmux's own mechanism is the subject of the sentence.
- **`coworkspace` is the whole UI** (2026-08-13) — every surface, tile, panel and button.
  A coworkspace holds tiles; a tile with no session holds the commons.
- **KOSHI is the umbrella for Ronin's own agents** (2026-08-13) — internal by definition:
  the owner never sets one up, which is what separates a koshi from an `agent`.
- **KOE is the noun for the whole voice surface** (2026-08-13); `koshi_koe` is the worker.
- **AGERU is the one door out, and it ships in cowork, not services** (2026-08-13) — the
  free user is the one whose feedback we most want.
- **A submitted macro is open source, and that is the whole deal** (2026-08-13) — an
  irrevocable MIT grant, no exclusivity, no payment; the sentence renders beside the tick.
- **Identity is never shared across `packet_kind`s** (2026-08-13) — install id, reply
  contact and attribution handle: three fields, three lifetimes, no join.
- **`UCHI` is retired; the word is `commons`** (2026-08-13).
- **legs stay** (2026-08-10) — no rename to *step*; *step* is `tejun-step`.
- **harakiri stays** (2026-08-10) — a word people already know.
- **`session_job` is the surviving term** (2026-08-10) — `agent_role` is dead; a single
  common word is not a term.
- **`ronin_service`, alias Services, is the paid unit** (2026-08-10) — never module,
  plug-in, extension or applet.
- **There is no bare "board"** (2026-08-10) — the roster and the wipeboard, and neither
  may be aliased to *board*.
- **The internals say `job_class`; the surface says "job group"** (2026-08-21) — `group`
  is the roster's addressing word and stays unambiguous; KOTOBA § LAUNCHER is the one
  place the split is told.
- **pane is retired from house vocabulary entirely** (2026-08-22) — tmux's word for
  tmux's own object, nothing more; our representations, browser and backend, are the
  tile. Code sweep: OPEN_THREADS 4.33.
- **RIREKI's durable artifacts spell with its initial: `r_tape` and `r_scroll`**
  (2026-08-22) — and there is no r_render; the tile's paint is ephemeral.
- **TOMODACHI's surface unifies on `cowork_stats`, alias "Stats"** (2026-08-22) — every
  surface says Stats; "Usage statistics" is renamed.

## § OPEN — @kotoba rules, nothing coined here

1. **TEGAMI has no English word.** `public/js/tiledrop.js` labels a menu row `TEGAMI`, and
   `public/js/tile.js`'s tooltip reads *"Read this session's TEGAMI."* The obvious word —
   *Note* — is taken by `@ronin_note`. Two different things, one candidate.

1a. **KOSHI's English word may already exist, on screen, unnoticed: "your AI admin"**
   (`commons.js`). This file's own rule is *the UI's word wins*, and that is a UI word,
   written by us, in front of a user today. Recommend ruling **AI admin** in rather than
   inventing anything. Nothing coined, only noticed.

2. **`session_job` has no user word for the category.** The values are fine; the *class*
   has none, so the launcher describes it (*"pick what it is for"*). That may be correct —
   worth ruling it correct rather than leaving it unnoticed.

3. **Run this list against real co-working vocabulary** (owner). Where a real co-working
   word exists for a thing we have, take it — **but only where the mechanism matches.**
   *Notice board* matches a wipeboard; *the room* does not — it implies everyone hears
   everything, which is exactly what we do not do.

4. **Retired words have nowhere to live, and a planned checker expects a list.**
   KOTOBA's housekeeping rule says retired words are deleted, not annotated (git holds the
   history) — but a checker that catches a retired word needs a list of them. Either the
   rule gains an exception for a machine-read list, or `check-kotoba` reads git. Changes a
   housekeeping rule; not decidable here.

5. **`<service>_connected/` needs a home** (owner raised, 2026-08-20). The boot shelf's
   connected level is signed by the service that seeds it (`gbrain_connected/`), and the
   launcher's toggle already reads **gbrain on/off** — the name educates because it says
   WHAT is connected. To rule: does the *pattern* get a glossary row, and does the
   SETTEI-scope service switch need a distinct on-screen word from the per-session toggle?

6. **RIREKI has two user words on screen** (found 2026-08-22). The tape view's *the
   recording* vs the Services card's *Readable transcripts*. This file's rule cannot pick
   between two UI words — @kotoba rules it. Until ruled, each surface keeps its own word
   and neither spreads. *(TOMODACHI's half of this item was ruled the same day:
   `cowork_stats`, alias Stats — see § RULED.)*
